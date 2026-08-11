import { filterByExtreme, pickUniform } from "@/domain/shared/rng";
import type {
  ChallengeCandidateFilm,
  ChallengeDefinition,
  ChallengeWatchedFilmRecord,
} from "../types";
import { groupBy, pickWeightedFilm } from "./shared";

/**
 * Collection/franchise challenges (see docs/product-spec.md, "COLLECTIONS /
 * FRANCHISES"). All read `collectionId`/`collectionOrder`, which come from
 * TMDB's `belongs_to_collection` — `null` there is authoritative ("this
 * film isn't part of a collection"), not "unknown", so "No Homework" can
 * safely treat it as a real signal rather than missing data.
 */

function withKnownCollection(
  candidates: readonly ChallengeCandidateFilm[],
): (ChallengeCandidateFilm & { collectionId: string })[] {
  return candidates.filter(
    (film): film is ChallengeCandidateFilm & { collectionId: string } =>
      film.collectionId !== null,
  );
}

function watchedCollectionIds(
  watchedFilms: readonly ChallengeWatchedFilmRecord[],
): Set<string> {
  return new Set(
    watchedFilms
      .filter(
        (watched): watched is typeof watched & { collectionId: string } =>
          watched.collectionId !== null,
      )
      .map((watched) => watched.collectionId),
  );
}

const finishWhatYouStarted: ChallengeDefinition = {
  id: "finish-what-you-started",
  name: "Finish What You Started",
  description:
    "A sequel/collection film where you've already watched an earlier entry.",
  category: "collections",
  requiredCapabilities: ["collection", "watched_history"],
  interactive: false,
  isEligible: (context) => getFinishWhatYouStartedPool(context).length > 0,
  attempt: (context) => {
    const pool = getFinishWhatYouStartedPool(context);
    if (pool.length === 0) {
      return {
        status: "ineligible",
        reason: "no_collection_film_with_earlier_entry_watched",
      };
    }
    return { status: "success", film: pickWeightedFilm(pool, context.rng) };
  },
};

function getFinishWhatYouStartedPool(context: {
  candidates: ChallengeCandidateFilm[];
  watchedFilms: ChallengeWatchedFilmRecord[];
}) {
  const startedCollections = watchedCollectionIds(context.watchedFilms);
  return withKnownCollection(context.candidates).filter((film) =>
    startedCollections.has(film.collectionId),
  );
}

const franchiseDebt: ChallengeDefinition = {
  id: "franchise-debt",
  name: "Franchise Debt",
  description:
    "The oldest watchlist addition belonging to a known film collection.",
  category: "collections",
  requiredCapabilities: ["collection"],
  interactive: false,
  isEligible: (context) => withKnownCollection(context.candidates).length > 0,
  attempt: (context) => {
    const pool = withKnownCollection(context.candidates);
    if (pool.length === 0) {
      return { status: "ineligible", reason: "no_films_with_known_collection" };
    }
    const oldest = filterByExtreme(
      pool,
      (film) => new Date(film.dateAdded).getTime(),
      "min",
    );
    return { status: "success", film: pickUniform(oldest, context.rng) };
  },
};

/**
 * The "first" film in a collection, using collection ordering when every
 * member has it, falling back to release year when reliable — see
 * docs/product-spec.md, "Gateway Drug": "'First' should use collection
 * ordering/release order where reliable." Returns `null` when neither
 * ordering signal is reliable for this specific group (rather than
 * guessing), so that collection simply doesn't contribute a "first" film.
 */
function firstFilmInCollection(
  filmsInCollection: readonly ChallengeCandidateFilm[],
): ChallengeCandidateFilm | null {
  const withOrder = filmsInCollection.filter(
    (film) => film.collectionOrder !== null,
  );
  if (withOrder.length === filmsInCollection.length) {
    return filterByExtreme(
      withOrder,
      (film) => film.collectionOrder as number,
      "min",
    )[0];
  }
  const withYear = filmsInCollection.filter(
    (film) => film.releaseYear !== null,
  );
  if (withYear.length === filmsInCollection.length) {
    return filterByExtreme(
      withYear,
      (film) => film.releaseYear as number,
      "min",
    )[0];
  }
  return null;
}

const gatewayDrug: ChallengeDefinition = {
  id: "gateway-drug",
  name: "Gateway Drug",
  description:
    "The first unwatched film from a collection you've never started.",
  category: "collections",
  requiredCapabilities: ["collection", "watched_history"],
  interactive: false,
  isEligible: (context) => getGatewayDrugPool(context).length > 0,
  attempt: (context) => {
    const pool = getGatewayDrugPool(context);
    if (pool.length === 0) {
      return {
        status: "ineligible",
        reason: "no_never_started_collection_with_reliable_first_film",
      };
    }
    return { status: "success", film: pickWeightedFilm(pool, context.rng) };
  },
};

function getGatewayDrugPool(context: {
  candidates: ChallengeCandidateFilm[];
  watchedFilms: ChallengeWatchedFilmRecord[];
}): ChallengeCandidateFilm[] {
  const startedCollections = watchedCollectionIds(context.watchedFilms);
  const neverStarted = withKnownCollection(context.candidates).filter(
    (film) => !startedCollections.has(film.collectionId),
  );
  const byCollection = groupBy(neverStarted, (film) => film.collectionId);
  const firstFilms: ChallengeCandidateFilm[] = [];
  for (const filmsInCollection of byCollection.values()) {
    const first = firstFilmInCollection(filmsInCollection);
    if (first) {
      firstFilms.push(first);
    }
  }
  return firstFilms;
}

const noHomework: ChallengeDefinition = {
  id: "no-homework",
  name: "No Homework",
  description: "A standalone film with no collection/franchise attached.",
  category: "collections",
  requiredCapabilities: ["collection"],
  interactive: false,
  isEligible: (context) =>
    context.candidates.some((film) => film.collectionId === null),
  attempt: (context) => {
    const pool = context.candidates.filter(
      (film) => film.collectionId === null,
    );
    if (pool.length === 0) {
      return { status: "ineligible", reason: "no_standalone_films" };
    }
    return { status: "success", film: pickWeightedFilm(pool, context.rng) };
  },
};

export const collectionChallenges: ChallengeDefinition[] = [
  finishWhatYouStarted,
  franchiseDebt,
  gatewayDrug,
  noHomework,
];
