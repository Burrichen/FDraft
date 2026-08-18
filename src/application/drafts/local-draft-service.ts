import {
  fetchLocalChallengeCandidates,
  fetchLocalChallengeWatchedFilms,
} from "@/application/drafts/local-fetch-context";
import {
  awardDraftCompletionReward,
  resolveDraftCompletionReward,
} from "@/application/events/draft-completion-reward";
import { challengeRegistry } from "@/domain/challenges/catalogue";
import {
  attemptChosenChallenges,
  type ChosenChallengeSlotResult,
} from "@/domain/challenges/choose";
import {
  generateChallengeFilms,
  type GenerateChallengeFilmsResult,
} from "@/domain/challenges/generate";
import {
  DEFAULT_CHALLENGE_ENGINE_CONFIG,
  type ChallengeContext,
  type ChallengeResult,
} from "@/domain/challenges/types";
import { calculateDraftDeadline } from "@/domain/drafts/deadline";
import {
  FREEFORM_BATCH_SIZE,
  getFilmCount,
  isFreeform,
} from "@/domain/drafts/difficulty";
import { calculateFreeformRank } from "@/domain/drafts/freeform";
import type { DraftConfigInput } from "@/domain/drafts/schemas";
import { resolveEligibleCandidates } from "@/domain/events/event-eligibility";
import { getEventDefinition } from "@/domain/events/event-registry";
import { GENERIC_POINT_CURRENCY } from "@/domain/events/point-currency";
import { defaultIdGenerator, type IdGenerator } from "@/domain/shared/id";
import { createDefaultRng, type Rng } from "@/domain/shared/rng";
import { pickRandomFilms } from "@/domain/watchlist/random-pick";
import { SystemClock, type Clock } from "@/domain/time/clock";
import type { DraftRepository } from "@/repositories/draft-repository";
import type { FilmRepository } from "@/repositories/film-repository";
import type { HistoryRepository } from "@/repositories/history-repository";
import type { PointsRepository } from "@/repositories/points-repository";
import type {
  DraftItemRecord,
  DraftPostmortemResponseRecord,
  DraftRecord,
  PostmortemResponseType,
} from "@/repositories/records";
import type { SettingsRepository } from "@/repositories/settings-repository";
import type { WatchlistRepository } from "@/repositories/watchlist-repository";

type DraftRepos = {
  watchlist: WatchlistRepository;
  films: FilmRepository;
  drafts: DraftRepository;
  history: HistoryRepository;
};
type LifecycleRepos = {
  drafts: DraftRepository;
  watchlist: WatchlistRepository;
  history: HistoryRepository;
  points: PointsRepository;
  settings: SettingsRepository;
};

export type CreateLocalDraftErrorCode =
  "already_active" | "empty_watchlist" | "not_enough_films" | "unknown";
export type CreateLocalDraftOutcome =
  | { ok: true; draftId: string; challengeWarning: string | null }
  | { ok: false; error: CreateLocalDraftErrorCode; message: string };

function describeChallengeShortfall(
  pendingInteractionCount: number,
  unfulfilledCount: number,
): string | null {
  const parts: string[] = [];
  if (pendingInteractionCount > 0) {
    parts.push(
      `${pendingInteractionCount} challenge${pendingInteractionCount === 1 ? "" : "s"} need${pendingInteractionCount === 1 ? "s" : ""} your input`,
    );
  }
  if (unfulfilledCount > 0) {
    parts.push(
      `${unfulfilledCount} challenge slot${unfulfilledCount === 1 ? "" : "s"} couldn't be filled right now`,
    );
  }
  return parts.length > 0 ? `${parts.join(" and ")}.` : null;
}

/**
 * Local port of `src/lib/drafts/create-draft.ts`'s `createDraft` — same
 * algorithm, same call into the same challenge engine
 * (`generateChallengeFilms`/`attemptChosenChallenges`), just reading/writing
 * through `Repositories` instead of a Supabase client and a Postgres RPC.
 *
 * The one structural difference: `create_draft`'s atomicity (the insert
 * plus the `one_active_draft_per_user` uniqueness check happening in one
 * transaction) becomes a plain check-then-act here. That's a real,
 * documented gap for a hypothetical two-tabs-open race — acceptable for a
 * single-profile, single-tab local-first app the same way
 * `markLocalFilmWatched`'s doc comment already accepts it, but a genuine
 * concurrent-write guarantee would need an actual `Dexie.transaction(...)`
 * wrapping the read-check-write, which is a reasonable next hardening step
 * rather than a Prompt 9.5A requirement.
 */
export async function createLocalDraft(
  repos: DraftRepos,
  params: {
    profileId: string;
    timezone: string;
    config: DraftConfigInput;
    /** The event that generated this draft, if any — `undefined`/omitted for a normal draft (see `DraftRecord.sourceEventId`). When set, the candidate pool is narrowed through that event's own `eligibilityRules` first (see `resolveEligibleCandidates`). */
    sourceEventId?: string | null;
    /**
     * Whether `sourceEventId` was manually enabled at this exact moment
     * (see `DraftRecord.sourceEventManuallyEnabled`) — the caller (which
     * already reads `EventSettings` to resolve `sourceEventId` itself)
     * captures this once, here, so a later settings change can never
     * retroactively change which currency this draft's eventual completion
     * awards. Ignored entirely when `sourceEventId` is absent; omitted for
     * a call site that hasn't been updated for this falls back to `null`,
     * which `resolveDraftCompletionReward` treats as "re-derive from
     * current settings," the exact pre-Phase-10 behaviour.
     */
    sourceEventManuallyEnabled?: boolean | null;
  },
  deps: { idGenerator?: IdGenerator; clock?: Clock; rng?: Rng } = {},
): Promise<CreateLocalDraftOutcome> {
  const idGenerator = deps.idGenerator ?? defaultIdGenerator;
  const clock = deps.clock ?? new SystemClock();
  const rng = deps.rng ?? createDefaultRng();
  const { profileId, timezone, config } = params;

  if (await repos.drafts.hasActiveDraft(profileId)) {
    return {
      ok: false,
      error: "already_active",
      message:
        "You already have an active draft. Finish or expire it before starting another.",
    };
  }

  const rawCandidates = await fetchLocalChallengeCandidates(repos, profileId);
  if (rawCandidates.length === 0) {
    return {
      ok: false,
      error: "empty_watchlist",
      message:
        "Your watchlist is empty — import some films before creating a draft.",
    };
  }

  // Event-owned drafts (see docs/product-spec.md, event system Phase 6)
  // narrow the candidate pool through their own `eligibilityRules` —
  // entirely data-driven, no event id/name checked here (see
  // `resolveEligibleCandidates`). A normal, non-event draft, or an event
  // with no eligibility restriction configured (e.g. Halloween today —
  // no curated data exists for it yet), gets the exact same unrestricted
  // pool as before this existed. A restriction that filters the pool
  // down to fewer films than the draft needs surfaces through the same
  // `not_enough_films` check just below — no separate error path needed.
  const event = params.sourceEventId
    ? getEventDefinition(params.sourceEventId)
    : null;
  const candidates = event
    ? resolveEligibleCandidates(rawCandidates, event.eligibilityRules)
    : rawCandidates;

  const freeform = isFreeform(config.difficulty);
  const totalFilms = freeform
    ? Math.min(FREEFORM_BATCH_SIZE, candidates.length)
    : getFilmCount(config.difficulty);
  const randomCount = freeform ? totalFilms : (config.randomCount ?? 0);
  const challengeCount = freeform ? 0 : (config.challengeCount ?? 0);

  if (candidates.length < randomCount) {
    return {
      ok: false,
      error: "not_enough_films",
      message: `This draft needs at least ${randomCount} active watchlist films for its random selection (you have ${candidates.length}).`,
    };
  }

  const now = clock.now();
  const deadlineAt = calculateDraftDeadline({
    timeMode: config.timeMode,
    startedAt: now,
    timezone,
  });

  const randomPickIds = pickRandomFilms(
    candidates.map((candidate) => ({
      id: candidate.watchlistEntryId,
      weight: candidate.selectionWeight,
    })),
    randomCount,
    rng,
  );
  const randomPickIdSet = new Set(randomPickIds);
  const candidateByEntryId = new Map(
    candidates.map((candidate) => [candidate.watchlistEntryId, candidate]),
  );
  const remainingCandidates = candidates.filter(
    (candidate) => !randomPickIdSet.has(candidate.watchlistEntryId),
  );

  const draftId = idGenerator.generate();
  const draft: DraftRecord = {
    id: draftId,
    profileId,
    difficulty: config.difficulty,
    timeMode: config.timeMode,
    status: "active",
    totalFilms,
    randomFilmCount: randomCount,
    challengeFilmCount: challengeCount,
    challengeMode: config.challengeMode ?? null,
    startedAt: now.toISOString(),
    deadlineAt: deadlineAt.toISOString(),
    timezone,
    completedAt: null,
    freeformAchievedRank: null,
    sourceEventId: params.sourceEventId ?? null,
    sourceEventManuallyEnabled: params.sourceEventId
      ? (params.sourceEventManuallyEnabled ?? null)
      : null,
    rewardsGrantedAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  await repos.drafts.createDraft(draft);

  let orderIndex = 0;
  const randomItems: DraftItemRecord[] = randomPickIds.map((entryId) => {
    const candidate = candidateByEntryId.get(entryId)!;
    return {
      id: idGenerator.generate(),
      draftId,
      filmId: candidate.filmId,
      watchlistEntryId: entryId,
      source: "random",
      challengeId: null,
      challengeAttemptId: null,
      challengeDisplayValue: null,
      orderIndex: orderIndex++,
      isCompleted: false,
      completedAt: null,
      watchedHistoryId: null,
      createdAt: now.toISOString(),
    };
  });
  await repos.drafts.createItems(randomItems);

  let challengeWarning: string | null = null;
  if (!freeform && challengeCount > 0) {
    const watchedFilms = await fetchLocalChallengeWatchedFilms(
      repos,
      profileId,
    );
    const engineContext: Omit<ChallengeContext, "previousPicks"> = {
      rng,
      now,
      candidates: remainingCandidates,
      watchedFilms,
      config: DEFAULT_CHALLENGE_ENGINE_CONFIG,
      ...(config.manualGenre
        ? { manualSelections: { genre: config.manualGenre } }
        : {}),
    };

    const outcome =
      config.challengeMode === "choose" && config.chosenChallengeIds?.length
        ? await persistChosenChallengeResults(
            repos,
            { draftId, idGenerator, clock, startingOrderIndex: orderIndex },
            attemptChosenChallenges({
              registry: challengeRegistry,
              chosenChallengeIds: config.chosenChallengeIds,
              context: engineContext,
            }).results,
          )
        : await persistGeneratedChallengeFilms(
            repos,
            { draftId, idGenerator, clock, startingOrderIndex: orderIndex },
            generateChallengeFilms({
              registry: challengeRegistry,
              slotCount: challengeCount,
              context: engineContext,
            }),
          );

    challengeWarning = describeChallengeShortfall(
      outcome.pendingInteractionCount,
      outcome.unfulfilledCount,
    );
  }

  return { ok: true, draftId, challengeWarning };
}

interface PersistOutcome {
  filledCount: number;
  pendingInteractionCount: number;
  unfulfilledCount: number;
}

async function logAttempt(
  repos: DraftRepos,
  params: {
    draftId: string;
    challengeId: string;
    attemptNumber: number;
    result: ChallengeResult;
    idGenerator: IdGenerator;
    clock: Clock;
  },
): Promise<void> {
  const { result } = params;
  await repos.drafts.createChallengeAttempt({
    id: params.idGenerator.generate(),
    draftId: params.draftId,
    challengeId: params.challengeId,
    attemptNumber: params.attemptNumber,
    status: result.status,
    reason: "reason" in result ? result.reason : null,
    candidateFilmId: result.status === "success" ? result.film.filmId : null,
    createdAt: params.clock.now().toISOString(),
  });
}

async function insertChallengeItems(
  repos: DraftRepos,
  params: {
    draftId: string;
    idGenerator: IdGenerator;
    clock: Clock;
    startingOrderIndex: number;
  },
  items: {
    watchlistEntryId: string;
    filmId: string;
    challengeId: string;
    displayValue: Record<string, unknown> | undefined;
  }[],
): Promise<void> {
  if (items.length === 0) {
    return;
  }
  const now = params.clock.now().toISOString();
  const records: DraftItemRecord[] = items.map((item, index) => ({
    id: params.idGenerator.generate(),
    draftId: params.draftId,
    filmId: item.filmId,
    watchlistEntryId: item.watchlistEntryId,
    source: "challenge",
    challengeId: item.challengeId,
    challengeAttemptId: null,
    challengeDisplayValue: item.displayValue ?? null,
    orderIndex: params.startingOrderIndex + index,
    isCompleted: false,
    completedAt: null,
    watchedHistoryId: null,
    createdAt: now,
  }));
  await repos.drafts.createItems(records);
}

async function persistChosenChallengeResults(
  repos: DraftRepos,
  ctx: {
    draftId: string;
    idGenerator: IdGenerator;
    clock: Clock;
    startingOrderIndex: number;
  },
  results: ChosenChallengeSlotResult[],
): Promise<PersistOutcome> {
  const items: {
    watchlistEntryId: string;
    filmId: string;
    challengeId: string;
    displayValue: Record<string, unknown> | undefined;
  }[] = [];
  let pendingInteractionCount = 0;
  let unfulfilledCount = 0;

  for (const { challengeId, result } of results) {
    await logAttempt(repos, {
      draftId: ctx.draftId,
      challengeId,
      attemptNumber: 1,
      result,
      idGenerator: ctx.idGenerator,
      clock: ctx.clock,
    });

    if (result.status === "success") {
      items.push({
        watchlistEntryId: result.film.watchlistEntryId,
        filmId: result.film.filmId,
        challengeId,
        displayValue: result.displayValue,
      });
    } else if (result.status === "requires_user_choice") {
      const now = ctx.clock.now().toISOString();
      await repos.drafts.createInteraction({
        id: ctx.idGenerator.generate(),
        draftId: ctx.draftId,
        challengeId: result.interactionId,
        status: "in_progress",
        state: result.payload as unknown as Record<string, unknown>,
        resultingWatchlistEntryId: null,
        createdAt: now,
        updatedAt: now,
      });
      pendingInteractionCount++;
    } else {
      unfulfilledCount++;
    }
  }

  await insertChallengeItems(repos, ctx, items);
  return {
    filledCount: items.length,
    pendingInteractionCount,
    unfulfilledCount,
  };
}

async function persistGeneratedChallengeFilms(
  repos: DraftRepos,
  ctx: {
    draftId: string;
    idGenerator: IdGenerator;
    clock: Clock;
    startingOrderIndex: number;
  },
  generated: GenerateChallengeFilmsResult,
): Promise<PersistOutcome> {
  for (const attempt of generated.attempts) {
    await repos.drafts.createChallengeAttempt({
      id: ctx.idGenerator.generate(),
      draftId: ctx.draftId,
      challengeId: attempt.challengeId,
      attemptNumber: attempt.attemptNumber,
      status: attempt.status,
      reason: attempt.reason ?? null,
      candidateFilmId: attempt.selectedFilmId ?? null,
      createdAt: ctx.clock.now().toISOString(),
    });
  }

  await insertChallengeItems(
    repos,
    ctx,
    generated.slots.map((slot) => ({
      watchlistEntryId: slot.film.watchlistEntryId,
      filmId: slot.film.filmId,
      challengeId: slot.challengeId,
      displayValue: slot.displayValue,
    })),
  );

  return {
    filledCount: generated.slots.length,
    pendingInteractionCount: 0,
    unfulfilledCount: generated.unfulfilledSlotCount,
  };
}

/**
 * Local port of `expire_draft_if_due` (see
 * `supabase/migrations/20260810001500_expiry_postmortem_functions.sql`).
 * Called on every "open the active draft" read, exactly like the Supabase
 * version — there is no background worker here either, local-first or not.
 */
export async function expireLocalDraftIfDue(
  repos: { drafts: DraftRepository },
  params: { profileId: string; draftId: string },
  deps: { clock?: Clock } = {},
): Promise<boolean> {
  const clock = deps.clock ?? new SystemClock();
  const draft = await repos.drafts.getById(params.profileId, params.draftId);
  if (!draft || draft.status !== "active") {
    return false;
  }
  if (clock.now().getTime() < new Date(draft.deadlineAt).getTime()) {
    return false;
  }
  await repos.drafts.updateDraft({
    ...draft,
    status: "expired",
    updatedAt: clock.now().toISOString(),
  });
  return true;
}

/**
 * Local port of `archive_draft_if_resolved`. The Freeform achieved-rank
 * calculation stays exactly where it's always been —
 * `calculateFreeformRank` in TypeScript, computed by the caller and passed
 * in, never duplicated into this function — the same "domain logic never
 * moves into persistence" rule this app has followed since Phase 1.
 */
export async function archiveLocalDraftIfResolved(
  repos: LifecycleRepos,
  params: { profileId: string; draftId: string },
  deps: { clock?: Clock } = {},
): Promise<boolean> {
  const clock = deps.clock ?? new SystemClock();
  const draft = await repos.drafts.getById(params.profileId, params.draftId);
  if (!draft || draft.status === "archived" || draft.status === "discarded") {
    return false;
  }

  // The `"discarded"` half of that guard matters for a real race: marking
  // this draft's last film watched (which calls this function) can be
  // in flight at the same moment the Say Goodbye screen's "Say Goodbye"
  // button discards it (see `settleAndDiscardLocalDraft`) — without it, a
  // discarded draft could be resurrected back to `"archived"` the moment
  // this function's own `updateDraft` call below ran.
  const items = await repos.drafts.listItemsForDraft(params.draftId);
  const unresolvedItems = items.filter(
    (item): item is DraftItemRecord => !item.isCompleted,
  );

  if (unresolvedItems.length > 0) {
    const stillUnresolved = await Promise.all(
      unresolvedItems.map(
        async (item) =>
          (await repos.history.getPostmortemResponseForItem(item.id)) === null,
      ),
    );
    if (stillUnresolved.some(Boolean)) {
      return false;
    }
  }

  const freeformAchievedRank =
    draft.difficulty === "freeform"
      ? calculateFreeformRank(items.filter((item) => item.isCompleted).length)
      : null;

  await repos.drafts.updateDraft({
    ...draft,
    status: "archived",
    completedAt: clock.now().toISOString(),
    freeformAchievedRank,
    updatedAt: clock.now().toISOString(),
  });

  // Every real completion is rewarded through the one central path — see
  // `resolveDraftCompletionReward` (decides which currency, based on this
  // draft's `sourceEventId`, with no event-specific conditional living
  // here) and `awardDraftCompletionReward` (the manual-event downgrade
  // rule and the `rewardsGrantedAt` idempotency guard).
  const reward = await resolveDraftCompletionReward(repos, {
    profileId: params.profileId,
    draft,
  });
  await awardDraftCompletionReward(
    repos,
    { profileId: params.profileId, draftId: params.draftId, reward },
    { clock },
  );
  return true;
}

/**
 * Ends a draft the profile is letting go of for an event transition (see
 * docs/product-spec.md, event system Phase 3, "SAY GOODBYE") — NOT a
 * normal completion. Unlike `archiveLocalDraftIfResolved`, this never
 * requires every item to be resolved first: whatever's still unwatched
 * when this runs is simply left that way, and `status` becomes
 * `"discarded"`, not `"archived"`. `sourceEventId` is never touched — the
 * outgoing draft stays exactly whichever draft it always was.
 *
 * If the draft already reached a terminal state on its own before this
 * ran (e.g. the profile watched every remaining film during the Say
 * Goodbye screen, which auto-archives via the normal
 * `archiveLocalDraftIfResolved` path through `markLocalFilmWatched`), its
 * status is left exactly as is — only rewards get settled, never
 * downgraded from `"archived"` to `"discarded"`.
 *
 * Idempotent the same way `archiveLocalDraftIfResolved` is: a draft
 * already terminal with rewards already granted is untouched, returning
 * `false`. `rewardsGrantedAt` is the same generic, currency-agnostic
 * completion-reward guard Phase 1 added — this is its first real caller;
 * it grants no event-specific currency, only marks the timestamp.
 */
export async function settleAndDiscardLocalDraft(
  repos: LifecycleRepos,
  params: { profileId: string; draftId: string },
  deps: { clock?: Clock } = {},
): Promise<boolean> {
  const clock = deps.clock ?? new SystemClock();
  const draft = await repos.drafts.getById(params.profileId, params.draftId);
  if (!draft) {
    return false;
  }

  const isTerminal =
    draft.status === "archived" || draft.status === "discarded";
  if (isTerminal && draft.rewardsGrantedAt) {
    return false;
  }

  if (!isTerminal) {
    const now = clock.now().toISOString();
    await repos.drafts.updateDraft({
      ...draft,
      status: "discarded",
      completedAt: draft.completedAt ?? now,
      updatedAt: now,
    });
  }

  // Say Goodbye always closes out the draft being LET GO OF for an event
  // transition — never the incoming event's own draft (see
  // `confirmSayGoodbye`) — so this never passes an `eventContext`: it
  // always awards the generic/Lifetime currency outright, satisfying "Say
  // Goodbye awards no event-specific currency" unconditionally rather than
  // relying on the manual-event downgrade rule to happen to produce that
  // result. Reuses the one centralized reward path (see
  // `awardDraftCompletionReward`) instead of setting `rewardsGrantedAt`
  // inline here itself.
  await awardDraftCompletionReward(
    repos,
    {
      profileId: params.profileId,
      draftId: params.draftId,
      reward: { currency: GENERIC_POINT_CURRENCY, amount: 0 },
    },
    { clock },
  );
  return true;
}

export interface SubmitLocalPostmortemResponseResult {
  responseId: string;
  applied: boolean;
  draftArchived: boolean;
}
export type SubmitLocalPostmortemErrorCode = "not_found" | "unknown";
export type SubmitLocalPostmortemOutcome =
  | { ok: true; result: SubmitLocalPostmortemResponseResult }
  | { ok: false; error: SubmitLocalPostmortemErrorCode; message: string };

/** The default weight bump for "I didn't get time, but I wanted to!" — see docs/product-spec.md Phase 9 implementation log for why 1.0 was chosen. Kept as a named, overridable default rather than hardcoded inline, mirroring `submit_draft_postmortem_response`'s `p_weight_increase` parameter. */
export const DEFAULT_POSTMORTEM_WEIGHT_INCREASE = 1.0;

/**
 * Local port of `submit_draft_postmortem_response`. Idempotency is enforced
 * the same way the unique Postgres constraint enforced it, just moved one
 * layer down: `HistoryRepository.addPostmortemResponse` writes through
 * Dexie's `&draftItemId` unique index (see schema.ts), so a second insert
 * for the same draft item throws — this function is what turns that throw
 * into "return the existing response, applied: false" instead of letting
 * it bubble up as an unexpected error.
 */
export async function submitLocalPostmortemResponse(
  repos: LifecycleRepos,
  params: {
    profileId: string;
    draftId: string;
    draftItemId: string;
    response: PostmortemResponseType;
    weightIncrease?: number;
  },
  deps: { idGenerator?: IdGenerator; clock?: Clock } = {},
): Promise<SubmitLocalPostmortemOutcome> {
  const idGenerator = deps.idGenerator ?? defaultIdGenerator;
  const clock = deps.clock ?? new SystemClock();
  const weightIncrease =
    params.weightIncrease ?? DEFAULT_POSTMORTEM_WEIGHT_INCREASE;

  const item = await repos.drafts.getItemById(params.draftItemId);
  if (!item || item.draftId !== params.draftId) {
    return { ok: false, error: "not_found", message: "Draft item not found." };
  }
  // `getById` filters by profileId — this is the profile-isolation check
  // (see docs/product-spec.md, "Profile A cannot accidentally read Profile
  // B's ... drafts") that used to be Postgres RLS's job.
  const owningDraft = await repos.drafts.getById(
    params.profileId,
    params.draftId,
  );
  if (!owningDraft) {
    return { ok: false, error: "not_found", message: "Draft item not found." };
  }

  const existing = await repos.history.getPostmortemResponseForItem(
    params.draftItemId,
  );
  if (existing) {
    const draftArchived = await archiveLocalDraftIfResolved(
      repos,
      { profileId: params.profileId, draftId: params.draftId },
      { clock },
    );
    return {
      ok: true,
      result: { responseId: existing.id, applied: false, draftArchived },
    };
  }

  const now = clock.now().toISOString();
  const response: DraftPostmortemResponseRecord = {
    id: idGenerator.generate(),
    draftId: params.draftId,
    draftItemId: params.draftItemId,
    response: params.response,
    appliedAt: now,
    createdAt: now,
  };
  await repos.history.addPostmortemResponse(response);

  if (item.watchlistEntryId) {
    if (params.response === "wanted_more_time") {
      const entry = await repos.watchlist.getEntryById(
        params.profileId,
        item.watchlistEntryId,
      );
      if (entry && entry.isActive) {
        await repos.watchlist.updateEntry({
          ...entry,
          selectionWeight: entry.selectionWeight + weightIncrease,
          updatedAt: now,
        });
        await repos.history.addSelectionWeightAdjustment({
          id: idGenerator.generate(),
          watchlistEntryId: item.watchlistEntryId,
          draftPostmortemResponseId: response.id,
          delta: weightIncrease,
          reason: "postmortem_wanted_more_time",
          createdAt: now,
        });
      }
    } else if (params.response === "not_interested") {
      const entry = await repos.watchlist.getEntryById(
        params.profileId,
        item.watchlistEntryId,
      );
      if (entry && entry.isActive) {
        await repos.watchlist.updateEntry({
          ...entry,
          isActive: false,
          removedAt: now,
          removedReason: "postmortem_not_interested",
          updatedAt: now,
        });
      }
    }
  }

  const draftArchived = await archiveLocalDraftIfResolved(
    repos,
    { profileId: params.profileId, draftId: params.draftId },
    { clock },
  );
  return {
    ok: true,
    result: { responseId: response.id, applied: true, draftArchived },
  };
}

export type GenerateLocalFreeformBatchErrorCode =
  "not_found" | "not_active" | "not_freeform" | "nothing_left";
export type GenerateLocalFreeformBatchOutcome =
  | { ok: true; addedCount: number }
  | { ok: false; error: GenerateLocalFreeformBatchErrorCode; message: string };

/**
 * Local port of `add_draft_films` via `generate-freeform-batch.ts` — adds
 * another batch of up to `FREEFORM_BATCH_SIZE` films to an already-active
 * Freeform draft, excluding films already in it so a second batch never
 * repeats a film from the first.
 */
export async function generateLocalFreeformBatch(
  repos: DraftRepos,
  params: { profileId: string; draftId: string },
  deps: { idGenerator?: IdGenerator; clock?: Clock; rng?: Rng } = {},
): Promise<GenerateLocalFreeformBatchOutcome> {
  const idGenerator = deps.idGenerator ?? defaultIdGenerator;
  const clock = deps.clock ?? new SystemClock();
  const rng = deps.rng ?? createDefaultRng();

  const draft = await repos.drafts.getById(params.profileId, params.draftId);
  if (!draft) {
    return { ok: false, error: "not_found", message: "Draft not found." };
  }
  if (draft.status !== "active") {
    return {
      ok: false,
      error: "not_active",
      message: "This draft is not active.",
    };
  }
  if (draft.difficulty !== "freeform") {
    return {
      ok: false,
      error: "not_freeform",
      message: "Only Freeform drafts can add films after creation.",
    };
  }

  const existingItems = await repos.drafts.listItemsForDraft(params.draftId);
  const usedEntryIds = new Set(
    existingItems
      .map((item) => item.watchlistEntryId)
      .filter((id): id is string => id !== null),
  );
  const activeEntries = await repos.watchlist.listActiveEntries(
    params.profileId,
  );
  const candidates = activeEntries
    .filter((entry) => !usedEntryIds.has(entry.id))
    .map((entry) => ({
      id: entry.id,
      weight: entry.selectionWeight,
      filmId: entry.filmId,
    }));

  if (candidates.length === 0) {
    return {
      ok: false,
      error: "nothing_left",
      message: "Every active watchlist film is already in this draft.",
    };
  }

  const batchSize = Math.min(FREEFORM_BATCH_SIZE, candidates.length);
  const selectedEntryIds = pickRandomFilms(candidates, batchSize, rng);
  const candidateByEntryId = new Map(candidates.map((c) => [c.id, c]));
  const now = clock.now().toISOString();
  const startingOrderIndex =
    existingItems.length > 0
      ? Math.max(...existingItems.map((item) => item.orderIndex)) + 1
      : 0;

  const newItems: DraftItemRecord[] = selectedEntryIds.map(
    (entryId, index) => ({
      id: idGenerator.generate(),
      draftId: params.draftId,
      filmId: candidateByEntryId.get(entryId)!.filmId,
      watchlistEntryId: entryId,
      source: "random",
      challengeId: null,
      challengeAttemptId: null,
      challengeDisplayValue: null,
      orderIndex: startingOrderIndex + index,
      isCompleted: false,
      completedAt: null,
      watchedHistoryId: null,
      createdAt: now,
    }),
  );
  await repos.drafts.createItems(newItems);

  await repos.drafts.updateDraft({
    ...draft,
    totalFilms: draft.totalFilms + newItems.length,
    randomFilmCount: draft.randomFilmCount + newItems.length,
    updatedAt: now,
  });

  return { ok: true, addedCount: newItems.length };
}
