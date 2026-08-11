import {
  filterByExtreme,
  pickUniform,
  sampleWithoutReplacement,
  shuffle,
  type Rng,
} from "@/domain/shared/rng";
import type { ChallengeCandidateFilm, ChallengeDefinition } from "../types";
import {
  countOccurrences,
  filmsContaining,
  groupBy,
  pickWeightedFilm,
  withKnownGenres,
} from "./shared";

/**
 * Genre challenges (see docs/product-spec.md, "GENRES"). All read the
 * `genres` capability; a film with `genres: null` never counts toward any
 * genre tally or pool here — it simply isn't represented, rather than being
 * guessed at.
 */

function genreCounts(
  candidates: readonly ChallengeCandidateFilm[],
): Map<string, number> {
  return countOccurrences(withKnownGenres(candidates), (film) => film.genres);
}

/** Every genre tied for the extreme (most/least common) count, for fair tie-breaking. */
function extremeGenres(
  counts: Map<string, number>,
  direction: "min" | "max",
): string[] {
  const entries = [...counts.entries()].map(([genre, count]) => ({
    genre,
    count,
  }));
  return filterByExtreme(entries, (entry) => entry.count, direction).map(
    (entry) => entry.genre,
  );
}

/** Shared mechanic behind "Watchlist Infestation" and "Dominant Species" — see their definitions below. */
function pickFromMostCommonGenre(context: {
  candidates: ChallengeCandidateFilm[];
  rng: Rng;
}) {
  const counts = genreCounts(context.candidates);
  const mostCommon = extremeGenres(counts, "max");
  const genre = pickUniform(mostCommon, context.rng);
  const pool = filmsContaining(
    withKnownGenres(context.candidates),
    (film) => film.genres,
    genre,
  );
  return {
    status: "success" as const,
    film: pickWeightedFilm(pool, context.rng),
  };
}

const genreRoulette: ChallengeDefinition = {
  id: "genre-roulette",
  name: "Genre Roulette",
  description:
    "A random genre represented in your watchlist, then a random eligible film.",
  category: "genres",
  requiredCapabilities: ["genres"],
  interactive: false,
  isEligible: (context) => withKnownGenres(context.candidates).length > 0,
  attempt: (context) => {
    const withGenres = withKnownGenres(context.candidates);
    if (withGenres.length === 0) {
      return { status: "ineligible", reason: "no_films_with_known_genres" };
    }

    const manualGenre = context.manualSelections?.genre;
    if (manualGenre !== undefined) {
      const pool = filmsContaining(
        withGenres,
        (film) => film.genres,
        manualGenre,
      );
      if (pool.length === 0) {
        return {
          status: "ineligible",
          reason: "no_film_with_manually_selected_genre",
        };
      }
      return { status: "success", film: pickWeightedFilm(pool, context.rng) };
    }

    const counts = genreCounts(context.candidates);
    const genre = pickUniform([...counts.keys()], context.rng);
    const pool = filmsContaining(withGenres, (film) => film.genres, genre);
    return { status: "success", film: pickWeightedFilm(pool, context.rng) };
  },
};

const watchlistInfestation: ChallengeDefinition = {
  id: "watchlist-infestation",
  name: "Watchlist Infestation",
  description:
    "A random film from the genre occurring most often across your active watchlist.",
  category: "genres",
  requiredCapabilities: ["genres"],
  interactive: false,
  isEligible: (context) => withKnownGenres(context.candidates).length > 0,
  attempt: (context) => {
    if (withKnownGenres(context.candidates).length === 0) {
      return { status: "ineligible", reason: "no_films_with_known_genres" };
    }
    return pickFromMostCommonGenre(context);
  },
};

const extinctionEvent: ChallengeDefinition = {
  id: "extinction-event",
  name: "Extinction Event",
  description:
    "A random film from the genre represented by the fewest remaining watchlist films.",
  category: "genres",
  requiredCapabilities: ["genres"],
  interactive: false,
  isEligible: (context) => withKnownGenres(context.candidates).length > 0,
  attempt: (context) => {
    const withGenres = withKnownGenres(context.candidates);
    if (withGenres.length === 0) {
      return { status: "ineligible", reason: "no_films_with_known_genres" };
    }
    // Every key in `counts` occurred at least once by construction — there's no
    // way for a "zero actual films" genre to appear here to ignore.
    const counts = genreCounts(context.candidates);
    const rarest = extremeGenres(counts, "min");
    const genre = pickUniform(rarest, context.rng);
    const pool = filmsContaining(withGenres, (film) => film.genres, genre);
    return { status: "success", film: pickWeightedFilm(pool, context.rng) };
  },
};

const GENRE_DETOX_LOOKBACK = 5;

const genreDetox: ChallengeDefinition = {
  id: "genre-detox",
  name: "Genre Detox",
  description:
    "A genre absent from your last five draft picks, then an eligible film.",
  category: "genres",
  requiredCapabilities: ["genres"],
  interactive: false,
  isEligible: (context) => getGenreDetoxEligibleGenres(context).length > 0,
  attempt: (context) => {
    const eligibleGenres = getGenreDetoxEligibleGenres(context);
    if (eligibleGenres.length === 0) {
      return {
        status: "ineligible",
        reason: "no_genre_absent_from_recent_picks",
      };
    }
    const genre = pickUniform(eligibleGenres, context.rng);
    const pool = filmsContaining(
      withKnownGenres(context.candidates),
      (film) => film.genres,
      genre,
    );
    return { status: "success", film: pickWeightedFilm(pool, context.rng) };
  },
};

function getGenreDetoxEligibleGenres(context: {
  candidates: ChallengeCandidateFilm[];
  previousPicks: ChallengeCandidateFilm[];
}): string[] {
  const recentPicks = context.previousPicks.slice(-GENRE_DETOX_LOOKBACK);
  const recentGenres = new Set(
    withKnownGenres(recentPicks).flatMap((film) => film.genres),
  );
  const allGenres = [...genreCounts(context.candidates).keys()];
  return allGenres.filter((genre) => !recentGenres.has(genre));
}

const MAX_DOUBLE_AGENT_ATTEMPTS = 10;

const doubleAgent: ChallengeDefinition = {
  id: "double-agent",
  name: "Double Agent",
  description: "A film matching two randomly chosen genres at once.",
  category: "genres",
  requiredCapabilities: ["genres"],
  interactive: false,
  isEligible: (context) => genreCounts(context.candidates).size >= 2,
  attempt: (context) => {
    const withGenres = withKnownGenres(context.candidates);
    const genres = [...genreCounts(context.candidates).keys()];
    if (genres.length < 2) {
      return {
        status: "ineligible",
        reason: "fewer_than_two_genres_represented",
      };
    }

    const pairs: [string, string][] = [];
    for (let i = 0; i < genres.length; i++) {
      for (let j = i + 1; j < genres.length; j++) {
        pairs.push([genres[i], genres[j]]);
      }
    }

    // Bounded reroll: shuffle every distinct genre pair and scan for the first
    // one with a matching film — see docs/product-spec.md, "Double Agent"
    // ("reroll the genre pair with a bounded retry strategy").
    const order = shuffle(pairs, context.rng);
    const attemptLimit = Math.min(MAX_DOUBLE_AGENT_ATTEMPTS, order.length);
    for (let i = 0; i < attemptLimit; i++) {
      const [genreA, genreB] = order[i];
      const pool = withGenres.filter(
        (film) => film.genres.includes(genreA) && film.genres.includes(genreB),
      );
      if (pool.length > 0) {
        return {
          status: "success",
          film: pickWeightedFilm(pool, context.rng),
          displayValue: { genres: [genreA, genreB] },
        };
      }
    }
    return {
      status: "ineligible",
      reason: "no_film_matching_any_genre_pair_after_max_attempts",
    };
  },
};

/** Canonical, order-independent key for a genre combination — see "Genre Collision": "Treat combinations canonically so order does not matter." */
function canonicalGenreKey(genres: readonly string[]): string {
  return [...new Set(genres)].sort().join("|");
}

const genreCollision: ChallengeDefinition = {
  id: "genre-collision",
  name: "Genre Collision",
  description: "A film whose genre combination you've never watched before.",
  category: "genres",
  requiredCapabilities: ["genres", "watched_history"],
  interactive: false,
  isEligible: (context) =>
    context.watchedFilms.length > 0 &&
    withKnownGenres(context.candidates).length > 0,
  attempt: (context) => {
    if (context.watchedFilms.length === 0) {
      return { status: "ineligible", reason: "no_watched_history_available" };
    }
    const withGenres = withKnownGenres(context.candidates);
    if (withGenres.length === 0) {
      return { status: "ineligible", reason: "no_films_with_known_genres" };
    }
    const watchedCombinations = new Set(
      context.watchedFilms
        .filter(
          (watched): watched is typeof watched & { genres: string[] } =>
            !!watched.genres?.length,
        )
        .map((watched) => canonicalGenreKey(watched.genres)),
    );
    const pool = withGenres.filter(
      (film) => !watchedCombinations.has(canonicalGenreKey(film.genres)),
    );
    if (pool.length === 0) {
      return {
        status: "ineligible",
        reason: "no_film_with_unwatched_genre_combination",
      };
    }
    return { status: "success", film: pickWeightedFilm(pool, context.rng) };
  },
};

const genreWhiplash: ChallengeDefinition = {
  id: "genre-whiplash",
  name: "Genre Whiplash",
  description: "A film sharing zero genres with the previous draft pick.",
  category: "genres",
  requiredCapabilities: ["genres", "previous_draft_pick"],
  interactive: false,
  isEligible: (context) => getGenreWhiplashPool(context).length > 0,
  attempt: (context) => {
    const previous = context.previousPicks.at(-1);
    if (!previous) {
      return { status: "ineligible", reason: "no_previous_draft_pick" };
    }
    if (previous.genres === null) {
      return { status: "ineligible", reason: "previous_pick_missing_genres" };
    }
    const pool = getGenreWhiplashPool(context);
    if (pool.length === 0) {
      return { status: "ineligible", reason: "no_film_sharing_zero_genres" };
    }
    return { status: "success", film: pickWeightedFilm(pool, context.rng) };
  },
};

function getGenreWhiplashPool(context: {
  candidates: ChallengeCandidateFilm[];
  previousPicks: ChallengeCandidateFilm[];
}): ChallengeCandidateFilm[] {
  const previous = context.previousPicks.at(-1);
  if (!previous || previous.genres === null) {
    return [];
  }
  const previousGenres = new Set(previous.genres);
  return context.candidates.filter(
    (film) =>
      film.genres !== null && film.genres.every((g) => !previousGenres.has(g)),
  );
}

const dominantSpecies: ChallengeDefinition = {
  id: "dominant-species",
  name: "Dominant Species",
  description: "A random film from your watchlist's most common genre.",
  category: "genres",
  requiredCapabilities: ["genres"],
  interactive: false,
  isEligible: (context) => withKnownGenres(context.candidates).length > 0,
  attempt: (context) => {
    if (withKnownGenres(context.candidates).length === 0) {
      return { status: "ineligible", reason: "no_films_with_known_genres" };
    }
    return pickFromMostCommonGenre(context);
  },
};

const MINORITY_REPORT_GENRE_COUNT = 3;

const minorityReport: ChallengeDefinition = {
  id: "minority-report",
  name: "Minority Report",
  description:
    "A random film from one of the three smallest represented genres.",
  category: "genres",
  requiredCapabilities: ["genres"],
  interactive: false,
  isEligible: (context) => withKnownGenres(context.candidates).length > 0,
  attempt: (context) => {
    const withGenres = withKnownGenres(context.candidates);
    if (withGenres.length === 0) {
      return { status: "ineligible", reason: "no_films_with_known_genres" };
    }
    const counts = genreCounts(context.candidates);
    const smallestGenres = pickSmallestGenres(
      counts,
      MINORITY_REPORT_GENRE_COUNT,
      context.rng,
    );
    const genre = pickUniform(smallestGenres, context.rng);
    const pool = filmsContaining(withGenres, (film) => film.genres, genre);
    return { status: "success", film: pickWeightedFilm(pool, context.rng) };
  },
};

/**
 * The `n` smallest-count genres, with fair random tie-breaking at the
 * boundary — e.g. if four genres are tied for 2nd/3rd/4th smallest, one of
 * them is randomly excluded rather than always the same one (array order).
 */
function pickSmallestGenres(
  counts: Map<string, number>,
  n: number,
  rng: Rng,
): string[] {
  const entries = [...counts.entries()];
  const byCount = groupBy(entries, ([, count]) => count);
  const sortedCounts = [...byCount.keys()].sort((a, b) => a - b);

  const result: string[] = [];
  for (const count of sortedCounts) {
    if (result.length >= n) break;
    const genresAtThisCount = (byCount.get(count) ?? []).map(
      ([genre]) => genre,
    );
    const remaining = n - result.length;
    if (genresAtThisCount.length <= remaining) {
      result.push(...genresAtThisCount);
    } else {
      result.push(
        ...sampleWithoutReplacement(genresAtThisCount, remaining, rng),
      );
    }
  }
  return result;
}

export const genreChallenges: ChallengeDefinition[] = [
  genreRoulette,
  watchlistInfestation,
  extinctionEvent,
  genreDetox,
  doubleAgent,
  genreCollision,
  genreWhiplash,
  dominantSpecies,
  minorityReport,
];
