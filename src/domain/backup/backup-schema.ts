import { z } from "zod";

/**
 * Typed schemas for the portable FDraft backup format (see
 * docs/product-spec.md, "BACKUP FORMAT" — Prompt 9.5C: "Use actual typed
 * schemas. Validate imports with Zod or the existing validation system.").
 * A backup file is untrusted input the moment it comes from disk — every
 * field here is validated explicitly, nothing is passed through
 * unchecked, and no schema uses `.passthrough()`/`z.record(z.unknown())`
 * without going through `jsonValueSchema` below, which is the one place
 * arbitrary nested JSON is allowed and is deliberately hardened against
 * prototype pollution (see its own comment).
 *
 * This is a *different* format from `src/migration/
 * supabase-export-types.ts` (that one describes a one-off export out of
 * the old, now-removed Supabase backend, in that backend's snake_case
 * shape). This format is FDraft-to-FDraft: local profile in, local
 * profile out, camelCase, versioned, and meant to be used routinely, not
 * just once during a migration.
 */

export const BACKUP_FORMAT_MARKER = "fdraft-backup";

// ---------------------------------------------------------------------------
// Prototype-pollution-safe arbitrary JSON (for genuinely free-form fields:
// film metadata's `raw`/`externalIds`, a draft item's `challengeDisplayValue`,
// an interaction's `state`). Rejects `__proto__`/`constructor`/`prototype`
// as object keys at any depth, and only ever admits plain JSON primitives —
// no functions, no `undefined`, nothing exotic can survive this parse.
// ---------------------------------------------------------------------------

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const jsonPrimitiveSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    jsonPrimitiveSchema,
    z.array(jsonValueSchema),
    z
      .record(z.string(), jsonValueSchema)
      .refine(
        (obj) => Object.keys(obj).every((key) => !DANGEROUS_KEYS.has(key)),
        {
          message:
            "Object keys __proto__, constructor, and prototype are not allowed.",
        },
      ),
  ]),
);

const jsonObjectSchema = z
  .record(z.string(), jsonValueSchema)
  .refine((obj) => Object.keys(obj).every((key) => !DANGEROUS_KEYS.has(key)), {
    message:
      "Object keys __proto__, constructor, and prototype are not allowed.",
  });

/** Non-empty, reasonably-bounded id string — every foreign key in the backup is checked against this, not just "is a string". */
const idSchema = z.string().trim().min(1).max(200);
const nullableIdSchema = idSchema.nullable();

/** Loose but real ISO-8601 check — `z.string().datetime()` is too strict about fractional seconds/timezone offsets across the values this app actually produces (`toISOString()`, plain `YYYY-MM-DD` dates). */
const isoDateTimeSchema = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Expected a valid ISO-8601 date/time string.",
  });
const nullableIsoDateTimeSchema = isoDateTimeSchema.nullable();

/** `YYYY-MM-DD` calendar dates (watchlist `dateAdded`, watched dates). */
const isoCalendarDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected an ISO calendar date (YYYY-MM-DD).");
const nullableIsoCalendarDateSchema = isoCalendarDateSchema.nullable();

const boundedString = (max: number) => z.string().max(max);
const nullableBoundedString = (max: number) => boundedString(max).nullable();
const stringArraySchema = z.array(z.string().max(200)).max(500).nullable();

// ---------------------------------------------------------------------------
// Enums — mirrors src/repositories/records.ts exactly. Duplicated rather
// than imported so this schema file has zero dependency on anything that
// could change shape without a deliberate backup-format version bump.
// ---------------------------------------------------------------------------

export const draftDifficultySchema = z.enum([
  "baby",
  "easy",
  "medium",
  "hard",
  "hardcore",
  "freeform",
]);
export const draftTimeModeSchema = z.enum(["calendar", "timer"]);
export const draftStatusSchema = z.enum(["active", "expired", "archived"]);
export const draftChallengeModeSchema = z.enum(["choose", "decide"]).nullable();
export const draftItemSourceSchema = z.enum(["random", "challenge", "manual"]);
export const draftItemSubstitutionReasonSchema = z.enum([
  "franchise_order",
  "missing_metadata",
]);
export const freeformRankSchema = z
  .enum(["below_baby", "baby", "easy", "medium", "hard", "hardcore"])
  .nullable();
export const challengeAttemptStatusSchema = z.enum([
  "success",
  "ineligible",
  "requires_user_choice",
  "failure",
]);
export const challengeInteractionStatusSchema = z.enum([
  "in_progress",
  "resolved",
]);
export const postmortemResponseTypeSchema = z.enum([
  "wanted_more_time",
  "not_interested",
  "no_reason",
]);
export const importSourceSchema = z.enum(["csv", "zip"]);
export const importStatusSchema = z.enum(["pending", "completed", "failed"]);
export const watchlistRemovalReasonSchema = z
  .enum(["watched", "postmortem_not_interested", "manual"])
  .nullable();
export const watchedHistorySourceSchema = z.enum([
  "app_watchlist_action",
  "import_diary",
  "import_watched",
]);

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export const profileSettingsSchema = z.object({
  reducedMotion: z.boolean(),
  // Optional — a backup exported before this setting existed has no such
  // key at all, and must still validate; `resolveDefaultPage()` (see
  // `src/domain/profiles/default-page.ts`) is what actually falls back to
  // Watchlist for a missing or invalid value wherever this is READ, not
  // this schema.
  defaultPage: z.enum(["watchlist", "drafts", "history", "stats"]).optional(),
  // Optional for the same reason — a backup exported before v1.0.2 has no
  // such key; `resolveFranchiseChronologicalOrder()` (see
  // `src/domain/profiles/profile.ts`) falls back to `false` wherever this
  // is READ.
  franchiseChronologicalOrder: z.boolean().optional(),
});

export const backupProfileSchema = z.object({
  id: idSchema,
  displayName: z.string().trim().min(1).max(80),
  createdAt: isoDateTimeSchema,
  lastOpenedAt: isoDateTimeSchema,
  timezone: z.string().trim().min(1).max(100),
  settings: profileSettingsSchema,
  dataVersion: z.number().int().nonnegative(),
});

// ---------------------------------------------------------------------------
// Films / metadata (shared catalog rows referenced by this profile's data)
// ---------------------------------------------------------------------------

export const backupFilmSchema = z.object({
  id: idSchema,
  title: z.string().trim().min(1).max(500),
  releaseYear: z.number().int().min(0).max(3000).nullable(),
  letterboxdSlug: nullableBoundedString(300),
  letterboxdUri: nullableBoundedString(2000),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const backupFilmMetadataSchema = z.object({
  id: idSchema,
  filmId: idSchema,
  provider: z.string().trim().min(1).max(100),
  posterUrl: nullableBoundedString(2000),
  runtimeMinutes: z.number().int().nonnegative().nullable(),
  genres: stringArraySchema,
  directors: stringArraySchema,
  countries: stringArraySchema,
  languages: stringArraySchema,
  collectionId: nullableBoundedString(200),
  collectionName: nullableBoundedString(300),
  collectionOrder: z.number().int().nullable(),
  averageRating: z.number().min(0).max(10).nullable(),
  popularity: z.number().nullable(),
  watchCount: z.number().int().nonnegative().nullable(),
  fansCount: z.number().int().nonnegative().nullable(),
  listAppearances: z.number().int().nonnegative().nullable(),
  externalIds: jsonObjectSchema.nullable(),
  raw: jsonObjectSchema.nullable(),
  // Optional — a backup exported before this field existed has no such
  // key at all, and must still validate; `resolveMatchMethod()` (see
  // `src/domain/metadata/match-method.ts`) is what actually falls back to
  // "automatic" for a missing or invalid value wherever this is READ, not
  // this schema.
  matchMethod: z.enum(["automatic", "manual"]).optional(),
  lastEnrichedAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const backupUnresolvedMetadataSchema = z.object({
  id: idSchema,
  filmId: idSchema,
  provider: z.string().trim().min(1).max(100),
  status: z.enum(["unresolved", "failed"]),
  reason: z.string().trim().min(1).max(100),
  message: z.string().trim().min(1).max(500),
  lastAttemptedAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

// ---------------------------------------------------------------------------
// Watchlist
// ---------------------------------------------------------------------------

export const backupWatchlistEntrySchema = z.object({
  id: idSchema,
  profileId: idSchema,
  filmId: idSchema,
  dateAdded: isoCalendarDateSchema,
  position: z.number().int().nullable(),
  isActive: z.boolean(),
  selectionWeight: z.number().nonnegative(),
  importSource: importSourceSchema.nullable(),
  importId: nullableIdSchema,
  removedAt: nullableIsoDateTimeSchema,
  removedReason: watchlistRemovalReasonSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const backupWatchlistImportSchema = z.object({
  id: idSchema,
  profileId: idSchema,
  source: importSourceSchema,
  status: importStatusSchema,
  rawFilename: nullableBoundedString(300),
  filmsImported: z.number().int().nonnegative(),
  filmsUpdated: z.number().int().nonnegative(),
  duplicatesSkipped: z.number().int().nonnegative(),
  enrichmentFailures: z.number().int().nonnegative(),
  unresolvedCount: z.number().int().nonnegative(),
  errorMessage: nullableBoundedString(2000),
  startedAt: isoDateTimeSchema,
  completedAt: nullableIsoDateTimeSchema,
  createdAt: isoDateTimeSchema,
});

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export const backupWatchedHistorySchema = z.object({
  id: idSchema,
  profileId: idSchema,
  filmId: idSchema,
  watchlistEntryId: nullableIdSchema,
  source: watchedHistorySourceSchema,
  watchedDate: nullableIsoCalendarDateSchema,
  createdAt: isoDateTimeSchema,
});

export const backupUserRatingSchema = z.object({
  id: idSchema,
  profileId: idSchema,
  filmId: idSchema,
  rating: z.number().min(0).max(5),
  source: z.string().trim().min(1).max(100),
  ratedAt: nullableIsoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

// ---------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------

export const backupDraftSchema = z.object({
  id: idSchema,
  profileId: idSchema,
  difficulty: draftDifficultySchema,
  timeMode: draftTimeModeSchema,
  status: draftStatusSchema,
  totalFilms: z.number().int().nonnegative(),
  randomFilmCount: z.number().int().nonnegative(),
  challengeFilmCount: z.number().int().nonnegative(),
  challengeMode: draftChallengeModeSchema,
  startedAt: isoDateTimeSchema,
  deadlineAt: isoDateTimeSchema,
  timezone: z.string().trim().min(1).max(100),
  completedAt: nullableIsoDateTimeSchema,
  freeformAchievedRank: freeformRankSchema,
  // A backup exported before v1.0.2 has no such key at all — defaults to
  // `null`, the same "use the generated default name" every draft already
  // had (see `src/domain/drafts/draft-name.ts`).
  customName: nullableBoundedString(200).default(null),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const backupDraftItemSchema = z.object({
  id: idSchema,
  draftId: idSchema,
  filmId: idSchema,
  watchlistEntryId: nullableIdSchema,
  source: draftItemSourceSchema,
  challengeId: nullableBoundedString(200),
  challengeAttemptId: nullableIdSchema,
  challengeDisplayValue: jsonObjectSchema.nullable(),
  orderIndex: z.number().int().nonnegative(),
  isCompleted: z.boolean(),
  completedAt: nullableIsoDateTimeSchema,
  watchedHistoryId: nullableIdSchema,
  // Both default to `null` — a backup exported before v1.0.2 has neither
  // key at all, meaning this item's film has never been substituted (see
  // docs/updates, "SELECTION PROVENANCE").
  originFilmId: nullableIdSchema.default(null),
  substitutionReason: draftItemSubstitutionReasonSchema
    .nullable()
    .default(null),
  createdAt: isoDateTimeSchema,
});

export const backupDraftChallengeAttemptSchema = z.object({
  id: idSchema,
  draftId: idSchema,
  challengeId: z.string().trim().min(1).max(200),
  attemptNumber: z.number().int().positive(),
  status: challengeAttemptStatusSchema,
  reason: nullableBoundedString(500),
  candidateFilmId: nullableIdSchema,
  createdAt: isoDateTimeSchema,
});

export const backupDraftChallengeInteractionSchema = z.object({
  id: idSchema,
  draftId: idSchema,
  challengeId: z.string().trim().min(1).max(200),
  status: challengeInteractionStatusSchema,
  state: jsonObjectSchema,
  resultingWatchlistEntryId: nullableIdSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const backupDraftPostmortemResponseSchema = z.object({
  id: idSchema,
  draftId: idSchema,
  draftItemId: idSchema,
  response: postmortemResponseTypeSchema,
  appliedAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
});

export const backupSelectionWeightAdjustmentSchema = z.object({
  id: idSchema,
  watchlistEntryId: idSchema,
  draftPostmortemResponseId: nullableIdSchema,
  delta: z.number(),
  reason: z.string().trim().min(1).max(200),
  createdAt: isoDateTimeSchema,
});

export const backupSettingsEntrySchema = z.object({
  key: z.string().trim().min(1).max(200),
  value: jsonValueSchema,
});

// ---------------------------------------------------------------------------
// The manifest + top-level v1 backup
// ---------------------------------------------------------------------------

export const backupManifestSchema = z.object({
  format: z.literal(BACKUP_FORMAT_MARKER),
  formatVersion: z.number().int().positive(),
  exportedAt: isoDateTimeSchema,
  appVersion: z.string().trim().min(1).max(50),
});
export type BackupManifest = z.infer<typeof backupManifestSchema>;

/** A reasonable ceiling on how many rows of any one kind a single backup may contain — see docs/product-spec.md, "SECURITY / ROBUSTNESS": "Apply practical file-size limits and clear errors." A real personal watchlist/draft history will never come close; this exists to bound how much work a hostile or corrupted file can make the parser do. */
const MAX_ROWS_PER_COLLECTION = 200_000;
const boundedArray = <T extends z.ZodTypeAny>(schema: T) =>
  z.array(schema).max(MAX_ROWS_PER_COLLECTION);

export const backupV1Schema = z.object({
  manifest: backupManifestSchema.extend({ formatVersion: z.literal(1) }),
  profile: backupProfileSchema,
  films: boundedArray(backupFilmSchema),
  filmMetadata: boundedArray(backupFilmMetadataSchema),
  watchlistEntries: boundedArray(backupWatchlistEntrySchema),
  watchlistImports: boundedArray(backupWatchlistImportSchema),
  watchedHistory: boundedArray(backupWatchedHistorySchema),
  userRatings: boundedArray(backupUserRatingSchema),
  drafts: boundedArray(backupDraftSchema),
  draftItems: boundedArray(backupDraftItemSchema),
  draftChallengeAttempts: boundedArray(backupDraftChallengeAttemptSchema),
  draftChallengeInteractions: boundedArray(
    backupDraftChallengeInteractionSchema,
  ),
  draftPostmortemResponses: boundedArray(backupDraftPostmortemResponseSchema),
  selectionWeightAdjustments: boundedArray(
    backupSelectionWeightAdjustmentSchema,
  ),
  settings: boundedArray(backupSettingsEntrySchema),
  // Optional — a backup exported before "UNRESOLVED METADATA RESOLUTION"
  // existed has no such key at all, and must still validate; every
  // reader treats a missing key the same as an empty list (there was
  // nothing unresolved to restore from that older export).
  unresolvedMetadata: boundedArray(backupUnresolvedMetadataSchema).optional(),
});
export type BackupV1 = z.infer<typeof backupV1Schema>;

/** Just enough to decide "is this even an FDraft backup, and which version" before spending effort on full validation — see docs/product-spec.md, "IMPORT UX": "Validate the manifest... Determine backup version" as its own step before "Validate the schema." */
export const rawManifestProbeSchema = z.object({
  manifest: z.object({
    format: z.string(),
    formatVersion: z.number(),
  }),
});
