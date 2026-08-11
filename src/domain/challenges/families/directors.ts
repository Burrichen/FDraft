import { filterByExtreme, pickUniform } from "@/domain/shared/rng";
import type {
  ChallengeCandidateFilm,
  ChallengeDefinition,
  ChallengeWatchedFilmRecord,
} from "../types";
import {
  countOccurrences,
  filmsContaining,
  pickWeightedFilm,
  withKnownDirectors,
} from "./shared";

/**
 * Director challenges (see docs/product-spec.md, "DIRECTORS"). Several of
 * these need the user's watch history and/or their own ratings, not just
 * watchlist metadata — `context.watchedFilms` (see types.ts) is what
 * supplies that; an empty array there means "no watch history available",
 * never "the user has watched nothing forever" being invented as a
 * shortcut.
 */

function directorCounts(
  candidates: readonly ChallengeCandidateFilm[],
): Map<string, number> {
  return countOccurrences(
    withKnownDirectors(candidates),
    (film) => film.directors,
  );
}

const directorRoulette: ChallengeDefinition = {
  id: "director-roulette",
  name: "Director Roulette",
  description:
    "A random director with more than one active watchlist film, then a random film of theirs.",
  category: "directors",
  requiredCapabilities: ["directors"],
  interactive: false,
  isEligible: (context) => getMultiFilmDirectors(context.candidates).length > 0,
  attempt: (context) => {
    const directors = getMultiFilmDirectors(context.candidates);
    if (directors.length === 0) {
      return {
        status: "ineligible",
        reason: "no_director_with_multiple_active_films",
      };
    }
    const director = pickUniform(directors, context.rng);
    const pool = filmsContaining(
      withKnownDirectors(context.candidates),
      (film) => film.directors,
      director,
    );
    return { status: "success", film: pickWeightedFilm(pool, context.rng) };
  },
};

function getMultiFilmDirectors(
  candidates: readonly ChallengeCandidateFilm[],
): string[] {
  return [...directorCounts(candidates).entries()]
    .filter(([, count]) => count > 1)
    .map(([director]) => director);
}

function watchedCountsByDirector(
  watchedFilms: readonly ChallengeWatchedFilmRecord[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const watched of watchedFilms) {
    for (const director of watched.directors ?? []) {
      counts.set(director, (counts.get(director) ?? 0) + 1);
    }
  }
  return counts;
}

function getFinishTheJobDirectors(context: {
  candidates: ChallengeCandidateFilm[];
  watchedFilms: ChallengeWatchedFilmRecord[];
}): string[] {
  const watchedCounts = watchedCountsByDirector(context.watchedFilms);
  const remainingDirectors = new Set(directorCounts(context.candidates).keys());
  return [...watchedCounts.entries()]
    .filter(
      ([director, count]) => count >= 2 && remainingDirectors.has(director),
    )
    .map(([director]) => director);
}

const finishTheJob: ChallengeDefinition = {
  id: "finish-the-job",
  name: "Finish the Job",
  description:
    "A director you've watched multiple films from, with one still waiting on your watchlist.",
  category: "directors",
  requiredCapabilities: ["directors", "watched_history"],
  interactive: false,
  isEligible: (context) => getFinishTheJobDirectors(context).length > 0,
  attempt: (context) => {
    const directors = getFinishTheJobDirectors(context);
    if (directors.length === 0) {
      return {
        status: "ineligible",
        reason: "no_director_with_multiple_watched_and_remaining_unwatched",
      };
    }
    const director = pickUniform(directors, context.rng);
    const pool = filmsContaining(
      withKnownDirectors(context.candidates),
      (film) => film.directors,
      director,
    );
    return { status: "success", film: pickWeightedFilm(pool, context.rng) };
  },
};

const newBlood: ChallengeDefinition = {
  id: "new-blood",
  name: "New Blood",
  description: "A film from a director you've never watched before.",
  category: "directors",
  requiredCapabilities: ["directors", "watched_history"],
  interactive: false,
  isEligible: (context) => getNewBloodPool(context).length > 0,
  attempt: (context) => {
    const pool = getNewBloodPool(context);
    if (pool.length === 0) {
      return {
        status: "ineligible",
        reason: "no_film_from_a_never_watched_director",
      };
    }
    return { status: "success", film: pickWeightedFilm(pool, context.rng) };
  },
};

function getNewBloodPool(context: {
  candidates: ChallengeCandidateFilm[];
  watchedFilms: ChallengeWatchedFilmRecord[];
}) {
  const watchedDirectors = new Set(
    context.watchedFilms.flatMap((watched) => watched.directors ?? []),
  );
  return withKnownDirectors(context.candidates).filter((film) =>
    film.directors.every((d) => !watchedDirectors.has(d)),
  );
}

const oldFriend: ChallengeDefinition = {
  id: "old-friend",
  name: "Old Friend",
  description:
    "A film from a director whose previous work you've rated highly (4+ stars by default).",
  category: "directors",
  requiredCapabilities: ["directors", "user_ratings"],
  interactive: false,
  isEligible: (context) => getOldFriendPool(context).length > 0,
  attempt: (context) => {
    const pool = getOldFriendPool(context);
    if (pool.length === 0) {
      return {
        status: "ineligible",
        reason: "no_film_from_a_highly_rated_director",
      };
    }
    return { status: "success", film: pickWeightedFilm(pool, context.rng) };
  },
};

function getOldFriendPool(context: {
  candidates: ChallengeCandidateFilm[];
  watchedFilms: ChallengeWatchedFilmRecord[];
  config: { oldFriendMinUserRating: number };
}) {
  const highlyRatedDirectors = new Set(
    context.watchedFilms
      .filter(
        (watched) =>
          watched.userRating !== null &&
          watched.userRating >= context.config.oldFriendMinUserRating,
      )
      .flatMap((watched) => watched.directors ?? []),
  );
  return withKnownDirectors(context.candidates).filter((film) =>
    film.directors.some((d) => highlyRatedDirectors.has(d)),
  );
}

/** A director's most recently watched film — see "Second Chance": undated watches can't establish "watched nothing since". */
function mostRecentlyWatchedByDirector(
  watchedFilms: readonly ChallengeWatchedFilmRecord[],
): Map<string, ChallengeWatchedFilmRecord> {
  const mostRecent = new Map<string, ChallengeWatchedFilmRecord>();
  for (const watched of watchedFilms) {
    if (watched.watchedAt === null) continue;
    for (const director of watched.directors ?? []) {
      const current = mostRecent.get(director);
      if (
        !current ||
        (current.watchedAt !== null && watched.watchedAt > current.watchedAt)
      ) {
        mostRecent.set(director, watched);
      }
    }
  }
  return mostRecent;
}

function getSecondChanceDirectors(context: {
  candidates: ChallengeCandidateFilm[];
  watchedFilms: ChallengeWatchedFilmRecord[];
  config: { secondChanceMaxPoorRating: number };
}): string[] {
  const mostRecentByDirector = mostRecentlyWatchedByDirector(
    context.watchedFilms,
  );
  const remainingDirectors = new Set(directorCounts(context.candidates).keys());
  const qualifying: string[] = [];
  for (const [director, mostRecentFilm] of mostRecentByDirector.entries()) {
    if (!remainingDirectors.has(director)) continue;
    if (
      mostRecentFilm.userRating !== null &&
      mostRecentFilm.userRating <= context.config.secondChanceMaxPoorRating
    ) {
      qualifying.push(director);
    }
  }
  return qualifying;
}

const secondChance: ChallengeDefinition = {
  id: "second-chance",
  name: "Second Chance",
  description:
    "A director whose most recent film you rated poorly (2 stars or below by default), and haven't watched since.",
  category: "directors",
  requiredCapabilities: ["directors", "user_ratings", "watched_history"],
  interactive: false,
  isEligible: (context) => getSecondChanceDirectors(context).length > 0,
  attempt: (context) => {
    const directors = getSecondChanceDirectors(context);
    if (directors.length === 0) {
      return {
        status: "ineligible",
        reason: "no_qualifying_second_chance_director",
      };
    }
    const director = pickUniform(directors, context.rng);
    const pool = filmsContaining(
      withKnownDirectors(context.candidates),
      (film) => film.directors,
      director,
    );
    return { status: "success", film: pickWeightedFilm(pool, context.rng) };
  },
};

const AUTEUR_MONTH_MIN_FILM_COUNT = 3;

const auteurMonth: ChallengeDefinition = {
  id: "auteur-month",
  name: "Auteur Month",
  description:
    "A film from a director represented at least three times on your active watchlist.",
  category: "directors",
  requiredCapabilities: ["directors"],
  interactive: false,
  isEligible: (context) => getAuteurMonthPool(context.candidates).length > 0,
  attempt: (context) => {
    const pool = getAuteurMonthPool(context.candidates);
    if (pool.length === 0) {
      return {
        status: "ineligible",
        reason: "no_director_with_three_or_more_active_films",
      };
    }
    return { status: "success", film: pickWeightedFilm(pool, context.rng) };
  },
};

function getAuteurMonthPool(candidates: readonly ChallengeCandidateFilm[]) {
  const counts = directorCounts(candidates);
  const prolificDirectors = new Set(
    [...counts.entries()]
      .filter(([, count]) => count >= AUTEUR_MONTH_MIN_FILM_COUNT)
      .map(([director]) => director),
  );
  return withKnownDirectors(candidates).filter((film) =>
    film.directors.some((d) => prolificDirectors.has(d)),
  );
}

const oneAndDone: ChallengeDefinition = {
  id: "one-and-done",
  name: "One and Done",
  description:
    "A film whose director is represented exactly once on your active watchlist.",
  category: "directors",
  requiredCapabilities: ["directors"],
  interactive: false,
  isEligible: (context) => getOneAndDonePool(context.candidates).length > 0,
  attempt: (context) => {
    const pool = getOneAndDonePool(context.candidates);
    if (pool.length === 0) {
      return {
        status: "ineligible",
        reason: "no_director_represented_exactly_once",
      };
    }
    return { status: "success", film: pickWeightedFilm(pool, context.rng) };
  },
};

function getOneAndDonePool(candidates: readonly ChallengeCandidateFilm[]) {
  const counts = directorCounts(candidates);
  const soleDirectors = new Set(
    [...counts.entries()]
      .filter(([, count]) => count === 1)
      .map(([director]) => director),
  );
  return withKnownDirectors(candidates).filter((film) =>
    film.directors.some((d) => soleDirectors.has(d)),
  );
}

const directorMonopoly: ChallengeDefinition = {
  id: "director-monopoly",
  name: "Director Monopoly",
  description: "A film from the director with the most active watchlist films.",
  category: "directors",
  requiredCapabilities: ["directors"],
  interactive: false,
  isEligible: (context) => withKnownDirectors(context.candidates).length > 0,
  attempt: (context) => {
    const counts = directorCounts(context.candidates);
    if (counts.size === 0) {
      return { status: "ineligible", reason: "no_films_with_known_directors" };
    }
    const entries = [...counts.entries()].map(([director, count]) => ({
      director,
      count,
    }));
    const topDirectors = filterByExtreme(
      entries,
      (entry) => entry.count,
      "max",
    ).map((entry) => entry.director);
    const director = pickUniform(topDirectors, context.rng);
    const pool = filmsContaining(
      withKnownDirectors(context.candidates),
      (film) => film.directors,
      director,
    );
    return { status: "success", film: pickWeightedFilm(pool, context.rng) };
  },
};

const passingTheTorch: ChallengeDefinition = {
  id: "passing-the-torch",
  name: "Passing the Torch",
  description: "A different director sharing a genre with the previous pick.",
  category: "directors",
  requiredCapabilities: ["directors", "genres", "previous_draft_pick"],
  interactive: false,
  isEligible: (context) => getPassingTheTorchPool(context).length > 0,
  attempt: (context) => {
    const previous = context.previousPicks.at(-1);
    if (!previous) {
      return { status: "ineligible", reason: "no_previous_draft_pick" };
    }
    if (previous.directors === null || previous.directors.length === 0) {
      return {
        status: "ineligible",
        reason: "previous_pick_missing_directors",
      };
    }
    if (previous.genres === null || previous.genres.length === 0) {
      return { status: "ineligible", reason: "previous_pick_missing_genres" };
    }
    const pool = getPassingTheTorchPool(context);
    if (pool.length === 0) {
      return {
        status: "ineligible",
        reason: "no_different_director_sharing_a_genre",
      };
    }
    return { status: "success", film: pickWeightedFilm(pool, context.rng) };
  },
};

function getPassingTheTorchPool(context: {
  candidates: ChallengeCandidateFilm[];
  previousPicks: ChallengeCandidateFilm[];
}): ChallengeCandidateFilm[] {
  const previous = context.previousPicks.at(-1);
  if (!previous || !previous.directors?.length || !previous.genres?.length) {
    return [];
  }
  const previousDirectors = new Set(previous.directors);
  const previousGenres = new Set(previous.genres);
  return context.candidates.filter(
    (film) =>
      film.directors !== null &&
      film.directors.length > 0 &&
      film.directors.every((d) => !previousDirectors.has(d)) &&
      film.genres !== null &&
      film.genres.some((g) => previousGenres.has(g)),
  );
}

export const directorChallenges: ChallengeDefinition[] = [
  directorRoulette,
  finishTheJob,
  newBlood,
  oldFriend,
  secondChance,
  auteurMonth,
  oneAndDone,
  directorMonopoly,
  passingTheTorch,
];
