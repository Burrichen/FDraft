import { filterByExtreme, pickUniform, shuffle } from "@/domain/shared/rng";
import type { ChallengeCandidateFilm, ChallengeDefinition } from "../types";
import { pickWeightedFilm, withKnownRuntime } from "./shared";

/**
 * Runtime challenges (see docs/product-spec.md, "RUNTIME"). All require the
 * `runtime` data capability — a provider that never supplies runtime makes
 * every challenge in this family permanently ineligible, not silently wrong.
 */

const shortKing: ChallengeDefinition = {
  id: "short-king",
  name: "Short King",
  description: "The shortest active watchlist film with a known runtime.",
  category: "runtime",
  requiredCapabilities: ["runtime"],
  interactive: false,
  isEligible: (context) => withKnownRuntime(context.candidates).length > 0,
  attempt: (context) => {
    const pool = withKnownRuntime(context.candidates);
    if (pool.length === 0) {
      return { status: "ineligible", reason: "no_films_with_known_runtime" };
    }
    const shortest = filterByExtreme(
      pool,
      (film) => film.runtimeMinutes,
      "min",
    );
    return { status: "success", film: pickUniform(shortest, context.rng) };
  },
};

function plusSizedShortKingPool(
  candidates: readonly ChallengeCandidateFilm[],
  featureLengthMinutesThreshold: number,
) {
  return withKnownRuntime(candidates).filter(
    (film) => film.runtimeMinutes >= featureLengthMinutesThreshold,
  );
}

const plusSizedShortKing: ChallengeDefinition = {
  id: "plus-sized-short-king",
  name: "Plus Sized Short King",
  description:
    "The shortest watchlist film that still qualifies as feature length.",
  category: "runtime",
  requiredCapabilities: ["runtime"],
  interactive: false,
  isEligible: (context) =>
    plusSizedShortKingPool(
      context.candidates,
      context.config.featureLengthMinutesThreshold,
    ).length > 0,
  attempt: (context) => {
    const pool = plusSizedShortKingPool(
      context.candidates,
      context.config.featureLengthMinutesThreshold,
    );
    if (pool.length === 0) {
      return {
        status: "ineligible",
        reason: "no_feature_length_films_with_known_runtime",
      };
    }
    const shortest = filterByExtreme(
      pool,
      (film) => film.runtimeMinutes,
      "min",
    );
    return { status: "success", film: pickUniform(shortest, context.rng) };
  },
};

const under90Club: ChallengeDefinition = {
  id: "under-90-club",
  name: "Under 90 Club",
  description: "A random film with a runtime under 90 minutes.",
  category: "runtime",
  requiredCapabilities: ["runtime"],
  interactive: false,
  isEligible: (context) =>
    withKnownRuntime(context.candidates).some(
      (film) => film.runtimeMinutes < 90,
    ),
  attempt: (context) => {
    const pool = withKnownRuntime(context.candidates).filter(
      (film) => film.runtimeMinutes < 90,
    );
    if (pool.length === 0) {
      return { status: "ineligible", reason: "no_films_under_90_minutes" };
    }
    return { status: "success", film: pickWeightedFilm(pool, context.rng) };
  },
};

const bossBattle: ChallengeDefinition = {
  id: "boss-battle",
  name: "Boss Battle",
  description: "A random film with a runtime of 150 minutes or more.",
  category: "runtime",
  requiredCapabilities: ["runtime"],
  interactive: false,
  isEligible: (context) =>
    withKnownRuntime(context.candidates).some(
      (film) => film.runtimeMinutes >= 150,
    ),
  attempt: (context) => {
    const pool = withKnownRuntime(context.candidates).filter(
      (film) => film.runtimeMinutes >= 150,
    );
    if (pool.length === 0) {
      return { status: "ineligible", reason: "no_films_150_minutes_or_more" };
    }
    return { status: "success", film: pickWeightedFilm(pool, context.rng) };
  },
};

type RuntimeBucket = "under-90" | "90-to-119" | "120-to-149" | "150-plus";
const RUNTIME_BUCKETS: RuntimeBucket[] = [
  "under-90",
  "90-to-119",
  "120-to-149",
  "150-plus",
];

function bucketFor(runtimeMinutes: number): RuntimeBucket {
  if (runtimeMinutes < 90) return "under-90";
  if (runtimeMinutes < 120) return "90-to-119";
  if (runtimeMinutes < 150) return "120-to-149";
  return "150-plus";
}

function filmsInBucket(
  candidates: readonly ChallengeCandidateFilm[],
  bucket: RuntimeBucket,
) {
  return withKnownRuntime(candidates).filter(
    (film) => bucketFor(film.runtimeMinutes) === bucket,
  );
}

const runtimeRoulette: ChallengeDefinition = {
  id: "runtime-roulette",
  name: "Runtime Roulette",
  description:
    "A random runtime band (<90, 90-119, 120-149, 150+), then a random film from it.",
  category: "runtime",
  requiredCapabilities: ["runtime"],
  interactive: false,
  isEligible: (context) => withKnownRuntime(context.candidates).length > 0,
  attempt: (context) => {
    if (withKnownRuntime(context.candidates).length === 0) {
      return { status: "ineligible", reason: "no_films_with_known_runtime" };
    }
    // Equal-probability category choice: shuffle all four bands (even empty
    // ones) and take the first with candidates — "If category has no
    // candidates, reroll" (product-spec.md), bounded by the fixed 4 bands.
    const order = shuffle(RUNTIME_BUCKETS, context.rng);
    for (const bucket of order) {
      const pool = filmsInBucket(context.candidates, bucket);
      if (pool.length > 0) {
        return { status: "success", film: pickWeightedFilm(pool, context.rng) };
      }
    }
    return { status: "ineligible", reason: "no_films_with_known_runtime" };
  },
};

const MAX_DOUBLE_FEATURE_TOTAL_MINUTES = 200;

function doubleFeaturePool(context: {
  candidates: readonly ChallengeCandidateFilm[];
  previousPicks: readonly ChallengeCandidateFilm[];
}): ChallengeCandidateFilm[] {
  const previousWithRuntime = withKnownRuntime(context.previousPicks);
  if (previousWithRuntime.length === 0) {
    return [];
  }
  return withKnownRuntime(context.candidates).filter((candidate) =>
    previousWithRuntime.some(
      (previous) =>
        previous.runtimeMinutes + candidate.runtimeMinutes <
        MAX_DOUBLE_FEATURE_TOTAL_MINUTES,
    ),
  );
}

const doubleFeatureHalf: ChallengeDefinition = {
  id: "double-feature-half",
  name: "Double Feature Half",
  description:
    "A film that pairs with one already in this draft for a combined runtime under 200 minutes.",
  category: "runtime",
  requiredCapabilities: ["runtime", "previous_draft_pick"],
  interactive: false,
  // No previous picks yet means this challenge simply isn't eligible for
  // *this* slot — "defer until later in generation" (product-spec.md) falls
  // out naturally: the generator will try it again on a later slot once
  // previousPicks is non-empty, without any special deferral mechanism.
  isEligible: (context) => doubleFeaturePool(context).length > 0,
  attempt: (context) => {
    if (context.previousPicks.length === 0) {
      return { status: "ineligible", reason: "no_previous_picks_yet" };
    }
    const pool = doubleFeaturePool(context);
    if (pool.length === 0) {
      return {
        status: "ineligible",
        reason: "no_valid_runtime_pairing_under_200",
      };
    }
    return { status: "success", film: pickWeightedFilm(pool, context.rng) };
  },
};

const GOLDILOCKS_TARGET_MINUTES = 100;

const goldilocks: ChallengeDefinition = {
  id: "goldilocks",
  name: "Goldilocks",
  description: "The film whose runtime is closest to exactly 100 minutes.",
  category: "runtime",
  requiredCapabilities: ["runtime"],
  interactive: false,
  isEligible: (context) => withKnownRuntime(context.candidates).length > 0,
  attempt: (context) => {
    const pool = withKnownRuntime(context.candidates);
    if (pool.length === 0) {
      return { status: "ineligible", reason: "no_films_with_known_runtime" };
    }
    const closest = filterByExtreme(
      pool,
      (film) => Math.abs(film.runtimeMinutes - GOLDILOCKS_TARGET_MINUTES),
      "min",
    );
    return { status: "success", film: pickUniform(closest, context.rng) };
  },
};

const MINUTE_MATCH_MIN_TARGET = 80;
const MINUTE_MATCH_MAX_TARGET = 180;

const minuteMatch: ChallengeDefinition = {
  id: "minute-match",
  name: "Minute Match",
  description:
    "Generates a random target runtime (80-180 minutes) and finds the film closest to it.",
  category: "runtime",
  requiredCapabilities: ["runtime"],
  interactive: false,
  isEligible: (context) => withKnownRuntime(context.candidates).length > 0,
  attempt: (context) => {
    const pool = withKnownRuntime(context.candidates);
    if (pool.length === 0) {
      return { status: "ineligible", reason: "no_films_with_known_runtime" };
    }
    const targetMinutes =
      Math.floor(
        context.rng.next() *
          (MINUTE_MATCH_MAX_TARGET - MINUTE_MATCH_MIN_TARGET + 1),
      ) + MINUTE_MATCH_MIN_TARGET;
    const closest = filterByExtreme(
      pool,
      (film) => Math.abs(film.runtimeMinutes - targetMinutes),
      "min",
    );
    return {
      status: "success",
      film: pickUniform(closest, context.rng),
      displayValue: { targetMinutes },
    };
  },
};

export const runtimeChallenges: ChallengeDefinition[] = [
  shortKing,
  plusSizedShortKing,
  under90Club,
  bossBattle,
  runtimeRoulette,
  doubleFeatureHalf,
  goldilocks,
  minuteMatch,
];
