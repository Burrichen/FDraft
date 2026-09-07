import { fetchLocalChallengeCandidates } from "@/application/drafts/local-fetch-context";
import { getEffectiveEventDate } from "@/application/events/event-clock";
import {
  pickEventCategoryRandomFilm,
  resolveEventCategoryPickerCandidates,
  type EventCategoryPickerCandidate,
} from "@/application/events/resolve-event-category-candidates";
import { mergeLocalFilmMetadata } from "@/application/watchlist/merge-local-film-metadata";
import { resolveEligibleCandidates } from "@/domain/events/event-eligibility";
import { getCurrentOccurrenceBounds } from "@/domain/events/event-availability";
import { getEventDefinition } from "@/domain/events/event-registry";
import type { OneAtATimeStagedItem } from "@/domain/drafts/one-at-a-time";
import { defaultIdGenerator, type IdGenerator } from "@/domain/shared/id";
import { createDefaultRng, type Rng } from "@/domain/shared/rng";
import { pickRandomFilm } from "@/domain/watchlist/random-pick";
import { SystemClock, type Clock } from "@/domain/time/clock";
import type { DraftRepository } from "@/repositories/draft-repository";
import type { FilmRepository } from "@/repositories/film-repository";
import type { HistoryRepository } from "@/repositories/history-repository";
import type { ProfileRepository } from "@/repositories/profile-repository";
import type { SettingsRepository } from "@/repositories/settings-repository";
import type { DraftItemRecord, DraftRecord } from "@/repositories/records";
import type { WatchlistRepository } from "@/repositories/watchlist-repository";

type EventOneAtATimeRepos = {
  watchlist: WatchlistRepository;
  films: FilmRepository;
  drafts: DraftRepository;
  history: HistoryRepository;
  settings: SettingsRepository;
  profiles: ProfileRepository;
};

export interface EventOneAtATimeCandidateFilm {
  filmId: string;
  title: string;
  releaseYear: number | null;
  posterUrl: string | null;
  runtimeMinutes: number | null;
  averageRating: number | null;
  /** `null` for January (no categories). */
  eventCategoryKey: string | null;
}

export type PickEventOneAtATimeRandomFilmOutcome =
  | { ok: true; film: EventOneAtATimeCandidateFilm }
  | { ok: false; error: "nothing_available"; message: string };

/**
 * The generic "Random" entry point for Event One At A Time (see
 * docs/updates, "FDRAFT UPDATE 1 — EVENT ONE AT A TIME DRAFTING" §5/§7/§8)
 * — ONE function serving every category-based event (Halloween/Christmas,
 * via `categoryKey`) and January (no categories, `categoryKey: null`,
 * candidates narrowed through its own `eligibilityRules` against the real
 * watchlist — the exact same eligibility engine `createLocalDraft` already
 * uses for a January-sourced draft, so "Do not accidentally show the
 * entire normal Watchlist" is satisfied by construction).
 */
export async function pickEventOneAtATimeRandomFilm(
  repos: EventOneAtATimeRepos,
  params: {
    profileId: string;
    eventId: string;
    categoryKey: string | null;
    excludeFilmIds: readonly string[];
    preferWatchlist?: boolean;
  },
  deps: { rng?: Rng } = {},
): Promise<PickEventOneAtATimeRandomFilmOutcome> {
  if (params.categoryKey !== null) {
    const outcome = await pickEventCategoryRandomFilm(
      repos,
      {
        profileId: params.profileId,
        eventId: params.eventId,
        categoryKey: params.categoryKey,
        excludeFilmIds: params.excludeFilmIds,
        preferWatchlist: params.preferWatchlist ?? true,
      },
      deps,
    );
    if (!outcome.ok) {
      return outcome;
    }
    return {
      ok: true,
      film: { ...outcome.film, eventCategoryKey: params.categoryKey },
    };
  }

  // January: no categories — the canonical event-eligible pool, drawn from
  // the profile's REAL watchlist (never the whole thing unfiltered).
  const rng = deps.rng ?? createDefaultRng();
  const event = getEventDefinition(params.eventId);
  const excluded = new Set(params.excludeFilmIds);
  const rawCandidates = await fetchLocalChallengeCandidates(
    repos,
    params.profileId,
  );
  const eligible = event
    ? resolveEligibleCandidates(rawCandidates, event.eligibilityRules)
    : rawCandidates;
  const candidates = eligible.filter(
    (candidate) => !excluded.has(candidate.filmId),
  );

  const pickedFilmId = pickRandomFilm(
    candidates.map((candidate) => ({
      id: candidate.filmId,
      weight: candidate.selectionWeight,
    })),
    rng,
  );
  if (pickedFilmId === null) {
    return {
      ok: false,
      error: "nothing_available",
      message: "No more eligible films are available to pick from.",
    };
  }
  const picked = candidates.find(
    (candidate) => candidate.filmId === pickedFilmId,
  )!;
  const metadata = mergeLocalFilmMetadata(
    await repos.films.getMetadataForFilm(picked.filmId),
  );
  return {
    ok: true,
    film: {
      filmId: picked.filmId,
      title: picked.title,
      releaseYear: picked.releaseYear,
      posterUrl: metadata.posterUrl,
      runtimeMinutes: metadata.runtimeMinutes,
      averageRating: metadata.averageRating,
      eventCategoryKey: null,
    },
  };
}

export interface EventOneAtATimePickerCandidate {
  filmId: string;
  title: string;
  releaseYear: number | null;
  runtimeMinutes: number | null;
  averageRating: number | null;
  posterUrl: string | null;
  eventCategoryKey: string | null;
  onWatchlist: boolean;
}

/**
 * The generic "Choose My Own" candidate list (see docs/updates §6/§7/§8) —
 * dispatches exactly like `pickEventOneAtATimeRandomFilm`: a category
 * (Halloween/Christmas) delegates to `resolveEventCategoryPickerCandidates`;
 * no category (January) narrows the profile's own watchlist through its
 * `eligibilityRules`, mirroring `getDiyEligibleFilms`'s exact shape/
 * eligibility (`applyFranchiseOrderingRule: false`, since this is manual
 * selection) with the one addition every January film already satisfies:
 * `onWatchlist: true` (January's whole pool IS the watchlist).
 */
export async function resolveEventOneAtATimePickerCandidates(
  repos: EventOneAtATimeRepos,
  params: {
    profileId: string;
    eventId: string;
    categoryKey: string | null;
    excludeFilmIds: readonly string[];
  },
): Promise<EventOneAtATimePickerCandidate[]> {
  if (params.categoryKey !== null) {
    const candidates: EventCategoryPickerCandidate[] =
      await resolveEventCategoryPickerCandidates(repos, {
        profileId: params.profileId,
        eventId: params.eventId,
        categoryKey: params.categoryKey,
        excludeFilmIds: params.excludeFilmIds,
      });
    return candidates.map((candidate) => ({
      filmId: candidate.filmId,
      title: candidate.title,
      releaseYear: candidate.releaseYear,
      runtimeMinutes: candidate.runtimeMinutes,
      averageRating: candidate.averageRating,
      posterUrl: candidate.posterUrl,
      eventCategoryKey: candidate.categoryKey,
      onWatchlist: candidate.onWatchlist,
    }));
  }

  const event = getEventDefinition(params.eventId);
  const excluded = new Set(params.excludeFilmIds);
  const rawCandidates = await fetchLocalChallengeCandidates(
    repos,
    params.profileId,
    { applyFranchiseOrderingRule: false },
  );
  const eligible = event
    ? resolveEligibleCandidates(rawCandidates, event.eligibilityRules)
    : rawCandidates;
  const filtered = eligible.filter(
    (candidate) => !excluded.has(candidate.filmId),
  );
  const metadataByFilmId = await repos.films.getMetadataForFilms(
    filtered.map((candidate) => candidate.filmId),
  );
  return filtered.map((candidate) => {
    const metadata = mergeLocalFilmMetadata(
      metadataByFilmId.get(candidate.filmId) ?? [],
    );
    return {
      filmId: candidate.filmId,
      title: candidate.title,
      releaseYear: candidate.releaseYear,
      runtimeMinutes: candidate.runtimeMinutes,
      averageRating: candidate.averageRating,
      posterUrl: metadata.posterUrl,
      eventCategoryKey: null,
      onWatchlist: true,
    };
  });
}

export type FinalizeEventOneAtATimeDraftErrorCode =
  "already_active" | "empty_selection" | "duplicate_film" | "invalid_event";
export type FinalizeEventOneAtATimeDraftOutcome =
  | { ok: true; draftId: string }
  | {
      ok: false;
      error: FinalizeEventOneAtATimeDraftErrorCode;
      message: string;
    };

/**
 * "Done" for Event One At A Time (see docs/updates §3/§15/§16/§17) —
 * modeled directly on `finalizeOneAtATimeDraft`, with two differences: it
 * checks the EVENT-scoped active-draft slot (never colliding with — or
 * being blocked by — a normal Draft, exactly like
 * `createHalloweenLocalDraft`'s own check), and it has no `timeMode`
 * parameter at all — the deadline is always the event's own fixed
 * occurrence end (`fixedEventDeadline`, all three events), never a
 * profile-chosen Calendar/Timer. Sets `sourceEventId`/
 * `sourceEventManuallyEnabled`/`eventOccurrenceYear` so the normal, fully
 * generic currency-earning engine (`awardEventDraftItemReward`) applies
 * with zero new award code (§16) — nothing here ever touches
 * `PointsRepository` directly. Only this function ever writes anything;
 * every prior "Random"/"Choose My Own" step is a pure read (§17:
 * cancelling the builder at any point creates no Draft, no points, no
 * History).
 */
export async function finalizeEventOneAtATimeDraft(
  repos: EventOneAtATimeRepos,
  params: {
    profileId: string;
    timezone: string;
    eventId: string;
    items: readonly OneAtATimeStagedItem[];
    /**
     * Whether the profile reached this builder via manual activation
     * rather than the event's real natural window — captured once, here,
     * exactly like `createLocalDraft`/`createHalloweenLocalDraft`'s own
     * `sourceEventManuallyEnabled` param, so a later Settings change can
     * never retroactively change which currency this draft's completion
     * awards (see `resolveDraftCompletionReward`'s persisted-context rule).
     * The caller (already having resolved "is this event currently
     * active" via `getEventDiscovery` to even reach this builder) passes
     * it straight through.
     */
    sourceEventManuallyEnabled: boolean;
  },
  deps: { idGenerator?: IdGenerator; clock?: Clock } = {},
): Promise<FinalizeEventOneAtATimeDraftOutcome> {
  const idGenerator = deps.idGenerator ?? defaultIdGenerator;
  const clock = deps.clock ?? new SystemClock();
  const { profileId, timezone, eventId, items } = params;

  const event = getEventDefinition(eventId);
  if (!event) {
    return {
      ok: false,
      error: "invalid_event",
      message: "This event is no longer registered.",
    };
  }

  if (await repos.drafts.hasActiveDraft(profileId, eventId)) {
    return {
      ok: false,
      error: "already_active",
      message:
        "You already have an active draft for this event. Finish or expire it before starting another.",
    };
  }

  if (items.length === 0) {
    return {
      ok: false,
      error: "empty_selection",
      message: "Select at least one film before finishing.",
    };
  }

  const filmIds = items.map((item) => item.filmId);
  if (new Set(filmIds).size !== filmIds.length) {
    return {
      ok: false,
      error: "duplicate_film",
      message: "The same film was staged more than once.",
    };
  }

  const effectiveNow = await getEffectiveEventDate(repos, profileId, {
    clock,
  });
  const now = clock.now();
  // Non-null: this event has `fixedEventDeadline` (Halloween/Christmas/
  // January all do), so `availability.recurringMonthDayRange` is always
  // set — see each event's own registry entry.
  const deadlineAt = getCurrentOccurrenceBounds(
    event.availability,
    effectiveNow,
    timezone,
  )!.end;
  const eventOccurrenceYearFormatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
  }).format(effectiveNow);
  const eventOccurrenceYear = Number(eventOccurrenceYearFormatted);

  const draftId = idGenerator.generate();
  const draft: DraftRecord = {
    id: draftId,
    profileId,
    difficulty: "one-at-a-time",
    timeMode: "timer",
    status: "active",
    totalFilms: items.length,
    randomFilmCount: items.filter((item) => item.source === "random").length,
    challengeFilmCount: items.filter((item) => item.source === "challenge")
      .length,
    challengeMode: null,
    startedAt: now.toISOString(),
    deadlineAt: deadlineAt.toISOString(),
    timezone,
    completedAt: null,
    freeformAchievedRank: null,
    sourceEventId: eventId,
    sourceEventManuallyEnabled: params.sourceEventManuallyEnabled,
    rewardsGrantedAt: null,
    customName: null,
    eventOccurrenceYear,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  await repos.drafts.createDraft(draft);

  const draftItems: DraftItemRecord[] = items.map((item, index) => ({
    id: idGenerator.generate(),
    draftId,
    filmId: item.filmId,
    watchlistEntryId: item.watchlistEntryId,
    source: item.source,
    challengeId: item.challengeId,
    challengeAttemptId: null,
    challengeDisplayValue: item.challengeDisplayValue,
    orderIndex: index,
    isCompleted: false,
    completedAt: null,
    watchedHistoryId: null,
    originFilmId: null,
    substitutionReason: null,
    eventRewardGrantedAt: null,
    eventCategoryKey: item.eventCategoryKey ?? null,
    createdAt: now.toISOString(),
  }));
  await repos.drafts.createItems(draftItems);

  return { ok: true, draftId };
}
