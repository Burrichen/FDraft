import {
  filterByExtreme,
  pickUniform,
  sampleWithoutReplacement,
} from "@/domain/shared/rng";
import type { ChallengeDefinition } from "../types";
import {
  pickWeightedFilm,
  percentileSubsetAscendingBy,
  withKnownFansCount,
  withKnownListAppearances,
  withKnownPopularity,
  withKnownRating,
  withKnownWatchCount,
} from "./shared";

/**
 * Popularity/community challenges (see docs/product-spec.md, "POPULARITY /
 * COMMUNITY" — "These challenges only become available when the provider
 * supplies the necessary metrics"). Every challenge here reads exactly one
 * provider-specific metric (popularity, watch count, fans count, list
 * appearances) and nothing else stands in for it when it's missing — a
 * `null` metric makes the film simply not count, never a reason to fall
 * back to some other field (see docs/product-spec.md, "Provider-specific
 * metrics ... must only enable challenges if those metrics actually exist").
 */

/** THE canonical "how popular is this film" metric — see "Main Character": "Define the provider's canonical popularity metric in one place." */
const mainCharacter: ChallengeDefinition = {
  id: "main-character",
  name: "Main Character",
  description:
    "The most popular remaining watchlist film, by the provider's popularity metric.",
  category: "popularity",
  requiredCapabilities: ["popularity"],
  interactive: false,
  isEligible: (context) => withKnownPopularity(context.candidates).length > 0,
  attempt: (context) => {
    const pool = withKnownPopularity(context.candidates);
    if (pool.length === 0) {
      return { status: "ineligible", reason: "no_films_with_known_popularity" };
    }
    const mostPopular = filterByExtreme(pool, (film) => film.popularity, "max");
    return { status: "success", film: pickUniform(mostPopular, context.rng) };
  },
};

const HIPSTER_PICK_SAMPLE_SIZE = 20;

const hipsterPick: ChallengeDefinition = {
  id: "hipster-pick",
  name: "Hipster Pick",
  description:
    "The lowest watch count within a random sample of 20 active watchlist films.",
  category: "popularity",
  requiredCapabilities: ["watch_count"],
  interactive: false,
  isEligible: (context) => withKnownWatchCount(context.candidates).length > 0,
  attempt: (context) => {
    const pool = withKnownWatchCount(context.candidates);
    if (pool.length === 0) {
      return {
        status: "ineligible",
        reason: "no_films_with_known_watch_count",
      };
    }
    const sample = sampleWithoutReplacement(
      pool,
      HIPSTER_PICK_SAMPLE_SIZE,
      context.rng,
    );
    const lowest = filterByExtreme(sample, (film) => film.watchCount, "min");
    return { status: "success", film: pickUniform(lowest, context.rng) };
  },
};

const nobodyKnowsThis: ChallengeDefinition = {
  id: "nobody-knows-this",
  name: "Nobody Knows This",
  description: "The active watchlist film with the smallest watch count.",
  category: "popularity",
  requiredCapabilities: ["watch_count"],
  interactive: false,
  isEligible: (context) => withKnownWatchCount(context.candidates).length > 0,
  attempt: (context) => {
    const pool = withKnownWatchCount(context.candidates);
    if (pool.length === 0) {
      return {
        status: "ineligible",
        reason: "no_films_with_known_watch_count",
      };
    }
    const fewest = filterByExtreme(pool, (film) => film.watchCount, "min");
    return { status: "success", film: pickUniform(fewest, context.rng) };
  },
};

const listGoblin: ChallengeDefinition = {
  id: "list-goblin",
  name: "List Goblin",
  description: "The film appearing on the most community lists.",
  category: "popularity",
  requiredCapabilities: ["list_appearances"],
  interactive: false,
  isEligible: (context) =>
    withKnownListAppearances(context.candidates).length > 0,
  attempt: (context) => {
    const pool = withKnownListAppearances(context.candidates);
    if (pool.length === 0) {
      return {
        status: "ineligible",
        reason: "no_films_with_known_list_appearances",
      };
    }
    const most = filterByExtreme(pool, (film) => film.listAppearances, "max");
    return { status: "success", film: pickUniform(most, context.rng) };
  },
};

const CULT_CLASSIC_MIN_RATING = 4.0;
const CULT_CLASSIC_WATCH_COUNT_PERCENTILE = 0.25;

const cultClassic: ChallengeDefinition = {
  id: "cult-classic",
  name: "Cult Classic",
  description:
    "A highly-rated film (4.0+) with a watch count in the bottom 25% of your watchlist.",
  category: "popularity",
  requiredCapabilities: ["average_rating", "watch_count"],
  interactive: false,
  isEligible: (context) => getCultClassicPool(context).length > 0,
  attempt: (context) => {
    const pool = getCultClassicPool(context);
    if (pool.length === 0) {
      return {
        status: "ineligible",
        reason: "no_bottom_quartile_watch_count_films_rated_4_plus",
      };
    }
    return { status: "success", film: pickWeightedFilm(pool, context.rng) };
  },
};

function getCultClassicPool(context: {
  candidates: Parameters<typeof withKnownWatchCount>[0];
}) {
  const withWatchCount = withKnownWatchCount(context.candidates);
  const bottomQuartile = percentileSubsetAscendingBy(
    withWatchCount,
    (film) => film.watchCount,
    CULT_CLASSIC_WATCH_COUNT_PERCENTILE,
  );
  return bottomQuartile.filter(
    (film) =>
      film.averageRating !== null &&
      film.averageRating >= CULT_CLASSIC_MIN_RATING,
  );
}

const everyoneSawItExceptMe: ChallengeDefinition = {
  id: "everyone-saw-it-except-me",
  name: "Everyone Saw It Except Me",
  description: "The active watchlist film with the highest watch count.",
  category: "popularity",
  requiredCapabilities: ["watch_count"],
  interactive: false,
  isEligible: (context) => withKnownWatchCount(context.candidates).length > 0,
  attempt: (context) => {
    const pool = withKnownWatchCount(context.candidates);
    if (pool.length === 0) {
      return {
        status: "ineligible",
        reason: "no_films_with_known_watch_count",
      };
    }
    const highest = filterByExtreme(pool, (film) => film.watchCount, "max");
    return { status: "success", film: pickUniform(highest, context.rng) };
  },
};

const nobodysFavourite: ChallengeDefinition = {
  id: "nobodys-favourite",
  name: "Nobody's Favourite",
  description: "The active watchlist film with the lowest fans count.",
  category: "popularity",
  requiredCapabilities: ["fans_count"],
  interactive: false,
  isEligible: (context) => withKnownFansCount(context.candidates).length > 0,
  attempt: (context) => {
    const pool = withKnownFansCount(context.candidates);
    if (pool.length === 0) {
      return { status: "ineligible", reason: "no_films_with_known_fans_count" };
    }
    const fewest = filterByExtreme(pool, (film) => film.fansCount, "min");
    return { status: "success", film: pickUniform(fewest, context.rng) };
  },
};

const HIDDEN_GEM_MIN_RATING = 4.0;

const hiddenGemAlgorithm: ChallengeDefinition = {
  id: "hidden-gem-algorithm",
  name: "Hidden Gem Algorithm",
  description: "Among films rated 4.0+, the one with the fewest watches.",
  category: "popularity",
  requiredCapabilities: ["average_rating", "watch_count"],
  interactive: false,
  isEligible: (context) => getHiddenGemPool(context.candidates).length > 0,
  attempt: (context) => {
    const pool = getHiddenGemPool(context.candidates);
    if (pool.length === 0) {
      return {
        status: "ineligible",
        reason: "no_films_rated_4_plus_with_known_watch_count",
      };
    }
    const fewest = filterByExtreme(pool, (film) => film.watchCount, "min");
    return { status: "success", film: pickUniform(fewest, context.rng) };
  },
};

function getHiddenGemPool(candidates: Parameters<typeof withKnownRating>[0]) {
  return withKnownWatchCount(
    withKnownRating(candidates).filter(
      (film) => film.averageRating >= HIDDEN_GEM_MIN_RATING,
    ),
  );
}

export const popularityChallenges: ChallengeDefinition[] = [
  mainCharacter,
  hipsterPick,
  nobodyKnowsThis,
  listGoblin,
  cultClassic,
  everyoneSawItExceptMe,
  nobodysFavourite,
  hiddenGemAlgorithm,
];
