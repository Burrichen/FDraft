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

/**
 * `"one-at-a-time"` (see docs/updates, "ONE AT A TIME DRAFTING — CORE
 * SYSTEM") is a distinct creation MODE, not a numeric size — its final
 * `DraftRecord.totalFilms` is whatever the user actually staged before
 * pressing Done (1, 3, 17, ...), never a fixed count from `DIFFICULTIES`
 * (see `getFilmCount`, which deliberately throws for it exactly like it
 * already does for `"freeform"`). Distinguishing it as its own difficulty
 * value — rather than e.g. modelling it as "freeform with a count of one"
 * — is what lets History/Stats keep showing "One At A Time" as the mode a
 * draft was built with, independent of how many films ended up in it.
 */
export type DraftDifficulty =
  | "baby"
  | "easy"
  | "medium"
  | "hard"
  | "hardcore"
  | "freeform"
  | "one-at-a-time";
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
/**
 * `"halloween-adjacent"`/`"horror"`/`"kitsch"` (FDraft v1.2, "PROMPT 19 —
 * HALLOWEEN DRAFT MECHANICS") are the three Halloween Draft pools — never
 * Random/Challenge/Manual slots, and never represented as Challenge Engine
 * challenges. A `"horror"`/`"kitsch"` item's `watchlistEntryId` is
 * routinely `null` (see `DraftItemRecord.watchlistEntryId`'s doc comment)
 * — those films are drawn from the global curated lists and are not
 * required to be on the profile's own watchlist.
 */
export type DraftItemSource =
  | "random"
  | "challenge"
  | "manual"
  | "halloween-adjacent"
  | "horror"
  | "kitsch";

/**
 * HOW the film currently occupying a draft slot came to be there — the
 * canonical per-film provenance Living Drafts introduced (see
 * docs/updates, "FDRAFT v1.2.1 — LIVING DRAFTS" §1/§8).
 *
 * Deliberately a SEPARATE field from `DraftItemSource` rather than a
 * widening of it, because the two answer genuinely different questions and
 * both are load-bearing:
 *
 *  - `source` is the slot's BUILDER KIND / POOL. It drives whether a slot
 *    is editable (`canEditDraftSlot` only ever permits `"random"`), which
 *    pool badge History shows for a Halloween film
 *    (`"halloween-adjacent"`/`"horror"`/`"kitsch"`), and how One At A Time
 *    labels a staged pick. Rerolling or manually replacing a slot has
 *    always left it `"random"` on purpose — the slot is still a random
 *    slot, and must stay editable afterwards.
 *  - `entrySource` is how THIS film got here. A rerolled film and a
 *    first-roll film are indistinguishable in `source`; a DIY-selected
 *    film and one added later from the Watchlist are BOTH `"manual"`.
 *    Neither distinction can be recovered from existing fields, which is
 *    precisely what Stats needs (§8: "raw number of films watched from
 *    each generation/source type").
 *
 * `"one_at_a_time"` is deliberately NOT a value here: One At A Time is a
 * drafting METHOD, and each film staged through it still arrived by a real
 * source (`"random"`, `"diy"`, or `"event"`).
 *
 * Optional for backward compatibility — an item written before this field
 * existed has no such property. Never read it raw: a one-time schema
 * migration backfills every existing item (see `schema.ts` version 6), and
 * `LocalDraftRepository`'s own normalization derives a defensive fallback
 * for anything that migration could not reach.
 */
export type DraftItemEntrySource =
  | "random"
  | "challenge"
  | "diy"
  | "manual_add"
  | "manual_replace"
  | "reroll"
  | "event";
/**
 * Why a draft item's `filmId` differs from `originFilmId` (see
 * `DraftItemRecord.originFilmId`) — `null` whenever it doesn't. FDraft
 * v1.0.2 introduces the first two ways an already-selected item can be
 * substituted after the fact: an earlier, unwatched entry in the same
 * franchise/collection replacing a later-in-series roll
 * ("franchise_order"), or a completely absent metadata record forcing a
 * fresh random pick ("missing_metadata"). FDraft v1.1.3 ("Editable random
 * draft slots") adds two more, both deliberate user actions rather than
 * automatic corrections: hand-picking a specific replacement film
 * ("manual_replace") or rerolling for a new random one
 * ("user_reroll") — see `replaceDraftSlot`. A manually-added item is
 * never a substitution — it has no `originFilmId` at all.
 */
export type DraftItemSubstitutionReason =
  "franchise_order" | "missing_metadata" | "manual_replace" | "user_reroll";
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
export type PointCurrency =
  "lifetime" | "misery" | "signal" | "bounty" | "haunted" | "festive";
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
  /**
   * The real-world calendar year of the Event occurrence this draft was
   * created under, captured ONCE at creation time from the Admin-aware
   * `getEffectiveEventDate` (see docs/updates, "HALLOWEEN UI CLEANUP" §7) —
   * `null` for a normal, non-event draft, or for a Halloween draft created
   * before this field existed. Exists so a Halloween draft's canonical
   * "Halloween <year> Draft" title (`getDraftDisplayName`) reflects the
   * occurrence it actually belongs to even when Admin Event Testing is
   * simulating a year that differs from the real system clock — `startedAt`
   * always records the REAL creation instant (see `sourceEventManuallyEnabled`'s
   * own comment on why persisted timestamps never follow the simulated
   * clock), so it can't be used for this. A legacy record with no such
   * property normalizes to `null`; `getDraftDisplayName` falls back to
   * `startedAt`'s own year in that case, which is exactly correct for every
   * draft that was never created under a simulated Admin date.
   */
  eventOccurrenceYear: number | null;
  /**
   * The film count this draft was TARGETING when it was created, kept
   * separate from `totalFilms` (which is the draft's CURRENT size and may
   * grow — see docs/updates, "FDRAFT v1.2.1 — LIVING DRAFTS" §3).
   *
   * A Living Draft's identity never changes: a Medium draft that later
   * holds 14 films is still a Medium draft, and `difficulty` alone already
   * says so for every fixed difficulty. This field exists for the two
   * cases `difficulty` cannot answer — One At A Time and legacy Freeform
   * have no fixed count, so "what was this aiming at" is only knowable
   * from what was actually staged at creation — and so no caller has to
   * re-derive a target by calling `getFilmCount` and special-casing those
   * two. Read it through `resolveOriginalTargetFilms` rather than directly.
   *
   * `null` for a draft created before this field existed; the migration
   * backfills it from `difficulty` where that is authoritative and from
   * the draft's own size otherwise (see `schema.ts` version 6).
   */
  originalTargetFilms?: number | null;
  /**
   * The most recent reversible membership changes to this draft, newest
   * LAST, capped at `MAX_DRAFT_MUTATION_HISTORY` (see docs/updates,
   * "FDRAFT v1.2.1 — LIVING DRAFTS" §5).
   *
   * Stored ON the draft rather than in its own table on purpose: it is
   * bounded (five entries), it is only ever read and written together with
   * the draft it belongs to, pruning it is part of the same write that
   * appends to it, and it inherits the draft's own lifecycle for free —
   * backup/restore, profile erasure and `deleteDraft`'s cascade all
   * already cover it with no extra plumbing.
   *
   * `undefined`/`null` normalizes to an empty history, which is exactly
   * what every pre-existing draft should have: no recorded mutation is not
   * the same as a mutation that cannot be undone.
   */
  mutationHistory?: DraftMutationRecord[] | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * A snapshot of every field of a draft item that a reversible mutation can
 * change — enough to put the slot back exactly as it was, and nothing
 * more (see docs/updates, "FDRAFT v1.2.1 — LIVING DRAFTS" §5: "enough
 * information to safely reverse the last supported change").
 *
 * Deliberately NOT a full `DraftItemRecord`: the watched-state fields
 * (`isCompleted`/`completedAt`/`watchedHistoryId`/`eventRewardGrantedAt`)
 * are excluded because undo does not restore a stale watched state — it
 * REVERSES the watch outright, through the real watch-reversal path, so
 * points and completion can't be left corrupted (§6).
 */
export interface DraftMutationItemSnapshot {
  filmId: string;
  watchlistEntryId: string | null;
  source: DraftItemSource;
  entrySource: DraftItemEntrySource;
  enteredAt: string;
  challengeId: string | null;
  challengeAttemptId: string | null;
  challengeDisplayValue: Record<string, unknown> | null;
  originFilmId: string | null;
  substitutionReason: DraftItemSubstitutionReason | null;
  eventCategoryKey: string | null;
  orderIndex: number;
}

/** Which kind of membership change a `DraftMutationRecord` describes — see that type. */
export type DraftMutationKind = "add" | "replace";

/**
 * One reversible change to a draft's membership (see docs/updates, "FDRAFT
 * v1.2.1 — LIVING DRAFTS" §5). Two kinds, covering every membership change
 * the app can currently make:
 *
 *  - `"add"` — a film was appended (manual Add to Draft today; Event Add
 *    later). `previousItem` is `null`: there was nothing in that slot
 *    before, so undo deletes the item outright.
 *  - `"replace"` — a slot's occupant changed (reroll, manual replace,
 *    missing-metadata reroll). `previousItem` is the occupant to restore.
 *
 * Deliberately NOT a lineage chain (§1: "Do not implement full replacement
 * lineage"). Each entry describes exactly one step, and the history holds
 * at most five, so Alien → The Thing → Possession is three independent
 * undoable steps rather than a tracked ancestry.
 */
export interface DraftMutationRecord {
  id: string;
  kind: DraftMutationKind;
  /** ISO 8601 — when the mutation happened. */
  at: string;
  /** The draft item this mutation created or changed. */
  draftItemId: string;
  /** The slot's previous occupant for `"replace"`; `null` for `"add"`. */
  previousItem: DraftMutationItemSnapshot | null;
}

export interface DraftItemRecord {
  id: string;
  draftId: string;
  filmId: string;
  /**
   * `null` for a Halloween `"horror"`/`"kitsch"` item drawn from the
   * global curated lists rather than the profile's own watchlist (see
   * `DraftItemSource`) — deliberately, not merely as later decay. Any
   * logic keying off this field must treat `null` as a normal, expected
   * case for those two sources, not an error state.
   */
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
  /**
   * ISO 8601 timestamp of when THIS item's own per-film event-currency
   * reward was granted, or `null` if it never was — see
   * `awardEventDraftItemReward` (`draft-completion-reward.ts`), docs/
   * updates "EVENT SYSTEM — UNIVERSAL EVENT CURRENCY EARNING". The
   * per-ITEM idempotency guard, parallel to `DraftRecord.
   * rewardsGrantedAt`'s per-DRAFT one: a film watched twice (via an Undo
   * and a genuine re-watch) can only ever be credited once per genuine
   * watch. Always `null`/absent for a normal (non-event) draft's items,
   * or for an item in an event draft with no `EventDefinition.currency`
   * configured. Optional (unlike `originFilmId`/`substitutionReason`)
   * specifically so the many pre-existing fixtures/call sites across the
   * codebase that construct a `DraftItemRecord` for unrelated reasons
   * don't all need touching for a field irrelevant to them — always read
   * through `LocalDraftRepository`'s normalization, never trusted raw.
   */
  eventRewardGrantedAt?: string | null;
  /**
   * Which of an event's curated categories this item came from (matching
   * `EventDefinition.contentPools[].key`, e.g. `"horror"`/`"kitsch"`/
   * `"classic"`/`"adjacent"`) — `null` for a normal (non-event) draft item,
   * an event item from an event with no categories (January), or a
   * pre-existing item from before this field existed (see docs/updates,
   * "FDRAFT UPDATE 1 — EVENT ONE AT A TIME DRAFTING"). Deliberately
   * SEPARATE from `source`, which keeps its own unchanged meaning — HOW a
   * film was picked (`"random"`/`"manual"`/`"challenge"`) — so a Draft-So-Far
   * display can compose both independently ("Horror · Random", "Kitsch ·
   * Chosen", "Horror · Challenge: <name>") without a combinatorial explosion
   * of `source` values. Never set by the OLDER Halloween bulk-generation
   * flow (`createHalloweenLocalDraft`), which still encodes category
   * directly in `source` (`"halloween-adjacent"`/`"horror"`/`"kitsch"`) —
   * that flow is untouched by this field. Optional for the same
   * backward-compatibility reason as `eventRewardGrantedAt`.
   */
  eventCategoryKey?: string | null;
  /**
   * How the film currently in this slot arrived — see
   * `DraftItemEntrySource`. Optional for the same backward-compatibility
   * reason as the fields above; always read through
   * `LocalDraftRepository`'s normalization, never trusted raw.
   */
  entrySource?: DraftItemEntrySource | null;
  /**
   * ISO 8601 timestamp of when the CURRENT film entered this slot (see
   * docs/updates, "FDRAFT v1.2.1 — LIVING DRAFTS" §1: "when it entered the
   * Draft").
   *
   * Distinct from `createdAt`, which is when this ROW was created and
   * never changes. They are equal for a slot whose film has never been
   * substituted (the overwhelmingly common case) and diverge the moment
   * one is rerolled or manually replaced — a replacement reuses the same
   * row and the same `orderIndex`, so without this the "when did this film
   * join the Draft" question has no answer for a replaced slot.
   */
  enteredAt?: string | null;
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
