import { formatInTimeZone } from "date-fns-tz";
import {
  fetchChristmasCategoryPool,
  type ChristmasCategoryKey,
  type ChristmasPoolCandidate,
} from "@/application/drafts/christmas-fetch-context";
import { getFilmCount } from "@/domain/drafts/difficulty";
import {
  isValidChristmasSplit,
  type ChristmasSplit,
} from "@/domain/drafts/christmas-split";
import { drawPreferringWatchlist } from "@/domain/drafts/prefer-watchlist-draw";
import {
  getCurrentOccurrenceBounds,
  isEventAvailable,
} from "@/domain/events/event-availability";
import {
  CHRISTMAS_EVENT_ID,
  getEventDefinition,
} from "@/domain/events/event-registry";
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

type ChristmasDraftRepos = {
  watchlist: WatchlistRepository;
  films: FilmRepository;
  drafts: DraftRepository;
  history: HistoryRepository;
};

export type CreateChristmasDraftErrorCode =
  | "already_active"
  | "not_available"
  | "invalid_allocation"
  | "not_enough_films";
export type CreateChristmasDraftOutcome =
  | { ok: true; draftId: string }
  | { ok: false; error: CreateChristmasDraftErrorCode; message: string };

/**
 * Builds a fixed-size Christmas Draft (see docs/updates, "FDRAFT UPDATE 1
 * — CHRISTMAS DRAFT DIFFICULTIES + VISUAL POLISH" §1-§5) — the direct
 * counterpart of `createHalloweenLocalDraft`, deliberately built to the
 * same shape so the two Events behave identically: the shared
 * `DIFFICULTIES` film counts via `getFilmCount` (never a Christmas-only
 * count table — §2), no Freeform, no Challenge Engine involvement of any
 * kind, availability gated on the Event's own natural window through the
 * caller's Admin-aware `effectiveNow`, ONE fixed deadline pinned to the
 * occurrence end rather than a Calendar/Timer choice, and a sequential
 * cross-pool draw so a film curated into BOTH categories can never appear
 * twice in one Draft.
 *
 * TWO pools (Classic, then Christmas Adjacent excluding whatever Classic
 * already took), allocated by `ChristmasSplit` — itself a thin adapter
 * over the app's existing two-way split primitives, not a reimplementation
 * (see `christmas-split.ts`).
 *
 * `preferWatchlist` draws through the shared, generic
 * `drawPreferringWatchlist` (`prefer-watchlist-draw.ts`) — the SAME rule
 * `createHalloweenLocalDraft` now uses for Horror/Kitsch, not a
 * Christmas-only copy (see docs/updates, "FDRAFT UPDATE 1 — EVENT
 * WATCHLIST PREFERENCE CLEANUP" §10). When on, each pool draws in TWO
 * passes: first from the intersection of that curated category and the
 * profile's ACTIVE watchlist — weighted by each entry's real
 * `selectionWeight`, since those are real watchlist rows — and then, only
 * if that intersection couldn't fill the requested count, tops up from the
 * rest of the curated category, weighted flat. So it is a genuine
 * PREFERENCE and never a requirement: a profile with an empty watchlist
 * gets exactly the same Draft they would with the toggle off. When off,
 * the whole pool is drawn in one flat-weighted pass.
 *
 * `DraftItemRecord.watchlistEntryId` is populated whenever the drawn film
 * happens to be on the watchlist and left `null` otherwise — the same
 * "either watch path completes this item" reasoning
 * `rollSingleFilmEventDraft` documents. `eventCategoryKey` records which
 * category each film came from, so History/the Draft grid can show
 * "Classic · Random" style provenance through the existing generic field
 * rather than inventing new `source` values.
 */
export async function createChristmasLocalDraft(
  repos: ChristmasDraftRepos,
  params: {
    profileId: string;
    timezone: string;
    difficulty: Exclude<DraftDifficulty, "freeform" | "one-at-a-time">;
    split: ChristmasSplit;
    preferWatchlist: boolean;
    /** Whether the profile reached Christmas by manual activation rather than its natural window — captured once, here, exactly like every other Event Draft path (see `resolveDraftCompletionReward`'s persisted-context rule). */
    sourceEventManuallyEnabled: boolean;
    /** Admin-aware "now" for the availability gate and occurrence math (see `getEffectiveEventDate`). Omitted, defaults to the real wall clock. */
    effectiveNow?: Date;
  },
  deps: { idGenerator?: IdGenerator; clock?: Clock; rng?: Rng } = {},
): Promise<CreateChristmasDraftOutcome> {
  const idGenerator = deps.idGenerator ?? defaultIdGenerator;
  const clock = deps.clock ?? new SystemClock();
  const rng = deps.rng ?? createDefaultRng();
  const { profileId, timezone, split } = params;
  const effectiveNow = params.effectiveNow ?? new Date();

  const christmas = getEventDefinition(CHRISTMAS_EVENT_ID)!;
  if (!isEventAvailable(christmas.availability, effectiveNow, timezone)) {
    return {
      ok: false,
      error: "not_available",
      message: "Christmas isn't available right now.",
    };
  }

  // Scoped to Christmas's OWN Draft slot — a profile's normal Draft, and
  // any other Event's, are completely independent and never block this
  // (see the Dual Draft architecture).
  if (await repos.drafts.hasActiveDraft(profileId, CHRISTMAS_EVENT_ID)) {
    return {
      ok: false,
      error: "already_active",
      message:
        "You already have an active Christmas Draft. Finish or expire it before starting another.",
    };
  }

  const totalFilms = getFilmCount(params.difficulty);
  if (!isValidChristmasSplit(totalFilms, split)) {
    return {
      ok: false,
      error: "invalid_allocation",
      message: `The two category counts must add up to exactly ${totalFilms} films.`,
    };
  }

  const [classicPool, adjacentPool] = await Promise.all([
    fetchChristmasCategoryPool(repos, { profileId, categoryKey: "classic" }),
    fetchChristmasCategoryPool(repos, { profileId, categoryKey: "adjacent" }),
  ]);

  const drawn: Array<{
    candidate: ChristmasPoolCandidate;
    categoryKey: ChristmasCategoryKey;
  }> = [];
  const takenFilmIds = new Set<string>();

  for (const [categoryKey, pool, requested, label] of [
    ["classic", classicPool, split.classicCount, "Classic"],
    ["adjacent", adjacentPool, split.adjacentCount, "Christmas Adjacent"],
  ] as const) {
    // Cross-pool exclusion: whatever Classic already took is off the table
    // for Christmas Adjacent, so a film curated into both is never drawn
    // twice into the same Draft.
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
      drawn.push({ candidate, categoryKey });
    }
  }

  const now = clock.now();
  const draftId = idGenerator.generate();
  // Non-null: the availability gate above already confirmed `effectiveNow`
  // falls inside this occurrence.
  const deadlineAt = getCurrentOccurrenceBounds(
    christmas.availability,
    effectiveNow,
    timezone,
  )!.end;
  // From `effectiveNow` (Admin-aware), never `clock.now()` — so this
  // Draft's canonical "Christmas <year> Draft" title reflects whichever
  // occurrence is actually being simulated (see §8, and
  // `DraftRecord.eventOccurrenceYear`).
  const eventOccurrenceYear = Number(
    formatInTimeZone(effectiveNow, timezone, "yyyy"),
  );

  const draft: DraftRecord = {
    id: draftId,
    profileId,
    difficulty: params.difficulty,
    // Not a real choice for a `fixedEventDeadline` Event — see
    // `createHalloweenLocalDraft`'s identical note.
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
    sourceEventId: CHRISTMAS_EVENT_ID,
    sourceEventManuallyEnabled: params.sourceEventManuallyEnabled,
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
    source: "random",
    challengeId: null,
    challengeAttemptId: null,
    challengeDisplayValue: null,
    orderIndex: index,
    isCompleted: false,
    completedAt: null,
    watchedHistoryId: null,
    originFilmId: null,
    substitutionReason: null,
    eventRewardGrantedAt: null,
    eventCategoryKey: entry.categoryKey,
    createdAt: now.toISOString(),
  }));
  await repos.drafts.createItems(items);

  return { ok: true, draftId };
}
