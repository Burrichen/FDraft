import {
  filterByExtreme,
  percentileSubset,
  pickUniform,
} from "@/domain/shared/rng";
import type {
  ChallengeCandidateFilm,
  ChallengeContext,
  ChallengeDefinition,
  ChallengeResult,
} from "../types";
import {
  groupBy,
  pickWeightedFilm,
  toDecade,
  withKnownReleaseYear,
} from "./shared";

/**
 * Watchlist age/time challenges (see docs/product-spec.md, "WATCHLIST AGE /
 * TIME"). Two axes of "age" are used throughout this family and are not
 * interchangeable: a film's `dateAdded` (when it joined the watchlist) vs
 * its `releaseYear` (when it was made) — "The Eldest" cares about the
 * latter, "The Ancient Ones" about the former.
 */

function byDateAddedAscending(
  a: ChallengeCandidateFilm,
  b: ChallengeCandidateFilm,
): number {
  return a.dateAdded.localeCompare(b.dateAdded);
}

function byDateAddedDescending(
  a: ChallengeCandidateFilm,
  b: ChallengeCandidateFilm,
): number {
  return b.dateAdded.localeCompare(a.dateAdded);
}

/** Shared mechanic behind "The Eldest" and "Birth of Cinema" — see their definitions below. */
function pickOldestByReleaseYear(context: ChallengeContext): ChallengeResult {
  const pool = withKnownReleaseYear(context.candidates);
  if (pool.length === 0) {
    return { status: "ineligible", reason: "no_films_with_known_release_year" };
  }
  const oldest = filterByExtreme(pool, (film) => film.releaseYear, "min");
  return { status: "success", film: pickUniform(oldest, context.rng) };
}

const theEldest: ChallengeDefinition = {
  id: "the-eldest",
  name: "The Eldest",
  description: "The oldest released film currently in your active watchlist.",
  category: "watchlist-age",
  requiredCapabilities: [],
  interactive: false,
  isEligible: (context) => withKnownReleaseYear(context.candidates).length > 0,
  attempt: pickOldestByReleaseYear,
};

const theAncientOnes: ChallengeDefinition = {
  id: "the-ancient-ones",
  name: "The Ancient Ones",
  description: "Randomly chosen from the ten oldest watchlist additions.",
  category: "watchlist-age",
  requiredCapabilities: [],
  interactive: false,
  isEligible: (context) => context.candidates.length > 0,
  attempt: (context) => {
    if (context.candidates.length === 0) {
      return { status: "ineligible", reason: "no_active_watchlist_films" };
    }
    const oldest10 = [...context.candidates]
      .sort(byDateAddedAscending)
      .slice(0, 10);
    return { status: "success", film: pickWeightedFilm(oldest10, context.rng) };
  },
};

const archaeologicalDig: ChallengeDefinition = {
  id: "archaeological-dig",
  name: "Archaeological Dig",
  description:
    "Random selection from the oldest 20% of your watchlist by date added.",
  category: "watchlist-age",
  requiredCapabilities: [],
  interactive: false,
  isEligible: (context) => context.candidates.length > 0,
  attempt: (context) => {
    if (context.candidates.length === 0) {
      return { status: "ineligible", reason: "no_active_watchlist_films" };
    }
    const oldestFifth = percentileSubset(
      [...context.candidates].sort(byDateAddedAscending),
      0.2,
    );
    return {
      status: "success",
      film: pickWeightedFilm(oldestFifth, context.rng),
    };
  },
};

const freshMeat: ChallengeDefinition = {
  id: "fresh-meat",
  name: "Fresh Meat",
  description: "Randomly chosen from the ten newest watchlist additions.",
  category: "watchlist-age",
  requiredCapabilities: [],
  interactive: false,
  isEligible: (context) => context.candidates.length > 0,
  attempt: (context) => {
    if (context.candidates.length === 0) {
      return { status: "ineligible", reason: "no_active_watchlist_films" };
    }
    const newest10 = [...context.candidates]
      .sort(byDateAddedDescending)
      .slice(0, 10);
    return { status: "success", film: pickWeightedFilm(newest10, context.rng) };
  },
};

const forgottenMiddleChild: ChallengeDefinition = {
  id: "forgotten-middle-child",
  name: "Forgotten Middle Child",
  description:
    "The film sitting at the middle of your watchlist, sorted by date added.",
  category: "watchlist-age",
  requiredCapabilities: [],
  interactive: false,
  isEligible: (context) => context.candidates.length > 0,
  attempt: (context) => {
    const sorted = [...context.candidates].sort(byDateAddedAscending);
    if (sorted.length === 0) {
      return { status: "ineligible", reason: "no_active_watchlist_films" };
    }
    const n = sorted.length;
    // Two exact middle entries for an even-length list — either may be selected.
    const middle =
      n % 2 === 1 ? [sorted[(n - 1) / 2]] : [sorted[n / 2 - 1], sorted[n / 2]];
    return { status: "success", film: pickWeightedFilm(middle, context.rng) };
  },
};

/** Ordinal position as the spec describes it (1st film, 100th film, ...) — `position` is stored 0-indexed. */
function ordinalPosition(film: ChallengeCandidateFilm): number | null {
  return film.position === null ? null : film.position + 1;
}

const the100Club: ChallengeDefinition = {
  id: "the-100-club",
  name: "The 100 Club",
  description:
    "Randomly chosen among watchlist films sitting at position 100, 200, 300, and so on.",
  category: "watchlist-age",
  requiredCapabilities: [],
  interactive: false,
  isEligible: (context) =>
    getMilestonePositionFilms(context.candidates).length > 0,
  attempt: (context) => {
    const pool = getMilestonePositionFilms(context.candidates);
    if (pool.length === 0) {
      return {
        status: "ineligible",
        reason: "no_active_film_at_milestone_position",
      };
    }
    return { status: "success", film: pickWeightedFilm(pool, context.rng) };
  },
};

function getMilestonePositionFilms(
  candidates: readonly ChallengeCandidateFilm[],
): ChallengeCandidateFilm[] {
  return candidates.filter((film) => {
    const ordinal = ordinalPosition(film);
    return ordinal !== null && ordinal > 0 && ordinal % 100 === 0;
  });
}

const buriedTreasure: ChallengeDefinition = {
  id: "buried-treasure",
  name: "Buried Treasure",
  description:
    "A highly-rated film (4.0+) from the oldest 25% of your watchlist additions.",
  category: "watchlist-age",
  requiredCapabilities: ["average_rating"],
  interactive: false,
  isEligible: (context) => getBuriedTreasurePool(context.candidates).length > 0,
  attempt: (context) => {
    const pool = getBuriedTreasurePool(context.candidates);
    if (pool.length === 0) {
      return {
        status: "ineligible",
        reason: "no_oldest_quartile_films_rated_4_plus",
      };
    }
    return { status: "success", film: pickWeightedFilm(pool, context.rng) };
  },
};

function getBuriedTreasurePool(
  candidates: readonly ChallengeCandidateFilm[],
): ChallengeCandidateFilm[] {
  const oldestQuartile = percentileSubset(
    [...candidates].sort(byDateAddedAscending),
    0.25,
  );
  return oldestQuartile.filter(
    (film) => film.averageRating !== null && film.averageRating >= 4.0,
  );
}

const springCleaning: ChallengeDefinition = {
  id: "spring-cleaning",
  name: "Spring Cleaning",
  description: "Randomly chosen from the 25 oldest active watchlist entries.",
  category: "watchlist-age",
  requiredCapabilities: [],
  interactive: false,
  isEligible: (context) => context.candidates.length > 0,
  attempt: (context) => {
    if (context.candidates.length === 0) {
      return { status: "ineligible", reason: "no_active_watchlist_films" };
    }
    const oldest25 = [...context.candidates]
      .sort(byDateAddedAscending)
      .slice(0, 25);
    return { status: "success", film: pickWeightedFilm(oldest25, context.rng) };
  },
};

const decadeRoulette: ChallengeDefinition = {
  id: "decade-roulette",
  name: "Decade Roulette",
  description:
    "A random decade represented in your watchlist, then a random film from it.",
  category: "watchlist-age",
  requiredCapabilities: [],
  interactive: false,
  isEligible: (context) => withKnownReleaseYear(context.candidates).length > 0,
  attempt: (context) => {
    const withYear = withKnownReleaseYear(context.candidates);
    if (withYear.length === 0) {
      return {
        status: "ineligible",
        reason: "no_films_with_known_release_year",
      };
    }
    const decadeGroups = groupBy(withYear, (film) =>
      toDecade(film.releaseYear),
    );
    const decade = pickUniform([...decadeGroups.keys()], context.rng);
    const filmsInDecade = decadeGroups.get(decade) ?? [];
    return {
      status: "success",
      film: pickWeightedFilm(filmsInDecade, context.rng),
    };
  },
};

const birthOfCinema: ChallengeDefinition = {
  id: "birth-of-cinema",
  name: "Birth of Cinema",
  description: "The oldest release year represented on your active watchlist.",
  category: "watchlist-age",
  requiredCapabilities: [],
  interactive: false,
  isEligible: (context) => withKnownReleaseYear(context.candidates).length > 0,
  attempt: pickOldestByReleaseYear,
};

const temporalOpposite: ChallengeDefinition = {
  id: "temporal-opposite",
  name: "Temporal Opposite",
  description:
    "The chronological opposite of the previous pick: an old decade after a modern film, or 2000+ after an old one.",
  category: "watchlist-age",
  requiredCapabilities: ["previous_draft_pick"],
  interactive: false,
  isEligible: (context) => {
    const previous = context.previousPicks.at(-1);
    return (
      previous !== undefined &&
      previous.releaseYear !== null &&
      withKnownReleaseYear(context.candidates).length > 0
    );
  },
  attempt: (context) => {
    const previous = context.previousPicks.at(-1);
    if (!previous) {
      return { status: "ineligible", reason: "no_previous_draft_pick" };
    }
    if (previous.releaseYear === null) {
      return {
        status: "ineligible",
        reason: "previous_pick_missing_release_year",
      };
    }
    const withYear = withKnownReleaseYear(context.candidates);
    if (withYear.length === 0) {
      return {
        status: "ineligible",
        reason: "no_films_with_known_release_year",
      };
    }

    if (previous.releaseYear >= 2000) {
      const decadeGroups = groupBy(withYear, (film) =>
        toDecade(film.releaseYear),
      );
      const oldestDecade = Math.min(...decadeGroups.keys());
      const pool = decadeGroups.get(oldestDecade) ?? [];
      return { status: "success", film: pickWeightedFilm(pool, context.rng) };
    }

    const pool = withYear.filter((film) => film.releaseYear >= 2000);
    if (pool.length === 0) {
      return { status: "ineligible", reason: "no_films_from_2000_onward" };
    }
    return { status: "success", film: pickWeightedFilm(pool, context.rng) };
  },
};

const turnOfTheMillennium: ChallengeDefinition = {
  id: "turn-of-the-millennium",
  name: "Turn of the Millennium",
  description: "A random film released in 1999, 2000, or 2001.",
  category: "watchlist-age",
  requiredCapabilities: [],
  interactive: false,
  isEligible: (context) => getMillenniumPool(context.candidates).length > 0,
  attempt: (context) => {
    const pool = getMillenniumPool(context.candidates);
    if (pool.length === 0) {
      return { status: "ineligible", reason: "no_films_from_1999_to_2001" };
    }
    return { status: "success", film: pickWeightedFilm(pool, context.rng) };
  },
};

function getMillenniumPool(
  candidates: readonly ChallengeCandidateFilm[],
): ChallengeCandidateFilm[] {
  return withKnownReleaseYear(candidates).filter(
    (film) =>
      film.releaseYear === 1999 ||
      film.releaseYear === 2000 ||
      film.releaseYear === 2001,
  );
}

const decadeSurvivor: ChallengeDefinition = {
  id: "decade-survivor",
  name: "Decade Survivor",
  description:
    "A film from the decade with the fewest remaining active watchlist films.",
  category: "watchlist-age",
  requiredCapabilities: [],
  interactive: false,
  isEligible: (context) => withKnownReleaseYear(context.candidates).length > 0,
  attempt: (context) => {
    const withYear = withKnownReleaseYear(context.candidates);
    if (withYear.length === 0) {
      return {
        status: "ineligible",
        reason: "no_films_with_known_release_year",
      };
    }
    const decadeGroups = groupBy(withYear, (film) =>
      toDecade(film.releaseYear),
    );
    const entries = [...decadeGroups.entries()];
    const minCount = Math.min(...entries.map(([, films]) => films.length));
    const tiedDecades = entries
      .filter(([, films]) => films.length === minCount)
      .map(([decade]) => decade);
    // "Ties can be resolved randomly" (product-spec.md) — uniform, not weighted, since the
    // tie is between decades, not films.
    const chosenDecade = pickUniform(tiedDecades, context.rng);
    const pool = decadeGroups.get(chosenDecade) ?? [];
    return { status: "success", film: pickWeightedFilm(pool, context.rng) };
  },
};

const generationalLeap: ChallengeDefinition = {
  id: "generational-leap",
  name: "Generational Leap",
  description:
    "At least 30 release years apart from the previous pick, in either direction.",
  category: "watchlist-age",
  requiredCapabilities: ["previous_draft_pick"],
  interactive: false,
  isEligible: (context) => {
    const previous = context.previousPicks.at(-1);
    return (
      previous !== undefined &&
      previous.releaseYear !== null &&
      withKnownReleaseYear(context.candidates).length > 0
    );
  },
  attempt: (context) => {
    const previous = context.previousPicks.at(-1);
    if (!previous) {
      return { status: "ineligible", reason: "no_previous_draft_pick" };
    }
    if (previous.releaseYear === null) {
      return {
        status: "ineligible",
        reason: "previous_pick_missing_release_year",
      };
    }
    const previousYear = previous.releaseYear;
    const pool = withKnownReleaseYear(context.candidates).filter(
      (film) => Math.abs(film.releaseYear - previousYear) >= 30,
    );
    if (pool.length === 0) {
      return {
        status: "ineligible",
        reason: "no_film_at_least_30_years_apart",
      };
    }
    return { status: "success", film: pickWeightedFilm(pool, context.rng) };
  },
};

/** September = 9, October = 0, November = 1, December = 2 (product-spec.md, "Calendar Match"). */
function calendarMatchDigit(now: Date): number {
  return (now.getMonth() + 1) % 10;
}

const calendarMatch: ChallengeDefinition = {
  id: "calendar-match",
  name: "Calendar Match",
  description:
    "A film whose release year's last digit matches this calendar month, modulo 10.",
  category: "watchlist-age",
  requiredCapabilities: [],
  interactive: false,
  isEligible: (context) =>
    getCalendarMatchPool(context.candidates, context.now).length > 0,
  attempt: (context) => {
    const pool = getCalendarMatchPool(context.candidates, context.now);
    if (pool.length === 0) {
      return {
        status: "ineligible",
        reason: "no_film_matching_calendar_digit",
      };
    }
    return { status: "success", film: pickWeightedFilm(pool, context.rng) };
  },
};

function getCalendarMatchPool(
  candidates: readonly ChallengeCandidateFilm[],
  now: Date,
): ChallengeCandidateFilm[] {
  const target = calendarMatchDigit(now);
  return withKnownReleaseYear(candidates).filter(
    (film) => film.releaseYear % 10 === target,
  );
}

export const watchlistAgeChallenges: ChallengeDefinition[] = [
  theEldest,
  theAncientOnes,
  archaeologicalDig,
  freshMeat,
  forgottenMiddleChild,
  the100Club,
  buriedTreasure,
  springCleaning,
  decadeRoulette,
  birthOfCinema,
  temporalOpposite,
  turnOfTheMillennium,
  decadeSurvivor,
  generationalLeap,
  calendarMatch,
];
