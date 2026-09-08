import { formatInTimeZone } from "date-fns-tz";
import {
  fetchHalloweenManifestCandidates,
  type HalloweenPoolCandidate,
} from "@/application/drafts/halloween-fetch-context";
import { getFilmCount } from "@/domain/drafts/difficulty";
import {
  isValidHalloweenSplit,
  type HalloweenSplit,
} from "@/domain/drafts/halloween-split";
import { drawPreferringWatchlist } from "@/domain/drafts/prefer-watchlist-draw";
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
 * Builds a fixed-size Halloween Draft (see docs/updates, "FDRAFT UPDATE 1
 * — EVENT WATCHLIST PREFERENCE CLEANUP" §1/§2/§6) — the direct counterpart
 * of `createChristmasLocalDraft`, built to the same shape so the two
 * Events behave identically: the shared `DIFFICULTIES` film counts via
 * `getFilmCount`, no Freeform, no Challenge Engine involvement of any
 * kind, availability gated on Halloween's own natural window through the
 * caller's Admin-aware `effectiveNow`, ONE fixed deadline pinned to the
 * occurrence end, and a sequential cross-pool draw so a film curated into
 * BOTH categories can never appear twice in one Draft.
 *
 * TWO pools — Horror, then Kitsch excluding whatever Horror already took —
 * allocated by `HalloweenSplit`, itself a thin adapter over the app's
 * existing two-way split primitives (see `halloween-split.ts`). The third,
 * watchlist-derived "Halloween-adjacent" pool this used to also draw from
 * is gone (see docs/updates §1) — an OLD Draft item can still carry that
 * historical `source` value (`DraftItemSource`'s own doc comment), but
 * nothing here creates a new one.
 *
 * `preferWatchlist` draws through the shared, generic
 * `drawPreferringWatchlist` (`prefer-watchlist-draw.ts`) — the exact same
 * rule `createChristmasLocalDraft` uses for Classic/Christmas Adjacent, so
 * the two Events can never disagree about what "prefer" means. When on,
 * each pool draws in TWO passes: first the intersection of that pool and
 * the profile's ACTIVE watchlist, weighted by each entry's real
 * `selectionWeight`; then, only if that intersection couldn't fill the
 * requested count, tops up from the rest of the pool, flat-weighted. A
 * genuine PREFERENCE, never a requirement — an empty watchlist drafts
 * exactly the same. When off, the whole pool draws in one flat-weighted
 * pass.
 *
 * `DraftItemRecord.watchlistEntryId` is populated whenever the drawn film
 * happens to be on the watchlist and left `null` otherwise — the same
 * "either watch path completes this item" reasoning
 * `rollSingleFilmEventDraft` documents.
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
 * unchanged.
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
    preferWatchlist: boolean;
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
  if (!isValidHalloweenSplit(totalFilms, split)) {
    return {
      ok: false,
      error: "invalid_allocation",
      message: `The two category counts must add up to exactly ${totalFilms} films.`,
    };
  }

  const { horrorFilmIds, kitschFilmIds } = getHalloweenManifestFilmIds();
  const [horrorPool, kitschPool] = await Promise.all([
    fetchHalloweenManifestCandidates(repos, profileId, horrorFilmIds),
    fetchHalloweenManifestCandidates(repos, profileId, kitschFilmIds),
  ]);

  const drawn: Array<{
    candidate: HalloweenPoolCandidate;
    source: "horror" | "kitsch";
  }> = [];
  const takenFilmIds = new Set<string>();

  for (const [source, pool, requested, label] of [
    ["horror", horrorPool, split.horrorCount, "Horror"],
    ["kitsch", kitschPool, split.kitschCount, "Kitsch"],
  ] as const) {
    // Cross-pool exclusion: whatever Horror already took is off the table
    // for Kitsch, so a film curated into both is never drawn twice into
    // the same Draft.
    const available = pool.filter(
      (candidate) => !takenFilmIds.has(candidate.filmId),
    );
    if (available.length < requested) {
      return {
        ok: false,
        error: "not_enough_films",
        message: `Not enough ${label} films available (need ${requested}, have ${available.length}).`,
      };
    }
    for (const candidate of drawPreferringWatchlist(
      available,
      requested,
      params.preferWatchlist,
      rng,
    )) {
      takenFilmIds.add(candidate.filmId);
      drawn.push({ candidate, source });
    }
  }

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

  const items: DraftItemRecord[] = drawn.map((entry, index) => ({
    id: idGenerator.generate(),
    draftId,
    filmId: entry.candidate.filmId,
    watchlistEntryId: entry.candidate.watchlistEntryId,
    source: entry.source,
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
  }));
  await repos.drafts.createItems(items);

  return { ok: true, draftId };
}
