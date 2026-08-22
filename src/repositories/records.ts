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
/**
 * `"discarded"`: the profile let go of this draft without completing it —
 * currently only reachable via the event system's "Say Goodbye" flow (see
 * docs/product-spec.md, event system Phase 3), never through normal
 * drafting. Distinct from `"archived"`, which means every item was
 * actually resolved (watched or answered) — a discarded draft can have
 * unresolved items.
 */
export type DraftStatus = "active" | "expired" | "archived" | "discarded";
export type DraftChallengeMode = "choose" | "decide";
export type DraftItemSource = "random" | "challenge" | "manual";
/**
 * Why a draft item's `filmId` differs from `originFilmId` (see
 * `DraftItemRecord.originFilmId`) — `null` whenever it doesn't. FDraft
 * v1.0.2 introduces exactly two ways an already-selected item can be
 * substituted after the fact: an earlier, unwatched entry in the same
 * franchise/collection replacing a later-in-series roll
 * ("franchise_order"), or a completely absent metadata record forcing a
 * fresh random pick ("missing_metadata"). A manually-added item is never
 * a substitution — it has no `originFilmId` at all.
 */
export type DraftItemSubstitutionReason =
  "franchise_order" | "missing_metadata";
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
/** See `src/domain/events/point-currency.ts`. */
export type PointCurrency = "lifetime" | "misery" | "signal" | "bounty";
export type WatchedHistorySource =
  "app_watchlist_action" | "import_diary" | "import_watched";
/** See `src/domain/metadata/match-method.ts` — always read through `resolveMatchMethod()`, never trusted raw (a record from before this field existed has no such property at all). */
export type MetadataMatchMethod = "automatic" | "manual";
/**
 * `"unresolved"`: the provider returned candidates, or a search could be
 * performed, but nothing was confidently identified as the film — this is
 * potentially user-fixable (see `UnresolvedMetadataRecord`).
 * `"failed"`: a technical operation failed (provider outage, network
 * error, malformed response, rate limiting, an unexpected provider
 * error) — never means "the film could not be identified". See
 * docs/product-spec.md, "UNRESOLVED METADATA RESOLUTION", "IMPORTANT
 * DISTINCTION".
 */
export type MetadataResolutionStatus = "unresolved" | "failed";

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
  /** ISO calendar date (`YYYY-MM-DD`), or `null` if the provider never reported one. See `FilmMetadataResult.releaseDate`'s doc comment for why this exists alongside `FilmRecord.releaseYear`. */
  releaseDate: string | null;
  /** The provider's own release-status string (e.g. "Released"), or `null` if unknown. */
  releaseStatus: string | null;
  /** The provider's own matched title, verbatim, or `null` for a record predating this field. See `FilmMetadataResult.providerTitle`'s doc comment. */
  providerTitle: string | null;
  raw: Record<string, unknown> | null;
  /** "automatic" (the enrichment queue's own confidence-scored pick) or "manual" (a user's deliberate choice on the Unresolved Metadata screen) — see `src/domain/metadata/match-method.ts`. */
  matchMethod: MetadataMatchMethod;
  lastEnrichedAt: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * One film the enrichment queue could not confidently resolve on its own
 * — see docs/product-spec.md, "UNRESOLVED METADATA RESOLUTION". Exists
 * only while a film is in this state: a successful match (automatic or
 * manual) deletes the row for that `filmId` — the UNIQUE identity key
 * (see `src/infrastructure/local-db/schema.ts` v3/v4), since there's only
 * ever one configured provider active at a time in this app. `provider`
 * is informational only, not part of the row's identity. Catalog-wide
 * like `FilmMetadataRecord`, not profile-scoped — the same film is the
 * same film regardless of which profile's watchlist surfaced it.
 */
export interface UnresolvedMetadataRecord {
  id: string;
  filmId: string;
  provider: string;
  status: MetadataResolutionStatus;
  /** Machine-readable short code — the exact outcome that produced this row (e.g. "ambiguous", "not-found", "rate-limited", "provider-error", "invalid-import-data", "network-error"). */
  reason: string;
  /** Human-readable explanation for the resolution screen, e.g. "Could not confidently choose between multiple results." */
  message: string;
  lastAttemptedAt: string;
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
  /** The event that generated this draft, if any (see docs/product-spec.md, upcoming event system) — `null` for a normal, non-event draft. Never set or read by anything shipped so far; Phase 1 plumbing only. */
  sourceEventId: string | null;
  /**
   * Whether `sourceEventId` was manually enabled (see
   * `EventSettings.manuallyEnabledEvents`) at the moment THIS draft was
   * created, captured once and never recomputed (see docs/product-spec.md,
   * event system Phase 10: "the reward destination must be based on the
   * persisted activation context of that draft, not whatever the user's
   * current settings happen to be at completion time"). `null` for a
   * normal, non-event draft, OR for a draft created before this field
   * existed — `resolveDraftCompletionReward` falls back to re-deriving it
   * from current settings only in that legacy case.
   */
  sourceEventManuallyEnabled: boolean | null;
  /**
   * ISO 8601 timestamp of when this draft's completion rewards were
   * granted, or `null` if they never have been — the persisted guard
   * against granting the same draft's rewards twice (e.g. a retried or
   * re-entrant completion step), the same "nullable timestamp as a
   * one-time-event flag" convention as `completedAt`/`removedAt` elsewhere
   * in this file. No reward system exists yet (see the event system's
   * Phase 1 scope) — nothing sets this today; it only needs to persist and
   * restore correctly so a later phase can check-and-set it atomically.
   */
  rewardsGrantedAt: string | null;
  /**
   * A user-chosen title for this specific draft, or `null` to use the
   * generated `<Month> <Difficulty> Draft` default (see
   * `src/domain/drafts/draft-name.ts` — always read through
   * `getDraftDisplayName()`, never this field directly, so the generated
   * default logic lives in exactly one place). A pre-v1.0.2 record has no
   * such property at all, which normalizes to `null` — the same "use the
   * default" behaviour every draft already had.
   */
  customName: string | null;
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
  /**
   * The film that occupied this slot before a substitution replaced it
   * with `filmId` — `null` when this item's film has never changed since
   * it was first selected (the overwhelmingly common case). See
   * `DraftItemSubstitutionReason` for why the two only ever appear
   * together. A pre-v1.0.2 record has neither property at all — always
   * read through `LocalDraftRepository`'s normalization, never trusted
   * raw.
   */
  originFilmId: string | null;
  /** `null` whenever `originFilmId` is `null`. */
  substitutionReason: DraftItemSubstitutionReason | null;
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

/**
 * A profile's running total for one permanent point currency (see
 * docs/product-spec.md, event system Phase 4). One row per (profileId,
 * currency) — that compound pair is this record's natural identity, so
 * unlike most records here there's no separate `id`, the same convention
 * `SettingsRow` (`src/infrastructure/local-db/database.ts`) already uses
 * for its own `[profileId+key]`-keyed table. A profile with no row yet for
 * a given currency has a balance of 0, not a missing/undefined state — see
 * `PointsRepository.getBalance`.
 */
export interface PointBalanceRecord {
  profileId: string;
  currency: PointCurrency;
  total: number;
  updatedAt: string;
}
