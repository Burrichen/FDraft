import {
  fetchLocalChallengeCandidates,
  fetchLocalChallengeWatchedFilms,
} from "@/application/drafts/local-fetch-context";
import { mergeLocalFilmMetadata } from "@/application/watchlist/merge-local-film-metadata";
import { challengeRegistry } from "@/domain/challenges/catalogue";
import { attemptChosenChallenges } from "@/domain/challenges/choose";
import {
  DEFAULT_CHALLENGE_ENGINE_CONFIG,
  type ChallengeContext,
  type ChallengeResult,
} from "@/domain/challenges/types";
import { calculateDraftDeadline } from "@/domain/drafts/deadline";
import type { OneAtATimeStagedItem } from "@/domain/drafts/one-at-a-time";
import { defaultIdGenerator, type IdGenerator } from "@/domain/shared/id";
import { createDefaultRng, type Rng } from "@/domain/shared/rng";
import { pickRandomFilm } from "@/domain/watchlist/random-pick";
import { SystemClock, type Clock } from "@/domain/time/clock";
import type { DraftRepository } from "@/repositories/draft-repository";
import type { FilmRepository } from "@/repositories/film-repository";
import type { HistoryRepository } from "@/repositories/history-repository";
import type {
  DraftItemRecord,
  DraftRecord,
  DraftTimeMode,
} from "@/repositories/records";
import type { WatchlistRepository } from "@/repositories/watchlist-repository";

type OneAtATimeRepos = {
  watchlist: WatchlistRepository;
  films: FilmRepository;
  drafts: DraftRepository;
  history: HistoryRepository;
};

/**
 * A candidate film as the One At A Time builder's own confirmation
 * screens present it (see docs/updates, "ONE AT A TIME DRAFTING —
 * COMPLETE UX" §4/§7: "poster; title; year; runtime; rating") — richer
 * than `ChallengeCandidateFilm` by exactly one field (`posterUrl`, added
 * via `enrichCandidateWithPoster` below), since poster art has no bearing
 * on eligibility/challenge logic and so was never part of that shape.
 */
export interface OneAtATimeCandidateFilm {
  filmId: string;
  watchlistEntryId: string;
  title: string;
  releaseYear: number | null;
  runtimeMinutes: number | null;
  averageRating: number | null;
  posterUrl: string | null;
}

async function enrichCandidateWithPoster(
  repos: OneAtATimeRepos,
  film: {
    filmId: string;
    watchlistEntryId: string;
    title: string;
    releaseYear: number | null;
    runtimeMinutes: number | null;
    averageRating: number | null;
  },
): Promise<OneAtATimeCandidateFilm> {
  const metadata = mergeLocalFilmMetadata(
    await repos.films.getMetadataForFilm(film.filmId),
  );
  return { ...film, posterUrl: metadata.posterUrl };
}

export type PickOneAtATimeRandomFilmOutcome =
  | { ok: true; film: OneAtATimeCandidateFilm }
  | { ok: false; error: "nothing_available"; message: string };

/**
 * The "Random" source for One At A Time (see docs/updates, "ONE AT A TIME
 * DRAFTING — CORE SYSTEM" §6) — deliberately routed through the exact same
 * canonical candidate pool (`fetchLocalChallengeCandidates`) and the same
 * weighted-pick primitive (`pickRandomFilm`) every other random draw in
 * this app uses (a full draft's random slots, a Freeform batch, a
 * missing-metadata reroll), rather than a second, parallel randomness
 * implementation — active-profile eligible, unwatched, and every release/
 * metadata-identity protection `evaluateCandidateEligibility` already
 * applies come along for free. `excludeFilmIds` is always this builder's
 * already-staged films; a Reroll call additionally includes the CURRENT
 * candidate (see docs/updates, "ONE AT A TIME DRAFTING — COMPLETE UX" §4:
 * "exclude current candidate where practical") so rerolling never simply
 * re-shows the same film — the caller decides this, never baked into the
 * shared candidate fetch itself. Enriches the pick with `posterUrl` (via
 * `enrichCandidateWithPoster`) for the confirmation screen — the one field
 * `ChallengeCandidateFilm` doesn't carry, since posters have no bearing on
 * eligibility.
 */
export async function pickOneAtATimeRandomFilm(
  repos: OneAtATimeRepos,
  params: { profileId: string; excludeFilmIds: readonly string[] },
  deps: { rng?: Rng } = {},
): Promise<PickOneAtATimeRandomFilmOutcome> {
  const rng = deps.rng ?? createDefaultRng();
  const excluded = new Set(params.excludeFilmIds);

  const candidates = (
    await fetchLocalChallengeCandidates(repos, params.profileId)
  ).filter((candidate) => !excluded.has(candidate.filmId));

  const pickedEntryId = pickRandomFilm(
    candidates.map((candidate) => ({
      id: candidate.watchlistEntryId,
      weight: candidate.selectionWeight,
    })),
    rng,
  );
  if (pickedEntryId === null) {
    return {
      ok: false,
      error: "nothing_available",
      message: "No more eligible watchlist films are available to pick from.",
    };
  }

  const picked = candidates.find(
    (candidate) => candidate.watchlistEntryId === pickedEntryId,
  )!;
  return {
    ok: true,
    film: await enrichCandidateWithPoster(repos, {
      filmId: picked.filmId,
      watchlistEntryId: picked.watchlistEntryId,
      title: picked.title,
      releaseYear: picked.releaseYear,
      runtimeMinutes: picked.runtimeMinutes,
      averageRating: picked.averageRating,
    }),
  };
}

export interface AttemptOneAtATimeChallengeOutcome {
  challengeId: string;
  result: ChallengeResult;
  /** The resolved film's poster, when `result.status === "success"` — `null` otherwise. Kept alongside `result` rather than folded into it so `ChallengeResult`'s own shape (shared with every other challenge-driven draft path) never needs a One-At-A-Time-only field. */
  posterUrl: string | null;
}

/**
 * The "Challenge" source for One At A Time (see docs/updates §8) —
 * attempts exactly ONE chosen challenge immediately (rather than reserving
 * it for a later bulk-generation step the way the normal multi-slot form
 * does) by reusing `attemptChosenChallenges` with a single-element
 * `chosenChallengeIds` array — the same challenge engine, the same
 * eligibility, the same reroll-on-failure shape (a caller simply attempts
 * again, optionally with a different challenge id, on anything other than
 * `"success"`) every other challenge-driven draft path already uses.
 *
 * Interactive challenges (Battle Royale, Three Doors) are excluded from
 * what `listLocalChallengeAvailability` even offers to pick from in the
 * first place (see that function's own doc comment — their local
 * resolution flow hasn't been ported yet), so `"requires_user_choice"` is
 * not expected to occur in normal use here; a caller still gets a real
 * `ChallengeResult` back either way; and the challengeMode-gated
 * `chosenChallengeIds` interactivity guard, mirrored from
 * `draftConfigInputSchema`, isn't needed here since the id comes from a
 * fixed, already-non-interactive list, not raw user input.
 */
export async function attemptOneAtATimeChallenge(
  repos: OneAtATimeRepos,
  params: {
    profileId: string;
    challengeId: string;
    excludeFilmIds: readonly string[];
    manualGenre?: string;
    diyFilmEntryId?: string;
  },
  deps: { rng?: Rng; clock?: Clock } = {},
): Promise<AttemptOneAtATimeChallengeOutcome> {
  const rng = deps.rng ?? createDefaultRng();
  const clock = deps.clock ?? new SystemClock();
  const excluded = new Set(params.excludeFilmIds);

  const [rawCandidates, watchedFilms] = await Promise.all([
    fetchLocalChallengeCandidates(repos, params.profileId),
    fetchLocalChallengeWatchedFilms(repos, params.profileId),
  ]);
  const candidates = rawCandidates.filter(
    (candidate) => !excluded.has(candidate.filmId),
  );

  const diyEligibleCandidates = params.diyFilmEntryId
    ? (
        await fetchLocalChallengeCandidates(repos, params.profileId, {
          applyFranchiseOrderingRule: false,
        })
      ).filter((candidate) => !excluded.has(candidate.filmId))
    : undefined;

  const context: Omit<ChallengeContext, "previousPicks"> = {
    rng,
    now: clock.now(),
    candidates,
    watchedFilms,
    config: DEFAULT_CHALLENGE_ENGINE_CONFIG,
    ...(diyEligibleCandidates ? { diyEligibleCandidates } : {}),
    ...(params.manualGenre || params.diyFilmEntryId
      ? {
          manualSelections: {
            ...(params.manualGenre ? { genre: params.manualGenre } : {}),
            ...(params.diyFilmEntryId
              ? { diyFilmEntryIds: [params.diyFilmEntryId] }
              : {}),
          },
        }
      : {}),
  };

  const { results } = attemptChosenChallenges({
    registry: challengeRegistry,
    chosenChallengeIds: [params.challengeId],
    context,
  });
  const { challengeId, result } = results[0]!;
  if (result.status !== "success") {
    return { challengeId, result, posterUrl: null };
  }
  const metadata = mergeLocalFilmMetadata(
    await repos.films.getMetadataForFilm(result.film.filmId),
  );
  return { challengeId, result, posterUrl: metadata.posterUrl };
}

export type FinalizeOneAtATimeDraftErrorCode =
  | "already_active"
  | "empty_selection"
  | "duplicate_film"
  | "entry_not_eligible";
export type FinalizeOneAtATimeDraftOutcome =
  | { ok: true; draftId: string }
  | { ok: false; error: FinalizeOneAtATimeDraftErrorCode; message: string };

/**
 * "Done" (see docs/updates §11/§12/§14) — the ONLY place a One At A Time
 * builder session actually becomes a real, persisted Draft. Deliberately
 * modeled on `createLocalDraftFromSelection` (DIY Draft's own
 * finalisation): the exact same normal-draft slot check, the exact same
 * `calculateDraftDeadline`, the exact same `DraftRecord`/`DraftItemRecord`
 * shapes — a One At A Time Draft is never a second, incompatible Draft
 * model, just an ordinary Draft whose `difficulty` happens to be
 * `"one-at-a-time"` and whose items happen to carry whichever mix of
 * `source` values the builder actually produced. `totalFilms` is simply
 * `items.length` — never a fixed lookup — per `DraftDifficulty`'s own doc
 * comment on why this mode has no `DIFFICULTIES` film count at all.
 *
 * Re-validates eligibility against the CURRENT candidate pool (not merely
 * trusting each item was valid at the moment it was staged) — the same
 * defensive re-check `createLocalDraftFromSelection` already does, since a
 * staged film could in principle become ineligible in between (watched
 * elsewhere, removed from the watchlist) during a long builder session.
 */
export async function finalizeOneAtATimeDraft(
  repos: OneAtATimeRepos,
  params: {
    profileId: string;
    timezone: string;
    timeMode: DraftTimeMode;
    items: readonly OneAtATimeStagedItem[];
  },
  deps: { idGenerator?: IdGenerator; clock?: Clock } = {},
): Promise<FinalizeOneAtATimeDraftOutcome> {
  const idGenerator = deps.idGenerator ?? defaultIdGenerator;
  const clock = deps.clock ?? new SystemClock();
  const { profileId, timezone, items } = params;

  // One At A Time creates a normal (non-event) Draft — scoped to that same
  // profile-wide slot every other normal-Draft creation path checks (see
  // docs/updates §17: "One At A Time creates a normal Draft, not a second
  // normal Draft").
  if (await repos.drafts.hasActiveDraft(profileId, null)) {
    return {
      ok: false,
      error: "already_active",
      message:
        "You already have an active draft. Finish or expire it before starting another.",
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

  const eligibleCandidates = await fetchLocalChallengeCandidates(
    repos,
    profileId,
    { applyFranchiseOrderingRule: false },
  );
  const eligibleEntryIds = new Set(
    eligibleCandidates.map((candidate) => candidate.watchlistEntryId),
  );
  for (const item of items) {
    if (item.watchlistEntryId && !eligibleEntryIds.has(item.watchlistEntryId)) {
      return {
        ok: false,
        error: "entry_not_eligible",
        message:
          "One of the staged films is no longer eligible — remove it and try again.",
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
    difficulty: "one-at-a-time",
    timeMode: params.timeMode,
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
    sourceEventId: null,
    sourceEventManuallyEnabled: null,
    rewardsGrantedAt: null,
    customName: null,
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
    createdAt: now.toISOString(),
  }));
  await repos.drafts.createItems(draftItems);

  return { ok: true, draftId };
}
