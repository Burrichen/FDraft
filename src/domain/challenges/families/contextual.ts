import { filterByExtreme, pickUniform } from "@/domain/shared/rng";
import { computeDistanceRanges, filmDistance } from "../distance";
import type {
  ChallengeCandidateFilm,
  ChallengeDefinition,
  ChallengeWatchedFilmRecord,
} from "../types";
import { pickWeightedFilm, toDecade, withKnownReleaseYear } from "./shared";

/**
 * Contextual/taste challenges (see docs/product-spec.md, "CONTEXTUAL /
 * TASTE"). These are the challenges most dependent on real usage history —
 * `previousPicks` for Palette Cleanser, `watchedFilms` for the other two —
 * so they lean hardest on "if reliable history doesn't exist, mark
 * ineligible" rather than degrading to a plausible-looking guess.
 */

const PALETTE_CLEANSER_LOOKBACK = 3;

const paletteCleanser: ChallengeDefinition = {
  id: "palette-cleanser",
  name: "Palette Cleanser",
  description:
    "The film maximally different from your last three picks, by release year, runtime, and genre.",
  category: "contextual",
  requiredCapabilities: ["previous_draft_pick"],
  interactive: false,
  isEligible: (context) =>
    context.previousPicks.length > 0 && context.candidates.length > 0,
  attempt: (context) => {
    const recentPicks = context.previousPicks.slice(-PALETTE_CLEANSER_LOOKBACK);
    if (recentPicks.length === 0) {
      return { status: "ineligible", reason: "no_previous_picks_yet" };
    }
    if (context.candidates.length === 0) {
      return { status: "ineligible", reason: "no_active_watchlist_films" };
    }

    const ranges = computeDistanceRanges([
      ...recentPicks,
      ...context.candidates,
    ]);
    const scored = context.candidates.map((film) => ({
      film,
      // Mean distance to each recent pick — stays on the same [0,1]-ish
      // scale regardless of how many of the (up to 3) recent picks exist.
      score:
        recentPicks.reduce(
          (sum, recent) => sum + filmDistance(film, recent, ranges),
          0,
        ) / recentPicks.length,
    }));
    const mostDifferent = filterByExtreme(
      scored,
      (entry) => entry.score,
      "max",
    );
    return {
      status: "success",
      film: pickUniform(mostDifferent, context.rng).film,
    };
  },
};

const decadeDetox: ChallengeDefinition = {
  id: "decade-detox",
  name: "Decade Detox",
  description: "A film from a decade absent from your last ten watched films.",
  category: "contextual",
  requiredCapabilities: ["watched_history"],
  interactive: false,
  isEligible: (context) => getDecadeDetoxEligibleDecades(context).length > 0,
  attempt: (context) => {
    const recentWatched = getRecentWatchedWithKnownDate(
      context.watchedFilms,
      context.config.recentWatchHistoryWindow,
    );
    if (recentWatched.length === 0) {
      return {
        status: "ineligible",
        reason: "no_reliable_recent_watch_history",
      };
    }
    const eligibleDecades = getDecadeDetoxEligibleDecades(context);
    if (eligibleDecades.length === 0) {
      return {
        status: "ineligible",
        reason: "no_decade_absent_from_recent_watches",
      };
    }
    const decade = pickUniform(eligibleDecades, context.rng);
    const pool = withKnownReleaseYear(context.candidates).filter(
      (film) => toDecade(film.releaseYear) === decade,
    );
    return { status: "success", film: pickWeightedFilm(pool, context.rng) };
  },
};

function getRecentWatchedWithKnownDate(
  watchedFilms: readonly ChallengeWatchedFilmRecord[],
  window: number,
): ChallengeWatchedFilmRecord[] {
  return watchedFilms
    .filter(
      (
        watched,
      ): watched is ChallengeWatchedFilmRecord & { watchedAt: string } =>
        watched.watchedAt !== null,
    )
    .sort((a, b) => b.watchedAt.localeCompare(a.watchedAt))
    .slice(0, window);
}

function getDecadeDetoxEligibleDecades(context: {
  candidates: ChallengeCandidateFilm[];
  watchedFilms: ChallengeWatchedFilmRecord[];
  config: { recentWatchHistoryWindow: number };
}): number[] {
  const recentWatched = getRecentWatchedWithKnownDate(
    context.watchedFilms,
    context.config.recentWatchHistoryWindow,
  );
  if (recentWatched.length === 0) {
    return [];
  }
  const recentDecades = new Set(
    recentWatched
      .filter((watched) => watched.releaseYear !== null)
      .map((watched) => toDecade(watched.releaseYear as number)),
  );
  const candidateDecades = new Set(
    withKnownReleaseYear(context.candidates).map((film) =>
      toDecade(film.releaseYear),
    ),
  );
  return [...candidateDecades].filter((decade) => !recentDecades.has(decade));
}

const fiveStarEcho: ChallengeDefinition = {
  id: "five-star-echo",
  name: "Five-Star Echo",
  description:
    "A film sharing a director or genre with one of your 5-star watches.",
  category: "contextual",
  requiredCapabilities: ["watched_history", "user_ratings"],
  interactive: false,
  isEligible: (context) => getFiveStarEchoPool(context).length > 0,
  attempt: (context) => {
    const fiveStarWatches = getFiveStarWatches(
      context.watchedFilms,
      context.config.fiveStarEchoMinUserRating,
    );
    if (fiveStarWatches.length === 0) {
      return { status: "ineligible", reason: "no_five_star_watches_recorded" };
    }
    const pool = getFiveStarEchoPool(context);
    if (pool.length === 0) {
      return {
        status: "ineligible",
        reason: "no_film_echoing_a_five_star_watch",
      };
    }
    return { status: "success", film: pickWeightedFilm(pool, context.rng) };
  },
};

function getFiveStarWatches(
  watchedFilms: readonly ChallengeWatchedFilmRecord[],
  minRating: number,
): ChallengeWatchedFilmRecord[] {
  return watchedFilms.filter(
    (watched) => watched.userRating !== null && watched.userRating >= minRating,
  );
}

function getFiveStarEchoPool(context: {
  candidates: ChallengeCandidateFilm[];
  watchedFilms: ChallengeWatchedFilmRecord[];
  config: { fiveStarEchoMinUserRating: number };
}): ChallengeCandidateFilm[] {
  const fiveStarWatches = getFiveStarWatches(
    context.watchedFilms,
    context.config.fiveStarEchoMinUserRating,
  );
  const echoDirectors = new Set(
    fiveStarWatches.flatMap((watched) => watched.directors ?? []),
  );
  const echoGenres = new Set(
    fiveStarWatches.flatMap((watched) => watched.genres ?? []),
  );
  return context.candidates.filter(
    (film) =>
      (film.directors ?? []).some((director) => echoDirectors.has(director)) ||
      (film.genres ?? []).some((genre) => echoGenres.has(genre)),
  );
}

export const contextualChallenges: ChallengeDefinition[] = [
  paletteCleanser,
  decadeDetox,
  fiveStarEcho,
];
