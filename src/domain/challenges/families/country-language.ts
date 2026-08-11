import { pickUniform, sampleWithoutReplacement } from "@/domain/shared/rng";
import type { ChallengeCandidateFilm, ChallengeDefinition } from "../types";
import {
  countOccurrences,
  filmsContaining,
  pickWeightedFilm,
  withKnownCountries,
  withKnownLanguages,
  withKnownPrimaryLanguage,
} from "./shared";

/**
 * Country/language challenges (see docs/product-spec.md, "COUNTRY /
 * LANGUAGE"). "No English Allowed" reads `primaryLanguage`, not `languages`
 * — see types.ts for why those are kept as two separate fields rather than
 * treating `languages[0]` as if it were the canonical original language.
 */

const passportControl: ChallengeDefinition = {
  id: "passport-control",
  name: "Passport Control",
  description:
    "A random country represented in your watchlist (equal probability per country), then a random film from it.",
  category: "country-language",
  requiredCapabilities: ["countries"],
  interactive: false,
  isEligible: (context) => withKnownCountries(context.candidates).length > 0,
  attempt: (context) => {
    const withCountries = withKnownCountries(context.candidates);
    if (withCountries.length === 0) {
      return { status: "ineligible", reason: "no_films_with_known_country" };
    }
    const counts = countOccurrences(withCountries, (film) => film.countries);
    const country = pickUniform([...counts.keys()], context.rng);
    const pool = filmsContaining(
      withCountries,
      (film) => film.countries,
      country,
    );
    return { status: "success", film: pickWeightedFilm(pool, context.rng) };
  },
};

const languageRoulette: ChallengeDefinition = {
  id: "language-roulette",
  name: "Language Roulette",
  description:
    "A random language represented in your watchlist (equal probability per language), then a random film containing it.",
  category: "country-language",
  requiredCapabilities: ["languages"],
  interactive: false,
  isEligible: (context) => withKnownLanguages(context.candidates).length > 0,
  attempt: (context) => {
    const withLanguages = withKnownLanguages(context.candidates);
    if (withLanguages.length === 0) {
      return { status: "ineligible", reason: "no_films_with_known_language" };
    }
    const counts = countOccurrences(withLanguages, (film) => film.languages);
    const language = pickUniform([...counts.keys()], context.rng);
    const pool = filmsContaining(
      withLanguages,
      (film) => film.languages,
      language,
    );
    return { status: "success", film: pickWeightedFilm(pool, context.rng) };
  },
};

function isEnglish(primaryLanguage: string): boolean {
  return primaryLanguage.trim().toLowerCase() === "english";
}

const noEnglishAllowed: ChallengeDefinition = {
  id: "no-english-allowed",
  name: "No English Allowed",
  description: "A random film whose primary/original language is not English.",
  category: "country-language",
  requiredCapabilities: ["primary_language"],
  interactive: false,
  isEligible: (context) =>
    getNoEnglishAllowedPool(context.candidates).length > 0,
  attempt: (context) => {
    const pool = getNoEnglishAllowedPool(context.candidates);
    if (pool.length === 0) {
      return { status: "ineligible", reason: "no_non_english_films" };
    }
    return { status: "success", film: pickWeightedFilm(pool, context.rng) };
  },
};

function getNoEnglishAllowedPool(
  candidates: readonly ChallengeCandidateFilm[],
) {
  return withKnownPrimaryLanguage(candidates).filter(
    (film) => !isEnglish(film.primaryLanguage),
  );
}

const WORLD_CUP_DRAW_SIZE = 4;

const worldCup: ChallengeDefinition = {
  id: "world-cup",
  name: "World Cup",
  description:
    "Four countries are drawn at random; three are eliminated; a film from the survivor is chosen.",
  category: "country-language",
  requiredCapabilities: ["countries"],
  interactive: false,
  isEligible: (context) =>
    getRepresentedCountries(context.candidates).length >= WORLD_CUP_DRAW_SIZE,
  attempt: (context) => {
    const withCountries = withKnownCountries(context.candidates);
    const countries = getRepresentedCountries(context.candidates);
    if (countries.length < WORLD_CUP_DRAW_SIZE) {
      return {
        status: "ineligible",
        reason: "fewer_than_four_countries_represented",
      };
    }
    const drawnCountries = sampleWithoutReplacement(
      countries,
      WORLD_CUP_DRAW_SIZE,
      context.rng,
    );
    const winner = pickUniform(drawnCountries, context.rng);
    const pool = filmsContaining(
      withCountries,
      (film) => film.countries,
      winner,
    );
    return {
      status: "success",
      film: pickWeightedFilm(pool, context.rng),
      displayValue: { countries: drawnCountries, winner },
    };
  },
};

function getRepresentedCountries(
  candidates: readonly ChallengeCandidateFilm[],
): string[] {
  return [
    ...countOccurrences(
      withKnownCountries(candidates),
      (film) => film.countries,
    ).keys(),
  ];
}

const continentalDrift: ChallengeDefinition = {
  id: "continental-drift",
  name: "Continental Drift",
  description:
    "A film that does not share any country with the previous draft pick.",
  category: "country-language",
  requiredCapabilities: ["countries", "previous_draft_pick"],
  interactive: false,
  isEligible: (context) => getContinentalDriftPool(context).length > 0,
  attempt: (context) => {
    const previous = context.previousPicks.at(-1);
    if (!previous) {
      return { status: "ineligible", reason: "no_previous_draft_pick" };
    }
    if (previous.countries === null || previous.countries.length === 0) {
      return {
        status: "ineligible",
        reason: "previous_pick_missing_countries",
      };
    }
    const pool = getContinentalDriftPool(context);
    if (pool.length === 0) {
      return {
        status: "ineligible",
        reason: "no_film_from_a_different_country",
      };
    }
    return { status: "success", film: pickWeightedFilm(pool, context.rng) };
  },
};

function getContinentalDriftPool(context: {
  candidates: ChallengeCandidateFilm[];
  previousPicks: ChallengeCandidateFilm[];
}): ChallengeCandidateFilm[] {
  const previous = context.previousPicks.at(-1);
  if (!previous || !previous.countries?.length) {
    return [];
  }
  const previousCountries = new Set(previous.countries);
  return context.candidates.filter(
    (film) =>
      film.countries !== null &&
      film.countries.every((c) => !previousCountries.has(c)),
  );
}

/** English name TMDB (and this app's other providers) use for Japan — see types.ts, "Weeb": "use country/origin data rather than guessing from language/title." */
const JAPAN_COUNTRY_NAME = "Japan";

const weeb: ChallengeDefinition = {
  id: "weeb",
  name: "Weeb",
  description: "A random Japanese film, determined by country of origin.",
  category: "country-language",
  requiredCapabilities: ["countries"],
  interactive: false,
  isEligible: (context) => getWeebPool(context.candidates).length > 0,
  attempt: (context) => {
    const pool = getWeebPool(context.candidates);
    if (pool.length === 0) {
      return {
        status: "ineligible",
        reason: "no_japanese_films_by_country_of_origin",
      };
    }
    return { status: "success", film: pickWeightedFilm(pool, context.rng) };
  },
};

function getWeebPool(candidates: readonly ChallengeCandidateFilm[]) {
  return filmsContaining(
    withKnownCountries(candidates),
    (film) => film.countries,
    JAPAN_COUNTRY_NAME,
  );
}

export const countryLanguageChallenges: ChallengeDefinition[] = [
  passportControl,
  languageRoulette,
  noEnglishAllowed,
  worldCup,
  continentalDrift,
  weeb,
];
