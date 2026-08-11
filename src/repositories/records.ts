/**
 * Domain-shaped records for every locally-persisted entity (see
 * docs/product-spec.md, "LOCAL DATABASE" — Prompt 9.5A). These mirror what
 * used to be Postgres table rows, back when this app had a Supabase
 * backend (removed in Prompt 9.5B), closely enough that the existing pure
 * domain layer
 * (`src/domain/challenges`, `src/domain/drafts`, `src/domain/stats`, ...)
 * needs no changes at all — but every `user_id` column becomes `profileId`,
 * and nothing here imports Dexie, Supabase, or React. This file is the
 * vocabulary repository *interfaces* (this directory) and repository
 * *implementations* (`src/infrastructure/local-db`) both speak, so domain
 * and application code never needs to know which storage engine is behind
 * the interface.
 */

export type DraftDifficulty =
  "baby" | "easy" | "medium" | "hard" | "hardcore" | "freeform";
export type DraftTimeMode = "calendar" | "timer";
export type DraftStatus = "active" | "expired" | "archived";
export type DraftChallengeMode = "choose" | "decide";
export type DraftItemSource = "random" | "challenge";
export type FreeformRank =
  "below_baby" | "baby" | "easy" | "medium" | "hard" | "hardcore";
export type ChallengeAttemptStatus =
  "success" | "ineligible" | "requires_user_choice" | "failure";
export type ChallengeInteractionStatus = "in_progress" | "resolved";
export type PostmortemResponseType =
  "wanted_more_time" | "not_interested" | "no_reason";
export type ImportSource = "csv" | "zip";
export type ImportStatus = "pending" | "completed" | "failed";
export type WatchlistRemovalReason =
  "watched" | "postmortem_not_interested" | "manual";
export type WatchedHistorySource =
  "app_watchlist_action" | "import_diary" | "import_watched";

export interface FilmRecord {
  id: string;
  title: string;
  releaseYear: number | null;
  letterboxdSlug: string | null;
  letterboxdUri: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FilmMetadataRecord {
  id: string;
  filmId: string;
  provider: string;
  posterUrl: string | null;
  runtimeMinutes: number | null;
  genres: string[] | null;
  directors: string[] | null;
  countries: string[] | null;
  languages: string[] | null;
  collectionId: string | null;
  collectionName: string | null;
  collectionOrder: number | null;
  averageRating: number | null;
  popularity: number | null;
  watchCount: number | null;
  fansCount: number | null;
  listAppearances: number | null;
  externalIds: Record<string, unknown> | null;
  raw: Record<string, unknown> | null;
  lastEnrichedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface WatchlistEntryRecord {
  id: string;
  profileId: string;
  filmId: string;
  dateAdded: string;
  position: number | null;
  isActive: boolean;
  selectionWeight: number;
  importSource: ImportSource | null;
  importId: string | null;
  removedAt: string | null;
  removedReason: WatchlistRemovalReason | null;
  createdAt: string;
  updatedAt: string;
}

export interface WatchlistImportRecord {
  id: string;
  profileId: string;
  source: ImportSource;
  status: ImportStatus;
  rawFilename: string | null;
  filmsImported: number;
  filmsUpdated: number;
  duplicatesSkipped: number;
  enrichmentFailures: number;
  unresolvedCount: number;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
}

export interface WatchedHistoryRecord {
  id: string;
  profileId: string;
  filmId: string;
  watchlistEntryId: string | null;
  source: WatchedHistorySource;
  watchedDate: string | null;
  createdAt: string;
}

export interface UserRatingRecord {
  id: string;
  profileId: string;
  filmId: string;
  rating: number;
  source: string;
  ratedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DraftRecord {
  id: string;
  profileId: string;
  difficulty: DraftDifficulty;
  timeMode: DraftTimeMode;
  status: DraftStatus;
  totalFilms: number;
  randomFilmCount: number;
  challengeFilmCount: number;
  challengeMode: DraftChallengeMode | null;
  startedAt: string;
  deadlineAt: string;
  timezone: string;
  completedAt: string | null;
  freeformAchievedRank: FreeformRank | null;
  createdAt: string;
  updatedAt: string;
}

export interface DraftItemRecord {
  id: string;
  draftId: string;
  filmId: string;
  watchlistEntryId: string | null;
  source: DraftItemSource;
  challengeId: string | null;
  challengeAttemptId: string | null;
  challengeDisplayValue: Record<string, unknown> | null;
  orderIndex: number;
  isCompleted: boolean;
  completedAt: string | null;
  watchedHistoryId: string | null;
  createdAt: string;
}

export interface DraftChallengeAttemptRecord {
  id: string;
  draftId: string;
  challengeId: string;
  attemptNumber: number;
  status: ChallengeAttemptStatus;
  reason: string | null;
  candidateFilmId: string | null;
  createdAt: string;
}

export interface DraftChallengeInteractionRecord {
  id: string;
  draftId: string;
  challengeId: string;
  status: ChallengeInteractionStatus;
  state: Record<string, unknown>;
  resultingWatchlistEntryId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DraftPostmortemResponseRecord {
  id: string;
  draftId: string;
  draftItemId: string;
  response: PostmortemResponseType;
  appliedAt: string;
  createdAt: string;
}

export interface SelectionWeightAdjustmentRecord {
  id: string;
  watchlistEntryId: string;
  draftPostmortemResponseId: string | null;
  delta: number;
  reason: string;
  createdAt: string;
}
