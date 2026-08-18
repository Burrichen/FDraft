import {
  fetchLocalChallengeCandidates,
  fetchLocalChallengeWatchedFilms,
} from "@/application/drafts/local-fetch-context";
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
import {
  hasNoUsableMetadata,
  mergeLocalFilmMetadata,
} from "@/application/watchlist/merge-local-film-metadata";
import { defaultIdGenerator, type IdGenerator } from "@/domain/shared/id";
import { createDefaultRng, type Rng } from "@/domain/shared/rng";
import { pickRandomFilms } from "@/domain/watchlist/random-pick";
import { resolveFranchiseChronologicalPick } from "@/domain/watchlist/franchise-order";
import { SystemClock, type Clock } from "@/domain/time/clock";
import type { ChallengeCandidateFilm } from "@/domain/challenges/types";
import type { DraftRepository } from "@/repositories/draft-repository";
import type { FilmRepository } from "@/repositories/film-repository";
import type { HistoryRepository } from "@/repositories/history-repository";
import type {
  DraftItemRecord,
  DraftPostmortemResponseRecord,
  DraftRecord,
  PostmortemResponseType,
} from "@/repositories/records";
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
 * Applies "Franchises in chronological order" to the plain random roll
 * only (see docs/updates, "FRANCHISE CHRONOLOGICAL-ORDER SETTING") — the
 * challenge engine's own picks are never touched, matching "this
 * adjustment should happen after the normal roll rather than rewriting
 * the existing rule-generation engine." Processes each rolled slot
 * independently, in roll order, tracking which watchlist entries are
 * already claimed by an earlier slot in THIS draft so two slots can never
 * both end up substituting in the same film.
 */
function applyFranchiseChronologicalOrder(params: {
  candidates: ChallengeCandidateFilm[];
  candidateByEntryId: Map<string, ChallengeCandidateFilm>;
  rolledPickIds: string[];
  enabled: boolean;
}): {
  finalPickIds: string[];
  substitutionByEntryId: Map<string, { originFilmId: string }>;
} {
  const substitutionByEntryId = new Map<string, { originFilmId: string }>();
  if (!params.enabled) {
    return { finalPickIds: params.rolledPickIds, substitutionByEntryId };
  }

  const usedEntryIds = new Set(params.rolledPickIds);
  const finalPickIds: string[] = [];

  for (const entryId of params.rolledPickIds) {
    const rolled = params.candidateByEntryId.get(entryId)!;
    const pool = params.candidates.filter(
      (candidate) =>
        candidate.watchlistEntryId !== entryId &&
        !usedEntryIds.has(candidate.watchlistEntryId),
    );
    const chosen = resolveFranchiseChronologicalPick({ rolled, pool });

    if (chosen.watchlistEntryId === entryId) {
      finalPickIds.push(entryId);
      continue;
    }

    usedEntryIds.delete(entryId);
    usedEntryIds.add(chosen.watchlistEntryId);
    substitutionByEntryId.set(chosen.watchlistEntryId, {
      originFilmId: rolled.filmId,
    });
    finalPickIds.push(chosen.watchlistEntryId);
  }

  return { finalPickIds, substitutionByEntryId };
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
    /** "Franchises in chronological order" (see docs/updates) — the caller passes the active profile's current setting through explicitly, the same convention `timezone` already follows, rather than this function reaching into a profiles repository itself. Defaults to off, unchanged behaviour. */
    franchiseChronologicalOrder?: boolean;
  },
  deps: { idGenerator?: IdGenerator; clock?: Clock; rng?: Rng } = {},
): Promise<CreateLocalDraftOutcome> {
  const idGenerator = deps.idGenerator ?? defaultIdGenerator;
  const clock = deps.clock ?? new SystemClock();
  const rng = deps.rng ?? createDefaultRng();
  const { profileId, timezone, config } = params;
  const franchiseChronologicalOrder =
    params.franchiseChronologicalOrder ?? false;

  if (await repos.drafts.hasActiveDraft(profileId)) {
    return {
      ok: false,
      error: "already_active",
      message:
        "You already have an active draft. Finish or expire it before starting another.",
    };
  }

  const candidates = await fetchLocalChallengeCandidates(repos, profileId);
  if (candidates.length === 0) {
    return {
      ok: false,
      error: "empty_watchlist",
      message:
        "Your watchlist is empty — import some films before creating a draft.",
    };
  }

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

  const rolledRandomPickIds = pickRandomFilms(
    candidates.map((candidate) => ({
      id: candidate.watchlistEntryId,
      weight: candidate.selectionWeight,
    })),
    randomCount,
    rng,
  );
  const candidateByEntryId = new Map(
    candidates.map((candidate) => [candidate.watchlistEntryId, candidate]),
  );
  const { finalPickIds: randomPickIds, substitutionByEntryId } =
    applyFranchiseChronologicalOrder({
      candidates,
      candidateByEntryId,
      rolledPickIds: rolledRandomPickIds,
      enabled: franchiseChronologicalOrder,
    });
  const randomPickIdSet = new Set(randomPickIds);
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
    customName: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  await repos.drafts.createDraft(draft);

  let orderIndex = 0;
  const randomItems: DraftItemRecord[] = randomPickIds.map((entryId) => {
    const candidate = candidateByEntryId.get(entryId)!;
    const substitution = substitutionByEntryId.get(entryId) ?? null;
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
      originFilmId: substitution?.originFilmId ?? null,
      substitutionReason: substitution ? "franchise_order" : null,
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
    originFilmId: null,
    substitutionReason: null,
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
  if (!draft || draft.status === "archived") {
    return false;
  }

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
      originFilmId: null,
      substitutionReason: null,
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

export type SetLocalDraftCustomNameErrorCode = "not_found";
export type SetLocalDraftCustomNameOutcome =
  | { ok: true }
  | { ok: false; error: SetLocalDraftCustomNameErrorCode; message: string };

/**
 * Sets or clears a draft's custom name (see docs/updates, "DRAFT NAMES").
 * `customName: null` (or an all-whitespace string) restores the generated
 * `<Month> <Difficulty> Draft` default — there is no separate "reset"
 * action, since `getDraftDisplayName` already treats `null` that way.
 * Works on a draft in any status (active, expired, or archived — a
 * profile should be able to rename a finished draft in their history too).
 */
export async function setLocalDraftCustomName(
  repos: { drafts: DraftRepository },
  params: { profileId: string; draftId: string; customName: string | null },
  deps: { clock?: Clock } = {},
): Promise<SetLocalDraftCustomNameOutcome> {
  const clock = deps.clock ?? new SystemClock();
  const draft = await repos.drafts.getById(params.profileId, params.draftId);
  if (!draft) {
    return { ok: false, error: "not_found", message: "Draft not found." };
  }

  const trimmed = params.customName?.trim();
  await repos.drafts.updateDraft({
    ...draft,
    customName: trimmed ? trimmed : null,
    updatedAt: clock.now().toISOString(),
  });
  return { ok: true };
}

export type AddManualFilmToLocalDraftErrorCode =
  | "draft_not_found"
  | "draft_not_active"
  | "entry_not_eligible"
  | "already_in_draft";
export type AddManualFilmToLocalDraftOutcome =
  | { ok: true; draftItemId: string }
  | { ok: false; error: AddManualFilmToLocalDraftErrorCode; message: string };

/**
 * Manually adds a specific active watchlist entry to the active draft
 * (see docs/updates, "MANUAL WATCHLIST → DRAFT INSERTION") — an
 * explicitly supported, legal way to populate a draft, not a cheat path:
 * it goes through the exact same `DraftItemRecord`/`createItems` write
 * every random or challenge pick already uses, just tagged
 * `source: "manual"` so nothing downstream mistakes it for a random roll,
 * a reroll, or a failure. Capacity grows by exactly one film — the same
 * "extend totalFilms" pattern `generateLocalFreeformBatch` already uses
 * for adding films to an in-progress draft — for any difficulty, not only
 * Freeform, since a manual add is an intentional addition on top of
 * whatever the draft already generated, not a fill-in for a missing slot.
 * Never marks anything watched; never touches `watchedHistoryId`.
 */
export async function addManualFilmToLocalDraft(
  repos: DraftRepos,
  params: { profileId: string; draftId: string; watchlistEntryId: string },
  deps: { idGenerator?: IdGenerator; clock?: Clock } = {},
): Promise<AddManualFilmToLocalDraftOutcome> {
  const idGenerator = deps.idGenerator ?? defaultIdGenerator;
  const clock = deps.clock ?? new SystemClock();

  const draft = await repos.drafts.getById(params.profileId, params.draftId);
  if (!draft) {
    return {
      ok: false,
      error: "draft_not_found",
      message: "Draft not found.",
    };
  }
  if (draft.status !== "active") {
    return {
      ok: false,
      error: "draft_not_active",
      message: "This draft is not active.",
    };
  }

  const entry = await repos.watchlist.getEntryById(
    params.profileId,
    params.watchlistEntryId,
  );
  if (!entry || !entry.isActive) {
    return {
      ok: false,
      error: "entry_not_eligible",
      message: "This film isn't on your active watchlist.",
    };
  }

  const existingItems = await repos.drafts.listItemsForDraft(params.draftId);
  if (existingItems.some((item) => item.watchlistEntryId === entry.id)) {
    return {
      ok: false,
      error: "already_in_draft",
      message: "This film is already in the draft.",
    };
  }

  const now = clock.now().toISOString();
  const orderIndex =
    existingItems.length > 0
      ? Math.max(...existingItems.map((item) => item.orderIndex)) + 1
      : 0;
  const item: DraftItemRecord = {
    id: idGenerator.generate(),
    draftId: params.draftId,
    filmId: entry.filmId,
    watchlistEntryId: entry.id,
    source: "manual",
    challengeId: null,
    challengeAttemptId: null,
    challengeDisplayValue: null,
    orderIndex,
    isCompleted: false,
    completedAt: null,
    watchedHistoryId: null,
    originFilmId: null,
    substitutionReason: null,
    createdAt: now,
  };
  await repos.drafts.createItems([item]);
  await repos.drafts.updateDraft({
    ...draft,
    totalFilms: draft.totalFilms + 1,
    updatedAt: now,
  });

  return { ok: true, draftItemId: item.id };
}

export type RerollMissingMetadataErrorCode =
  | "draft_not_found"
  | "draft_not_active"
  | "item_not_found"
  | "has_metadata"
  | "nothing_available";
export type RerollMissingMetadataOutcome =
  | { ok: true; newFilmId: string }
  | { ok: false; error: RerollMissingMetadataErrorCode; message: string };

/**
 * Replaces a drafted item's film when it genuinely has no usable metadata
 * (see docs/updates, "MISSING-METADATA REROLL") — checked via
 * `hasNoUsableMetadata` against the SAME merged-metadata shape the rest
 * of the app already uses, never a single arbitrary field like
 * `posterUrl` alone. Replaces the slot in place (same `orderIndex`, no
 * capacity change) rather than appending a new item — this is a
 * replacement, not a free extra pick. The new film is drawn from the
 * profile's normal eligible candidate pool, excluding every film already
 * in this draft (which trivially excludes the film being replaced too,
 * satisfying "avoid selecting the exact same film again where possible"
 * without needing a special case for it). Never marks anything watched.
 */
export async function rerollLocalDraftItemForMissingMetadata(
  repos: DraftRepos,
  params: { profileId: string; draftId: string; draftItemId: string },
  deps: { rng?: Rng } = {},
): Promise<RerollMissingMetadataOutcome> {
  const rng = deps.rng ?? createDefaultRng();

  const draft = await repos.drafts.getById(params.profileId, params.draftId);
  if (!draft) {
    return {
      ok: false,
      error: "draft_not_found",
      message: "Draft not found.",
    };
  }
  if (draft.status !== "active") {
    return {
      ok: false,
      error: "draft_not_active",
      message: "This draft is not active.",
    };
  }

  const item = await repos.drafts.getItemById(params.draftItemId);
  if (!item || item.draftId !== params.draftId) {
    return {
      ok: false,
      error: "item_not_found",
      message: "Draft item not found.",
    };
  }

  const metadataRows = await repos.films.getMetadataForFilm(item.filmId);
  if (!hasNoUsableMetadata(mergeLocalFilmMetadata(metadataRows))) {
    return {
      ok: false,
      error: "has_metadata",
      message: "This film already has usable metadata.",
    };
  }

  const candidates = await fetchLocalChallengeCandidates(
    repos,
    params.profileId,
  );
  const existingItems = await repos.drafts.listItemsForDraft(params.draftId);
  const usedFilmIds = new Set(existingItems.map((existing) => existing.filmId));
  const pool = candidates.filter(
    (candidate) => !usedFilmIds.has(candidate.filmId),
  );
  if (pool.length === 0) {
    return {
      ok: false,
      error: "nothing_available",
      message: "No other watchlist films are available to replace this one.",
    };
  }

  const [pickedEntryId] = pickRandomFilms(
    pool.map((candidate) => ({
      id: candidate.watchlistEntryId,
      weight: candidate.selectionWeight,
    })),
    1,
    rng,
  );
  const picked = pool.find(
    (candidate) => candidate.watchlistEntryId === pickedEntryId,
  )!;

  await repos.drafts.updateItem({
    ...item,
    filmId: picked.filmId,
    watchlistEntryId: picked.watchlistEntryId,
    // Preserves the TRUE original film across repeated rerolls — only set
    // once, on the first substitution this item ever undergoes.
    originFilmId: item.originFilmId ?? item.filmId,
    substitutionReason: "missing_metadata",
  });

  return { ok: true, newFilmId: picked.filmId };
}
