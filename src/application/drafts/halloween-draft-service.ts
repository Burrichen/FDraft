import { formatInTimeZone } from "date-fns-tz";
import {
  fetchHalloweenAdjacentCandidates,
  fetchHalloweenManifestCandidates,
} from "@/application/drafts/halloween-fetch-context";
import { getFilmCount } from "@/domain/drafts/difficulty";
import {
  isValidHalloweenSplit,
  type HalloweenSplit,
} from "@/domain/drafts/halloween-split";
import {
  getCurrentOccurrenceBounds,
  isEventAvailable,
} from "@/domain/events/event-availability";
import {
  getEventDefinition,
  HALLOWEEN_EVENT_ID,
} from "@/domain/events/event-registry";
import { getHalloweenManifestFilmIds } from "@/domain/events/halloween-manifest-overlay";
import { defaultIdGenerator, type IdGenerator } from "@/domain/shared/id";
import { createDefaultRng, type Rng } from "@/domain/shared/rng";
import { pickRandomFilms } from "@/domain/watchlist/random-pick";
import { SystemClock, type Clock } from "@/domain/time/clock";
import type { DraftRepository } from "@/repositories/draft-repository";
import type { FilmRepository } from "@/repositories/film-repository";
import type { HistoryRepository } from "@/repositories/history-repository";
import type {
  DraftDifficulty,
  DraftItemRecord,
  DraftRecord,
} from "@/repositories/records";
import type { WatchlistRepository } from "@/repositories/watchlist-repository";

type HalloweenDraftRepos = {
  watchlist: WatchlistRepository;
  films: FilmRepository;
  drafts: DraftRepository;
  history: HistoryRepository;
};

export type CreateHalloweenDraftErrorCode =
  | "already_active"
  | "not_available"
  | "invalid_allocation"
  | "not_enough_films";
export type CreateHalloweenDraftOutcome =
  | { ok: true; draftId: string }
  | { ok: false; error: CreateHalloweenDraftErrorCode; message: string };

/**
 * Builds a Halloween Draft (see docs/updates, "PROMPT 19 — HALLOWEEN DRAFT
 * MECHANICS") — modeled directly on `createLocalDraft`, but drawing from
 * three pools (Halloween-adjacent / Horror / Kitsch) instead of a Random/
 * Challenge split, and never touching the Challenge Engine at all.
 *
 * Halloween has no Freeform mode (`params.difficulty` is deliberately
 * typed to exclude it) — `getFilmCount` is the same single source of
 * truth every other difficulty count in the app reads from (see
 * docs/updates §1: "Reuse existing domain configuration").
 *
 * Draws sequentially with cross-pool exclusion (§8, "generate without
 * replacement" — a film qualifying for more than one pool must still
 * appear only once): Halloween-adjacent first, then Horror excluding
 * whatever Halloween-adjacent already picked, then Kitsch excluding both.
 * Each pool uses the existing, tested `pickRandomFilms` — Horror/Kitsch
 * candidates (off-watchlist, no `selectionWeight` concept) are weighted
 * `1` each.
 *
 * `params.effectiveNow` (see docs/updates, "PROMPT 21 — HALLOWEEN RELEASE
 * HARDENING", §"HALLOWEEN EXPIRY": "After expiry: no new Halloween
 * Draft") gates creation on Halloween's own natural window — deliberately
 * a SEPARATE time concept from `deps.clock`, which still governs every
 * real persisted timestamp (`startedAt`/`createdAt`) unchanged. The caller
 * resolves `effectiveNow` via `getEffectiveEventDate` (so Admin Mode's
 * simulated date correctly permits/denies creation during testing, exactly
 * like the opt-in flow already does) and passes it in; omitted, this
 * defaults to the real wall clock. This is intentionally Halloween-specific
 * — the generic `createLocalDraft`/January path is deliberately left
 * unchanged (see docs/updates, "PROMPT 18", scope note on why an
 * availability re-check was NOT added there).
 *
 * No `timeMode` parameter (see docs/updates, "PROMPT B2.2 — HALLOWEEN
 * PAGE REBUILD + DEADLINE + STATS" §3: "Remove Halloween deadline
 * selector") — Halloween has ONE fixed deadline, the end of the CURRENT
 * occurrence's natural window (via `getCurrentOccurrenceBounds`, using the
 * same `effectiveNow` the availability gate above just confirmed falls
 * inside it — so a draft created at any point in the window always gets
 * the exact same real deadline, "1 November 00:00" in the profile's own
 * timezone). `DraftRecord.timeMode` is still a required field on the
 * underlying record — set to `"timer"` unconditionally since nothing
 * reads it as a real choice for an event-fixed-deadline draft (see
 * `EventDefinition.fixedEventDeadline`, which `DraftLifecycleView`/History
 * check instead, for both progress display and labeling).
 */
export async function createHalloweenLocalDraft(
  repos: HalloweenDraftRepos,
  params: {
    profileId: string;
    timezone: string;
    difficulty: Exclude<DraftDifficulty, "freeform">;
    split: HalloweenSplit;
    effectiveNow?: Date;
  },
  deps: { idGenerator?: IdGenerator; clock?: Clock; rng?: Rng } = {},
): Promise<CreateHalloweenDraftOutcome> {
  const idGenerator = deps.idGenerator ?? defaultIdGenerator;
  const clock = deps.clock ?? new SystemClock();
  const rng = deps.rng ?? createDefaultRng();
  const { profileId, timezone, split } = params;
  const effectiveNow = params.effectiveNow ?? new Date();

  const halloween = getEventDefinition(HALLOWEEN_EVENT_ID)!;
  if (!isEventAvailable(halloween.availability, effectiveNow, timezone)) {
    return {
      ok: false,
      error: "not_available",
      message: "Halloween isn't available right now.",
    };
  }

  // Scoped to Halloween's OWN draft slot (see docs/updates, "PROMPT B2.1
  // — DUAL DRAFT ARCHITECTURE") — a profile's normal Draft is completely
  // independent and never blocks (or gets blocked by) this.
  if (await repos.drafts.hasActiveDraft(profileId, HALLOWEEN_EVENT_ID)) {
    return {
      ok: false,
      error: "already_active",
      message:
        "You already have an active Halloween Draft. Finish or expire it before starting another.",
    };
  }

  const totalFilms = getFilmCount(params.difficulty);
  if (!isValidHalloweenSplit(split, totalFilms)) {
    return {
      ok: false,
      error: "invalid_allocation",
      message: `The three pool counts must add up to exactly ${totalFilms} films.`,
    };
  }

  const { horrorFilmIds, kitschFilmIds } = getHalloweenManifestFilmIds();
  const [adjacentPool, horrorPool, kitschPool] = await Promise.all([
    fetchHalloweenAdjacentCandidates(repos, profileId),
    fetchHalloweenManifestCandidates(repos, profileId, horrorFilmIds),
    fetchHalloweenManifestCandidates(repos, profileId, kitschFilmIds),
  ]);

  if (adjacentPool.length < split.halloweenAdjacentCount) {
    return {
      ok: false,
      error: "not_enough_films",
      message: `Not enough Halloween-adjacent films on your watchlist (need ${split.halloweenAdjacentCount}, have ${adjacentPool.length}).`,
    };
  }
  const adjacentPickIds = pickRandomFilms(
    adjacentPool.map((candidate) => ({
      id: candidate.watchlistEntryId,
      weight: candidate.selectionWeight,
    })),
    split.halloweenAdjacentCount,
    rng,
  );
  const adjacentByEntryId = new Map(
    adjacentPool.map((candidate) => [candidate.watchlistEntryId, candidate]),
  );
  const pickedFilmIds = new Set(
    adjacentPickIds.map((entryId) => adjacentByEntryId.get(entryId)!.filmId),
  );

  const availableHorrorPool = horrorPool.filter(
    (candidate) => !pickedFilmIds.has(candidate.filmId),
  );
  if (availableHorrorPool.length < split.horrorCount) {
    return {
      ok: false,
      error: "not_enough_films",
      message: `Not enough Horror films available (need ${split.horrorCount}, have ${availableHorrorPool.length}).`,
    };
  }
  const horrorPickIds = pickRandomFilms(
    availableHorrorPool.map((candidate) => ({
      id: candidate.filmId,
      weight: 1,
    })),
    split.horrorCount,
    rng,
  );
  horrorPickIds.forEach((filmId) => pickedFilmIds.add(filmId));

  const availableKitschPool = kitschPool.filter(
    (candidate) => !pickedFilmIds.has(candidate.filmId),
  );
  if (availableKitschPool.length < split.kitschCount) {
    return {
      ok: false,
      error: "not_enough_films",
      message: `Not enough Kitsch films available (need ${split.kitschCount}, have ${availableKitschPool.length}).`,
    };
  }
  const kitschPickIds = pickRandomFilms(
    availableKitschPool.map((candidate) => ({
      id: candidate.filmId,
      weight: 1,
    })),
    split.kitschCount,
    rng,
  );

  const now = clock.now();
  const draftId = idGenerator.generate();
  // Non-null: `isEventAvailable` above already confirmed `effectiveNow`
  // falls inside Halloween's `recurringMonthDayRange` occurrence.
  const deadlineAt = getCurrentOccurrenceBounds(
    halloween.availability,
    effectiveNow,
    timezone,
  )!.end;
  // Captured from `effectiveNow` (Admin-aware), never `now`/`clock.now()`
  // (always the real wall clock — see `DraftRecord.eventOccurrenceYear`'s
  // own comment) — so this draft's canonical "Halloween <year> Draft" title
  // reflects whatever occurrence Admin Event Testing is actually simulating
  // right now, not the computer's unrelated real year.
  const eventOccurrenceYear = Number(
    formatInTimeZone(effectiveNow, timezone, "yyyy"),
  );

  const draft: DraftRecord = {
    id: draftId,
    profileId,
    difficulty: params.difficulty,
    timeMode: "timer",
    status: "active",
    totalFilms,
    randomFilmCount: totalFilms,
    challengeFilmCount: 0,
    challengeMode: null,
    startedAt: now.toISOString(),
    deadlineAt: deadlineAt.toISOString(),
    timezone,
    completedAt: null,
    freeformAchievedRank: null,
    sourceEventId: HALLOWEEN_EVENT_ID,
    sourceEventManuallyEnabled: null,
    rewardsGrantedAt: null,
    customName: null,
    eventOccurrenceYear,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  await repos.drafts.createDraft(draft);

  let orderIndex = 0;
  const items: DraftItemRecord[] = [];

  for (const entryId of adjacentPickIds) {
    const candidate = adjacentByEntryId.get(entryId)!;
    items.push(
      buildHalloweenDraftItem({
        idGenerator,
        draftId,
        filmId: candidate.filmId,
        watchlistEntryId: entryId,
        source: "halloween-adjacent",
        orderIndex: orderIndex++,
        now,
      }),
    );
  }
  for (const filmId of horrorPickIds) {
    items.push(
      buildHalloweenDraftItem({
        idGenerator,
        draftId,
        filmId,
        watchlistEntryId: null,
        source: "horror",
        orderIndex: orderIndex++,
        now,
      }),
    );
  }
  for (const filmId of kitschPickIds) {
    items.push(
      buildHalloweenDraftItem({
        idGenerator,
        draftId,
        filmId,
        watchlistEntryId: null,
        source: "kitsch",
        orderIndex: orderIndex++,
        now,
      }),
    );
  }

  await repos.drafts.createItems(items);

  return { ok: true, draftId };
}

function buildHalloweenDraftItem(params: {
  idGenerator: IdGenerator;
  draftId: string;
  filmId: string;
  watchlistEntryId: string | null;
  source: "halloween-adjacent" | "horror" | "kitsch";
  orderIndex: number;
  now: Date;
}): DraftItemRecord {
  return {
    id: params.idGenerator.generate(),
    draftId: params.draftId,
    filmId: params.filmId,
    watchlistEntryId: params.watchlistEntryId,
    source: params.source,
    challengeId: null,
    challengeAttemptId: null,
    challengeDisplayValue: null,
    orderIndex: params.orderIndex,
    isCompleted: false,
    completedAt: null,
    watchedHistoryId: null,
    originFilmId: null,
    substitutionReason: null,
    createdAt: params.now.toISOString(),
  };
}
