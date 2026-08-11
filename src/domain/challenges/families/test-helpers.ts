import type {
  ChallengeCandidateFilm,
  ChallengeContext,
  ChallengeWatchedFilmRecord,
} from "../types";
import { DEFAULT_CHALLENGE_ENGINE_CONFIG } from "../types";
import { createSeededRng } from "@/domain/shared/rng";

let filmCounter = 0;
let watchedFilmCounter = 0;

/** A fully-specified candidate film for challenge tests, with sensible defaults every field can override. */
export function buildFilm(
  overrides: Partial<ChallengeCandidateFilm> = {},
): ChallengeCandidateFilm {
  filmCounter += 1;
  return {
    watchlistEntryId: `entry-${filmCounter}`,
    filmId: `film-${filmCounter}`,
    title: `Test Film ${filmCounter}`,
    releaseYear: 2000,
    dateAdded: "2024-01-01",
    position: null,
    selectionWeight: 1,
    runtimeMinutes: null,
    genres: null,
    directors: null,
    countries: null,
    languages: null,
    primaryLanguage: null,
    collectionId: null,
    collectionOrder: null,
    averageRating: null,
    popularity: null,
    watchCount: null,
    fansCount: null,
    listAppearances: null,
    ...overrides,
  };
}

/** A fully-specified watched-history record for challenge tests. */
export function buildWatchedFilm(
  overrides: Partial<ChallengeWatchedFilmRecord> = {},
): ChallengeWatchedFilmRecord {
  watchedFilmCounter += 1;
  return {
    filmId: `watched-film-${watchedFilmCounter}`,
    directors: null,
    genres: null,
    releaseYear: null,
    collectionId: null,
    userRating: null,
    watchedAt: null,
    ...overrides,
  };
}

export function buildContext(
  overrides: Partial<ChallengeContext> = {},
): ChallengeContext {
  return {
    rng: createSeededRng(1),
    now: new Date("2026-01-01T00:00:00.000Z"),
    candidates: [],
    previousPicks: [],
    watchedFilms: [],
    config: DEFAULT_CHALLENGE_ENGINE_CONFIG,
    ...overrides,
  };
}
