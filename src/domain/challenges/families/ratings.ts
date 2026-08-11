import {
  filterByExtreme,
  percentileSubset,
  pickUniform,
} from "@/domain/shared/rng";
import type { ChallengeDefinition } from "../types";
import { groupBy, pickWeightedFilm, withKnownRating } from "./shared";

/**
 * Rating challenges (see docs/product-spec.md, "RATINGS"): "Use
 * external/community average rating, NOT the user's own rating" — this
 * family only ever reads `averageRating` (sourced from film_metadata), never
 * a user_ratings row.
 */

const crownJewel: ChallengeDefinition = {
  id: "crown-jewel",
  name: "Crown Jewel",
  description: "The highest-rated active watchlist film.",
  category: "ratings",
  requiredCapabilities: ["average_rating"],
  interactive: false,
  isEligible: (context) => withKnownRating(context.candidates).length > 0,
  attempt: (context) => {
    const pool = withKnownRating(context.candidates);
    if (pool.length === 0) {
      return { status: "ineligible", reason: "no_films_with_known_rating" };
    }
    const highest = filterByExtreme(pool, (film) => film.averageRating, "max");
    return { status: "success", film: pickUniform(highest, context.rng) };
  },
};

const trashGoblin: ChallengeDefinition = {
  id: "trash-goblin",
  name: "Trash Goblin",
  description: "The lowest-rated active watchlist film.",
  category: "ratings",
  requiredCapabilities: ["average_rating"],
  interactive: false,
  isEligible: (context) => withKnownRating(context.candidates).length > 0,
  attempt: (context) => {
    const pool = withKnownRating(context.candidates);
    if (pool.length === 0) {
      return { status: "ineligible", reason: "no_films_with_known_rating" };
    }
    const lowest = filterByExtreme(pool, (film) => film.averageRating, "min");
    return { status: "success", film: pickUniform(lowest, context.rng) };
  },
};

const dangerZone: ChallengeDefinition = {
  id: "danger-zone",
  name: "Danger Zone",
  description: "A random film rated below 3.0.",
  category: "ratings",
  requiredCapabilities: ["average_rating"],
  interactive: false,
  isEligible: (context) =>
    withKnownRating(context.candidates).some(
      (film) => film.averageRating < 3.0,
    ),
  attempt: (context) => {
    const pool = withKnownRating(context.candidates).filter(
      (film) => film.averageRating < 3.0,
    );
    if (pool.length === 0) {
      return { status: "ineligible", reason: "no_films_rating_lt_3" };
    }
    return { status: "success", film: pickWeightedFilm(pool, context.rng) };
  },
};

const respectableCitizen: ChallengeDefinition = {
  id: "respectable-citizen",
  name: "Respectable Citizen",
  description: "A random film rated between 3.0 and 3.5.",
  category: "ratings",
  requiredCapabilities: ["average_rating"],
  interactive: false,
  isEligible: (context) =>
    withKnownRating(context.candidates).some(
      (film) => film.averageRating >= 3.0 && film.averageRating <= 3.5,
    ),
  attempt: (context) => {
    const pool = withKnownRating(context.candidates).filter(
      (film) => film.averageRating >= 3.0 && film.averageRating <= 3.5,
    );
    if (pool.length === 0) {
      return { status: "ineligible", reason: "no_films_rating_3_to_3_5" };
    }
    return { status: "success", film: pickWeightedFilm(pool, context.rng) };
  },
};

const prestigePick: ChallengeDefinition = {
  id: "prestige-pick",
  name: "Prestige Pick",
  description: "A random film rated 4.0 or higher.",
  category: "ratings",
  requiredCapabilities: ["average_rating"],
  interactive: false,
  isEligible: (context) =>
    withKnownRating(context.candidates).some(
      (film) => film.averageRating >= 4.0,
    ),
  attempt: (context) => {
    const pool = withKnownRating(context.candidates).filter(
      (film) => film.averageRating >= 4.0,
    );
    if (pool.length === 0) {
      return { status: "ineligible", reason: "no_films_rating_gte_4" };
    }
    return { status: "success", film: pickWeightedFilm(pool, context.rng) };
  },
};

const PERFECTLY_AVERAGE_TARGET = 2.5;

const perfectlyAverage: ChallengeDefinition = {
  id: "perfectly-average",
  name: "Perfectly Average",
  description: "The film whose rating is closest to 2.5.",
  category: "ratings",
  requiredCapabilities: ["average_rating"],
  interactive: false,
  isEligible: (context) => withKnownRating(context.candidates).length > 0,
  attempt: (context) => {
    const pool = withKnownRating(context.candidates);
    if (pool.length === 0) {
      return { status: "ineligible", reason: "no_films_with_known_rating" };
    }
    const closest = filterByExtreme(
      pool,
      (film) => Math.abs(film.averageRating - PERFECTLY_AVERAGE_TARGET),
      "min",
    );
    return { status: "success", film: pickUniform(closest, context.rng) };
  },
};

/** Half-star bucket index 0-9, covering [0, 5.0] with clear, non-overlapping boundaries. */
function halfStarBucket(rating: number): number {
  return Math.min(Math.floor(rating * 2), 9);
}

const ratingRoulette: ChallengeDefinition = {
  id: "rating-roulette",
  name: "Rating Roulette",
  description:
    "A random half-star rating band represented in your watchlist, then a random film from it.",
  category: "ratings",
  requiredCapabilities: ["average_rating"],
  interactive: false,
  isEligible: (context) => withKnownRating(context.candidates).length > 0,
  attempt: (context) => {
    const pool = withKnownRating(context.candidates);
    if (pool.length === 0) {
      return { status: "ineligible", reason: "no_films_with_known_rating" };
    }
    const bands = groupBy(pool, (film) => halfStarBucket(film.averageRating));
    const band = pickUniform([...bands.keys()], context.rng);
    const filmsInBand = bands.get(band) ?? [];
    return {
      status: "success",
      film: pickWeightedFilm(filmsInBand, context.rng),
    };
  },
};

const TOP_PERCENTILE_FRACTION = 0.1;
const BOTTOM_PERCENTILE_FRACTION = 0.1;

const trustThePeople: ChallengeDefinition = {
  id: "trust-the-people",
  name: "Trust the People",
  description:
    "A random film from the top 10% of your watchlist by average rating.",
  category: "ratings",
  requiredCapabilities: ["average_rating"],
  interactive: false,
  isEligible: (context) => withKnownRating(context.candidates).length > 0,
  attempt: (context) => {
    const pool = withKnownRating(context.candidates);
    if (pool.length === 0) {
      return { status: "ineligible", reason: "no_films_with_known_rating" };
    }
    const sortedDescending = [...pool].sort(
      (a, b) => b.averageRating - a.averageRating,
    );
    const topTenPercent = percentileSubset(
      sortedDescending,
      TOP_PERCENTILE_FRACTION,
    );
    return {
      status: "success",
      film: pickWeightedFilm(topTenPercent, context.rng),
    };
  },
};

const defyThePeople: ChallengeDefinition = {
  id: "defy-the-people",
  name: "Defy the People",
  description:
    "A random film from the bottom 10% of your watchlist by average rating.",
  category: "ratings",
  requiredCapabilities: ["average_rating"],
  interactive: false,
  isEligible: (context) => withKnownRating(context.candidates).length > 0,
  attempt: (context) => {
    const pool = withKnownRating(context.candidates);
    if (pool.length === 0) {
      return { status: "ineligible", reason: "no_films_with_known_rating" };
    }
    const sortedAscending = [...pool].sort(
      (a, b) => a.averageRating - b.averageRating,
    );
    const bottomTenPercent = percentileSubset(
      sortedAscending,
      BOTTOM_PERCENTILE_FRACTION,
    );
    return {
      status: "success",
      film: pickWeightedFilm(bottomTenPercent, context.rng),
    };
  },
};

export const ratingsChallenges: ChallengeDefinition[] = [
  crownJewel,
  trashGoblin,
  dangerZone,
  respectableCitizen,
  prestigePick,
  perfectlyAverage,
  ratingRoulette,
  trustThePeople,
  defyThePeople,
];
