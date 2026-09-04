import {
  fetchLocalChallengeCandidates,
  fetchLocalChallengeWatchedFilms,
} from "@/application/drafts/local-fetch-context";
import { getDiyEligibleFilms } from "@/application/drafts/local-diy-candidates";
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
import { canEditDraftSlot } from "@/domain/drafts/draft-editing-permission";
import {
  FREEFORM_BATCH_SIZE,
  getFilmCount,
  isFreeform,
} from "@/domain/drafts/difficulty";
import { calculateFreeformRank } from "@/domain/drafts/freeform";
import type { DraftConfigInput } from "@/domain/drafts/schemas";
import { resolveEligibleCandidates } from "@/domain/events/event-eligibility";
import { getEventDefinition } from "@/domain/events/event-registry";
import {
  hasNoUsableMetadata,
  mergeLocalFilmMetadata,
} from "@/application/watchlist/merge-local-film-metadata";
import { undoLocalFilmWatched } from "@/application/watchlist/local-watchlist-service";
import { defaultIdGenerator, type IdGenerator } from "@/domain/shared/id";
import { createDefaultRng, type Rng } from "@/domain/shared/rng";
import { pickRandomFilms } from "@/domain/watchlist/random-pick";
import { resolveFranchiseChronologicalPick } from "@/domain/watchlist/franchise-order";
import { SystemClock, type Clock } from "@/domain/time/clock";
import type { ChallengeCandidateFilm } from "@/domain/challenges/types";
import type { DraftRepository } from "@/repositories/draft-repository";
import type { FilmRepository } from "@/repositories/film-repository";
import type { HistoryRepository } from "@/repositories/history-repository";
import type { PointsRepository } from "@/repositories/points-repository";
import type {
  DraftDifficulty,
  DraftItemRecord,
  DraftItemSubstitutionReason,
  DraftPostmortemResponseRecord,
  DraftRecord,
  DraftTimeMode,
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

  // Scoped to THIS draft's own destination (see docs/updates, "PROMPT
  // B2.1 — DUAL DRAFT ARCHITECTURE"): a plain draft (`sourceEventId:
  // null/undefined`) only ever collides with the profile's other plain
  // draft, and — since `/drafts/new` is also how January/Frontier/Signal
  // drafts get created today (see `drafts/new/actions.ts`, which tags
  // `sourceEventId` from `EventSettings.activeEvent` before calling this)
  // — an event-tagged draft only ever collides with that SAME event's own
  // active draft, never the profile's normal one.
  const draftScopeEventId = params.sourceEventId ?? null;
  if (await repos.drafts.hasActiveDraft(profileId, draftScopeEventId)) {
    return {
      ok: false,
      error: "already_active",
      message:
        draftScopeEventId === null
          ? "You already have an active draft. Finish or expire it before starting another."
          : "You already have an active draft for this event. Finish or expire it before starting another.",
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

  // A film the user explicitly pre-picked for a deliberately-CHOSEN "diy"
  // slot must survive to the challenge phase untouched — see docs/updates,
  // v1.1.1, "DIY Challenge Film": "prevent challenge draft finalisation
  // until a valid film has been chosen." Excluded here from both the
  // random draw and franchise-order substitution's own candidate pool, so
  // neither can silently consume it first purely by chance; it's added
  // back for the challenge engine below via `remainingCandidates` (built
  // from the full, unfiltered `candidates`). "Decide For Me"'s optional
  // backups are deliberately NOT reserved — they're explicitly best-effort
  // ("if one of your challenge slots happens to randomly land on...").
  const reservedForDiyEntryIds =
    !freeform &&
    config.challengeMode === "choose" &&
    config.diyFilmEntryIds?.length
      ? new Set(config.diyFilmEntryIds)
      : new Set<string>();
  const randomDrawPool =
    reservedForDiyEntryIds.size > 0
      ? candidates.filter(
          (candidate) =>
            !reservedForDiyEntryIds.has(candidate.watchlistEntryId),
        )
      : candidates;

  if (randomDrawPool.length < randomCount) {
    return {
      ok: false,
      error: "not_enough_films",
      message: `This draft needs at least ${randomCount} active watchlist films for its random selection (you have ${randomDrawPool.length}).`,
    };
  }

  const now = clock.now();
  const deadlineAt = calculateDraftDeadline({
    timeMode: config.timeMode,
    startedAt: now,
    timezone,
  });

  const rolledRandomPickIds = pickRandomFilms(
    randomDrawPool.map((candidate) => ({
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
      candidates: randomDrawPool,
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
    sourceEventId: params.sourceEventId ?? null,
    sourceEventManuallyEnabled: params.sourceEventId
      ? (params.sourceEventManuallyEnabled ?? null)
      : null,
    rewardsGrantedAt: null,
    customName: null,
    eventOccurrenceYear: null,
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
    // The "diy" challenge validates its pre-picked film(s) against the
    // full, franchise-UNRESTRICTED DIY-eligible pool — the same one the
    // picker showed the user — rather than `remainingCandidates` (which
    // may have already excluded a later sequel via the franchise-ordering
    // rule that only applies to the engine's own automatic picks). See
    // docs/updates, v1.1.2, "Fix DIY Draft missing watchlist films" — a
    // film franchise-excluded from `remainingCandidates` simply won't be
    // found there via `findIndex`/`splice` bookkeeping, so no double-pick
    // risk from wiring in a second, wider pool just for this lookup.
    const diyEligibleCandidates = config.diyFilmEntryIds?.length
      ? await fetchLocalChallengeCandidates(repos, profileId, {
          applyFranchiseOrderingRule: false,
        })
      : undefined;
    const engineContext: Omit<ChallengeContext, "previousPicks"> = {
      rng,
      now,
      candidates: remainingCandidates,
      watchedFilms,
      config: DEFAULT_CHALLENGE_ENGINE_CONFIG,
      ...(diyEligibleCandidates ? { diyEligibleCandidates } : {}),
      ...(config.manualGenre || config.diyFilmEntryIds?.length
        ? {
            manualSelections: {
              ...(config.manualGenre ? { genre: config.manualGenre } : {}),
              ...(config.diyFilmEntryIds?.length
                ? { diyFilmEntryIds: config.diyFilmEntryIds }
                : {}),
            },
          }
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

export type CreateLocalDraftFromSelectionErrorCode =
  | "already_active"
  | "invalid_selection_count"
  | "duplicate_selection"
  | "entry_not_eligible";
export type CreateLocalDraftFromSelectionOutcome =
  | { ok: true; draftId: string }
  | {
      ok: false;
      error: CreateLocalDraftFromSelectionErrorCode;
      message: string;
    };

/**
 * "DIY Draft" (see docs/updates, v1.1.0, "NEW DRAFTING MODE — DIY
 * DRAFT"): creates a normal active draft from a user-picked list of
 * watchlist entries instead of a random roll. Deliberately a separate,
 * small function rather than a fork of `createLocalDraft`'s own body —
 * that function's internals (weighted random picks, franchise-order
 * substitution, the challenge engine) don't apply here at all — but it
 * reuses every SHARED piece that isn't roll-specific: the same
 * `DraftRecord`/`DraftItemRecord` shapes, the same `calculateDraftDeadline`,
 * the same `getFilmCount`/`isFreeform` sizing rules (never a
 * DIY-specific film count), and the same eligibility-filtered candidate
 * pool every other draft-generation path uses (see
 * `local-fetch-context.ts`) — a film that couldn't be randomly drafted
 * (unreleased, an unstarted later series entry, a metadata identity
 * mismatch) can't be manually selected into one either.
 *
 * Every resulting item is `source: "manual"` — the exact same tag
 * `addManualFilmToLocalDraft` already uses for a single film added to an
 * in-progress draft — so nothing downstream needs a new concept of "a
 * DIY draft" at all: it's just an ordinary draft whose items all happen
 * to be manual, which every existing draft-lifecycle function (watched-
 * state tracking, `archiveLocalDraftIfResolved`, `abandonLocalDraft`,
 * Draft History) already handles with zero changes.
 */
export async function createLocalDraftFromSelection(
  repos: DraftRepos,
  params: {
    profileId: string;
    timezone: string;
    difficulty: DraftDifficulty;
    timeMode: DraftTimeMode;
    watchlistEntryIds: string[];
  },
  deps: { idGenerator?: IdGenerator; clock?: Clock } = {},
): Promise<CreateLocalDraftFromSelectionOutcome> {
  const idGenerator = deps.idGenerator ?? defaultIdGenerator;
  const clock = deps.clock ?? new SystemClock();
  const { profileId, timezone, difficulty, watchlistEntryIds } = params;

  // DIY drafts are always a plain, non-event draft (`sourceEventId: null`
  // below) — scoped accordingly, same as `createLocalDraft`'s own check.
  if (await repos.drafts.hasActiveDraft(profileId, null)) {
    return {
      ok: false,
      error: "already_active",
      message:
        "You already have an active draft. Finish or expire it before starting another.",
    };
  }

  const uniqueEntryIds = new Set(watchlistEntryIds);
  if (uniqueEntryIds.size !== watchlistEntryIds.length) {
    return {
      ok: false,
      error: "duplicate_selection",
      message: "The same film was selected more than once.",
    };
  }

  const freeform = isFreeform(difficulty);
  const requiredCount = freeform ? null : getFilmCount(difficulty);
  if (
    freeform
      ? watchlistEntryIds.length === 0
      : watchlistEntryIds.length !== requiredCount
  ) {
    return {
      ok: false,
      error: "invalid_selection_count",
      message: freeform
        ? "Select at least one film to build a Freeform DIY draft."
        : `Select exactly ${requiredCount} films for a ${difficulty} DIY draft.`,
    };
  }

  // The same eligibility-filtered pool the DIY selection screen shows —
  // a film that isn't a currently-eligible candidate (someone else's
  // watchlist entry, already watched, unreleased, a metadata identity
  // mismatch) can't be hand-picked into a draft either. Deliberately
  // `applyFranchiseOrderingRule: false` (see docs/updates, v1.1.2, "Fix
  // DIY Draft missing watchlist films") — this must match exactly what
  // `getDiyEligibleFilms` showed the user, or a sequel visible and
  // selectable in the picker would be rejected here as "no longer
  // eligible" at submission time.
  const eligibleCandidates = await fetchLocalChallengeCandidates(
    repos,
    profileId,
    { applyFranchiseOrderingRule: false },
  );
  const eligibleByEntryId = new Map(
    eligibleCandidates.map((candidate) => [
      candidate.watchlistEntryId,
      candidate,
    ]),
  );
  for (const entryId of watchlistEntryIds) {
    if (!eligibleByEntryId.has(entryId)) {
      return {
        ok: false,
        error: "entry_not_eligible",
        message:
          "One of the selected films is no longer eligible — refresh and try again.",
      };
    }
  }

  const now = clock.now();
  const deadlineAt = calculateDraftDeadline({
    timeMode: params.timeMode,
    startedAt: now,
    timezone,
  });

  const draftId = idGenerator.generate();
  const draft: DraftRecord = {
    id: draftId,
    profileId,
    difficulty,
    timeMode: params.timeMode,
    status: "active",
    totalFilms: watchlistEntryIds.length,
    randomFilmCount: 0,
    challengeFilmCount: 0,
    challengeMode: null,
    startedAt: now.toISOString(),
    deadlineAt: deadlineAt.toISOString(),
    timezone,
    completedAt: null,
    freeformAchievedRank: null,
    sourceEventId: null,
    sourceEventManuallyEnabled: null,
    rewardsGrantedAt: null,
    customName: null,
    eventOccurrenceYear: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  await repos.drafts.createDraft(draft);

  const items: DraftItemRecord[] = watchlistEntryIds.map((entryId, index) => {
    const candidate = eligibleByEntryId.get(entryId)!;
    return {
      id: idGenerator.generate(),
      draftId,
      filmId: candidate.filmId,
      watchlistEntryId: entryId,
      source: "manual",
      challengeId: null,
      challengeAttemptId: null,
      challengeDisplayValue: null,
      orderIndex: index,
      isCompleted: false,
      completedAt: null,
      watchedHistoryId: null,
      originFilmId: null,
      substitutionReason: null,
      createdAt: now.toISOString(),
    };
  });
  await repos.drafts.createItems(items);

  return { ok: true, draftId };
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
  deps: {
    clock?: Clock;
    /** Forwarded to `awardDraftCompletionReward` — see that option's own doc comment. Defaults to `true`. */
    creditLifetimeBalance?: boolean;
  } = {},
): Promise<boolean> {
  const clock = deps.clock ?? new SystemClock();
  const draft = await repos.drafts.getById(params.profileId, params.draftId);
  if (!draft || draft.status === "archived" || draft.status === "discarded") {
    return false;
  }

  // The `"discarded"` half of that guard is defensive: nothing currently
  // writes a `"discarded"` draft (the "Say Goodbye" flow that used to —
  // see docs/updates, "PROMPT B2.1 — DUAL DRAFT ARCHITECTURE" §1 — was
  // removed, since opting into an event no longer touches a profile's
  // normal Draft at all), but a draft imported from an older backup could
  // still carry that status, and this guard keeps it from ever being
  // resurrected back to `"archived"`.
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
    { clock, creditBalance: deps.creditLifetimeBalance },
  );
  return true;
}

export type AbandonLocalDraftErrorCode = "not_found" | "not_active";
export interface AbandonLocalDraftResult {
  /**
   * Watchlist entries reactivated by reverting a watch this draft caused
   * — the caller (Draft page) also clears any pending session "Undo"
   * record for each of these, since it would otherwise point at a
   * now-deleted draft item (see `components/watch-undo/
   * watch-undo-provider.tsx`).
   */
  revertedWatchlistEntryIds: string[];
  /**
   * Every completed item this draft reverted, entry-based or not (see
   * `revertedWatchlistEntryIds` for the entry-based subset alone) — a
   * Halloween Horror/Kitsch item has no watchlist entry, so its pending
   * session "Undo" record (keyed by `draftItemId` — see
   * `watch-undo-provider.tsx`'s `clearUndoForItem`) can only be found this
   * way.
   */
  revertedDraftItemIds: string[];
}
export type AbandonLocalDraftOutcome =
  | { ok: true; result: AbandonLocalDraftResult }
  | { ok: false; error: AbandonLocalDraftErrorCode; message: string };

/**
 * "Regenerate Draft" (Admin Mode only — see docs/updates, v1.0.4 "God
 * Mode", "REGENERATE DRAFT"): permanently abandons the profile's current
 * ACTIVE draft, awarding nothing — FDraft has no points/score/"Lifetime"
 * system to suppress in the first place, so there is nothing beyond
 * deleting the draft's own rows and reverting the watches it caused.
 *
 * For every item this draft already completed, reverts EXACTLY the watch
 * that completed it via `undoLocalFilmWatched` — the same, already
 * carefully-guarded mechanism the film card's own "Undo" button uses —
 * rather than re-deriving watched-state rollback rules here. A film
 * watched independently of this draft is never touched: only an
 * active (unwatched) watchlist entry can be rolled into a draft in the
 * first place, so a draft item's `watchedHistoryId` can only ever be the
 * watch that completed IT, never a pre-existing watch. `undoLocalFilmWatched`
 * re-confirms this itself before touching anything (only reactivates an
 * entry that is currently `isActive: false` with `removedReason:
 * "watched"`, and only reverts the exact item/watched-history pairing
 * named). `draftArchivedByThisAction` is always passed as `false` here:
 * the draft is about to be hard-deleted, not reverted back to "active".
 *
 * Only ever offered for a genuinely `active` draft (the Draft page never
 * shows "Regenerate Draft" for an expired or archived one) — checked
 * again here regardless, matching every other lifecycle function in this
 * file's own defense-in-depth.
 */
export async function abandonLocalDraft(
  repos: LifecycleRepos,
  params: { profileId: string; draftId: string },
  deps: { clock?: Clock } = {},
): Promise<AbandonLocalDraftOutcome> {
  const draft = await repos.drafts.getById(params.profileId, params.draftId);
  if (!draft) {
    return { ok: false, error: "not_found", message: "Draft not found." };
  }
  if (draft.status !== "active") {
    return {
      ok: false,
      error: "not_active",
      message: "Only an active draft can be regenerated.",
    };
  }

  const items = await repos.drafts.listItemsForDraft(draft.id);
  const revertedWatchlistEntryIds: string[] = [];
  const revertedDraftItemIds: string[] = [];
  for (const item of items) {
    if (!item.isCompleted || !item.watchedHistoryId) {
      continue;
    }
    // `watchlistEntryId` is legitimately `null` for a Halloween Horror/
    // Kitsch item (see `DraftItemRecord.watchlistEntryId`'s doc comment)
    // — `undoLocalFilmWatched` already handles that case by skipping the
    // watchlist-entry reactivation step, so this reverts both kinds
    // identically rather than silently skipping the entry-less ones.
    await undoLocalFilmWatched(
      repos,
      {
        profileId: params.profileId,
        record: {
          watchlistEntryId: item.watchlistEntryId,
          filmId: item.filmId,
          watchedHistoryId: item.watchedHistoryId,
          draftItemId: item.id,
          draftId: draft.id,
          draftArchivedByThisAction: false,
          secondaryDraftCompletion: null,
        },
      },
      deps,
    );
    if (item.watchlistEntryId) {
      revertedWatchlistEntryIds.push(item.watchlistEntryId);
    }
    revertedDraftItemIds.push(item.id);
  }

  await repos.drafts.deleteDraft(draft.id);

  return {
    ok: true,
    result: { revertedWatchlistEntryIds, revertedDraftItemIds },
  };
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
  // Routed through the same eligibility-checked candidate pool every
  // other draft path uses (see `local-fetch-context.ts`, "DRAFT
  // CANDIDATE INTEGRITY") — previously read `listActiveEntries` directly
  // with no metadata access at all, so an unreleased film or an
  // unstarted later series entry could enter a Freeform batch with
  // nothing to stop it.
  const eligibleCandidates = await fetchLocalChallengeCandidates(
    repos,
    params.profileId,
  );
  const candidates = eligibleCandidates
    .filter((candidate) => !usedEntryIds.has(candidate.watchlistEntryId))
    .map((candidate) => ({
      id: candidate.watchlistEntryId,
      weight: candidate.selectionWeight,
      filmId: candidate.filmId,
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

export type ReplaceDraftSlotMode =
  { kind: "manual"; watchlistEntryId: string } | { kind: "reroll" };
export type ReplaceDraftSlotErrorCode =
  | "draft_not_found"
  | "draft_not_active"
  | "item_not_found"
  | "not_permitted"
  | "invalid_candidate"
  | "already_in_draft"
  | "nothing_available";
export type ReplaceDraftSlotOutcome =
  | { ok: true; newFilmId: string; previousWatchlistEntryId: string | null }
  | { ok: false; error: ReplaceDraftSlotErrorCode; message: string };

/**
 * Lets a user swap out ONE random draft slot for a different film, either
 * by hand-picking it (`mode.kind === "manual"`) or by drawing a fresh
 * random one (`mode.kind === "reroll"`) — see docs/updates, v1.1.3
 * "Editable random draft slots". Modeled directly on
 * `rerollLocalDraftItemForMissingMetadata` above: same in-place
 * `updateItem` replacement (same `orderIndex`, no capacity change, `source`
 * untouched — the slot stays `"random"`), same `originFilmId`/
 * `substitutionReason` provenance.
 *
 * `canEditDraftSlot` is the ONLY permission check — enforced here (not
 * just wherever the UI happens to render a button) so a second, forgetful
 * call site can never bypass Challenge-slot locking or the Event-draft
 * restriction.
 *
 * Watched-state reconciliation: if the slot being replaced was already
 * `isCompleted`, its `WatchedHistoryRecord` and `WatchlistEntryRecord` are
 * deliberately left untouched — the person genuinely watched that film,
 * and that historical fact isn't erased. What IS cleared is the
 * draft-specific linkage (`isCompleted`/`completedAt`/`watchedHistoryId`
 * on this item), which is sufficient to guarantee the abandoned film earns
 * no credit toward this draft: `archiveLocalDraftIfResolved` only ever
 * fires once every item is resolved, and points are awarded once, flat,
 * per whole draft — never per film — so severing this one item's
 * completion is all "zero points for the replaced film" requires. This is
 * only reachable while `draft.status === "active"`, which also guarantees
 * `rewardsGrantedAt` is still `null` — there is no already-granted reward
 * to reverse in this data model.
 */
export async function replaceDraftSlot(
  repos: DraftRepos,
  params: {
    profileId: string;
    draftId: string;
    draftItemId: string;
    adminModeEnabled: boolean;
    mode: ReplaceDraftSlotMode;
    /** Same "Franchises in chronological order" setting `createLocalDraft` takes — applied to a reroll's fresh pick for parity with normal random generation. Ignored for `mode.kind === "manual"` (manual selection deliberately ignores sequel/franchise restrictions). */
    franchiseChronologicalOrder?: boolean;
  },
  deps: { rng?: Rng } = {},
): Promise<ReplaceDraftSlotOutcome> {
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

  if (
    !canEditDraftSlot({
      itemSource: item.source,
      draftSourceEventId: draft.sourceEventId,
      adminModeEnabled: params.adminModeEnabled,
    })
  ) {
    return {
      ok: false,
      error: "not_permitted",
      message: "This slot can't be edited.",
    };
  }

  const existingItems = await repos.drafts.listItemsForDraft(params.draftId);
  const usedFilmIds = new Set(existingItems.map((existing) => existing.filmId));

  let newFilmId: string;
  let newWatchlistEntryId: string;
  let substitutionReason: DraftItemSubstitutionReason;

  const mode = params.mode;
  if (mode.kind === "manual") {
    // Re-validated against the canonical DIY/manual pool here, even though
    // the picker UI already only ever offers eligible, unclaimed entries —
    // the mutation itself is the actual enforcement boundary, not the UI.
    const eligibleFilms = await getDiyEligibleFilms(repos, params.profileId);
    const chosen = eligibleFilms.find(
      (film) => film.entryId === mode.watchlistEntryId,
    );
    if (!chosen) {
      return {
        ok: false,
        error: "invalid_candidate",
        message: "That film isn't eligible for manual selection.",
      };
    }
    if (usedFilmIds.has(chosen.filmId)) {
      return {
        ok: false,
        error: "already_in_draft",
        message: "That film is already part of this draft.",
      };
    }
    newFilmId = chosen.filmId;
    newWatchlistEntryId = chosen.entryId;
    substitutionReason = "manual_replace";
  } else {
    // The exact same pool/eligibility normal random draft generation draws
    // from (including its default sequel/franchise-order exclusion) —
    // never a second, simplified random picker.
    const candidates = await fetchLocalChallengeCandidates(
      repos,
      params.profileId,
    );
    const pool = candidates.filter(
      (candidate) => !usedFilmIds.has(candidate.filmId),
    );
    if (pool.length === 0) {
      return {
        ok: false,
        error: "nothing_available",
        message:
          "No other eligible watchlist films are available to replace this one.",
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
    let picked = pool.find(
      (candidate) => candidate.watchlistEntryId === pickedEntryId,
    )!;

    if (params.franchiseChronologicalOrder) {
      const franchisePool = pool.filter(
        (candidate) => candidate.watchlistEntryId !== picked.watchlistEntryId,
      );
      picked = resolveFranchiseChronologicalPick({
        rolled: picked,
        pool: franchisePool,
      });
    }

    newFilmId = picked.filmId;
    newWatchlistEntryId = picked.watchlistEntryId;
    substitutionReason = "user_reroll";
  }

  const previousWatchlistEntryId = item.watchlistEntryId;
  await repos.drafts.updateItem({
    ...item,
    filmId: newFilmId,
    watchlistEntryId: newWatchlistEntryId,
    isCompleted: false,
    completedAt: null,
    watchedHistoryId: null,
    originFilmId: item.originFilmId ?? item.filmId,
    substitutionReason,
  });

  return { ok: true, newFilmId, previousWatchlistEntryId };
}
