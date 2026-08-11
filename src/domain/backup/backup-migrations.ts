import {
  BACKUP_FORMAT_MARKER,
  backupV1Schema,
  rawManifestProbeSchema,
  type BackupV1,
} from "./backup-schema";

/**
 * Backup version migration framework (see docs/product-spec.md, "BACKUP
 * VERSION MIGRATIONS" — Prompt 9.5C: "Set up the migration framework now
 * even if only v1 exists today... Do NOT simply reject all older backups
 * whenever the schema changes."). Mirrors the exact shape
 * `src/infrastructure/local-db/schema.ts` already established for the
 * local database itself: one ordered list of migration steps, a derived
 * "current version" constant, and a runner that walks forward from
 * whatever version a file claims to the current one.
 *
 * `CURRENT_BACKUP_FORMAT_VERSION` is the only thing that changes when a
 * future phase needs a v2: add a `{ fromVersion: 1, toVersion: 2, migrate
 * }` entry to `BACKUP_MIGRATIONS`, define `backupV2Schema`, and update
 * `finalValidation` below to validate against the new current schema
 * after migrating. Never edit an already-shipped migration step.
 */

export interface BackupMigrationStep {
  fromVersion: number;
  toVersion: number;
  /** Transforms a validated vN backup's raw shape into the v(N+1) shape. Pure — no I/O. */
  migrate: (data: Record<string, unknown>) => Record<string, unknown>;
}

/** Only v1 exists today — this list is where v1→v2, v2→v3, etc. steps get appended in the future, never edited in place. */
export const BACKUP_MIGRATIONS: BackupMigrationStep[] = [];

export const CURRENT_BACKUP_FORMAT_VERSION = 1;

export type MigrationChainResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: "invalid_schema"; message: string };

/**
 * Walks a chain of migration steps forward from `fromVersion` to
 * `toVersion`, applying each one in sequence. Extracted from
 * `parseAndMigrateBackup` and exported specifically so the mechanism can
 * be tested against a synthetic migration chain independent of whatever
 * real steps exist for the actual backup format at any given time — the
 * same reasoning `schema.test.ts` used for the local database's own
 * migration runner in Phase 9.5B.
 */
export function runMigrationChain(
  data: Record<string, unknown>,
  fromVersion: number,
  toVersion: number,
  migrations: BackupMigrationStep[],
): MigrationChainResult {
  let current = data;
  let version = fromVersion;
  while (version < toVersion) {
    const step = migrations.find(
      (candidate) => candidate.fromVersion === version,
    );
    if (!step) {
      return {
        ok: false,
        error: "invalid_schema",
        message: `No migration path exists from backup version ${version} to version ${toVersion}.`,
      };
    }
    try {
      current = step.migrate(current);
    } catch (cause) {
      return {
        ok: false,
        error: "invalid_schema",
        message:
          cause instanceof Error
            ? `Migration failed: ${cause.message}`
            : "Migration failed for an unknown reason.",
      };
    }
    version = step.toVersion;
  }
  return { ok: true, data: current };
}

export type ParseBackupErrorCode =
  | "invalid_json"
  | "not_an_object"
  | "missing_manifest"
  | "wrong_format"
  | "unsupported_newer_version"
  | "invalid_schema"
  | "file_too_large";

export type ParseBackupResult =
  | { ok: true; backup: BackupV1 }
  | { ok: false; error: ParseBackupErrorCode; message: string };

/** See docs/product-spec.md, "SECURITY / ROBUSTNESS" — "Apply practical file-size limits." A genuine personal backup, even a large one, is a few MB of JSON; this is generous headroom, not a tight fit. */
export const MAX_BACKUP_FILE_SIZE_BYTES = 100 * 1024 * 1024;

/**
 * The one entry point for turning untrusted file text into a validated,
 * current-version `BackupV1` — or a typed, user-facing error. Every step
 * in docs/product-spec.md's "IMPORT UX" list happens here, in order:
 * "Read the file [caller's job] -> Validate the manifest -> Validate the
 * schema -> Determine backup version -> Check whether migrations are
 * required."
 */
export function parseAndMigrateBackup(rawText: string): ParseBackupResult {
  if (rawText.length > MAX_BACKUP_FILE_SIZE_BYTES) {
    return {
      ok: false,
      error: "file_too_large",
      message: `This file is larger than FDraft backups are expected to be (over ${Math.round(MAX_BACKUP_FILE_SIZE_BYTES / (1024 * 1024))}MB). It may not be a real FDraft backup.`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return {
      ok: false,
      error: "invalid_json",
      message:
        "This file isn't valid JSON — it may be corrupted or not an FDraft backup at all.",
    };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      ok: false,
      error: "not_an_object",
      message: "This file doesn't look like an FDraft backup.",
    };
  }

  const manifestProbe = rawManifestProbeSchema.safeParse(parsed);
  if (!manifestProbe.success) {
    return {
      ok: false,
      error: "missing_manifest",
      message: "This file has no recognizable FDraft backup manifest.",
    };
  }
  if (manifestProbe.data.manifest.format !== BACKUP_FORMAT_MARKER) {
    return {
      ok: false,
      error: "wrong_format",
      message: "This file isn't an FDraft backup (unrecognized format marker).",
    };
  }

  const declaredVersion = manifestProbe.data.manifest.formatVersion;
  if (declaredVersion > CURRENT_BACKUP_FORMAT_VERSION) {
    return {
      ok: false,
      error: "unsupported_newer_version",
      message:
        "This backup was created by a newer version of FDraft. Update FDraft before importing it.",
    };
  }

  const chainResult = runMigrationChain(
    parsed as Record<string, unknown>,
    declaredVersion,
    CURRENT_BACKUP_FORMAT_VERSION,
    BACKUP_MIGRATIONS,
  );
  if (!chainResult.ok) {
    return chainResult;
  }

  const finalResult = backupV1Schema.safeParse(chainResult.data);
  if (!finalResult.success) {
    return {
      ok: false,
      error: "invalid_schema",
      message:
        "This backup's contents don't match the expected format — it may be corrupted.",
    };
  }

  return { ok: true, backup: finalResult.data };
}
