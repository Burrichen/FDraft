import { buildProfileBackup } from "@/application/backup/export-backup";
import { validateBackupReferentialIntegrity } from "@/domain/backup/backup-integrity";
import {
  parseAndMigrateBackup,
  type ParseBackupErrorCode,
} from "@/domain/backup/backup-migrations";
import type { BackupV1 } from "@/domain/backup/backup-schema";
import type { IdGenerator } from "@/domain/shared/id";
import type { Clock } from "@/domain/time/clock";
import type { Repositories } from "@/repositories";

/**
 * A human-scannable digest of a backup file, shown to the user before they
 * commit to importing it (see docs/product-spec.md, "IMPORT UX" — Prompt
 * 9.5C: "Show a summary. Example: 'FDraft Backup Found / Profile: Alex /
 * Exported: 11 August 2026 / Watchlist: 1,243 / Watched films: 621 /
 * Drafts: 18'"). Formatting the date and pluralizing counts is a UI
 * concern; this only surfaces the raw numbers and the ISO timestamp.
 */
export interface BackupSummary {
  displayName: string;
  exportedAt: string;
  appVersion: string;
  watchlistCount: number;
  watchedFilmsCount: number;
  draftsCount: number;
}

export type PreviewBackupError =
  | { code: ParseBackupErrorCode; message: string }
  | { code: "integrity_error"; message: string };

export type PreviewBackupResult =
  | { ok: true; backup: BackupV1; summary: BackupSummary }
  | ({ ok: false } & PreviewBackupError);

function summarize(backup: BackupV1): BackupSummary {
  return {
    displayName: backup.profile.displayName,
    exportedAt: backup.manifest.exportedAt,
    appVersion: backup.manifest.appVersion,
    watchlistCount: backup.watchlistEntries.length,
    watchedFilmsCount: backup.watchedHistory.length,
    draftsCount: backup.drafts.length,
  };
}

/**
 * The read-only first half of an import (see docs/product-spec.md, "IMPORT
 * UX": "Before modifying existing data: Read the file. Validate the
 * manifest. Validate the schema. Determine backup version. Check whether
 * migrations are required. Show a summary."). Never touches the database —
 * safe to call speculatively the moment a file is chosen, before the user
 * has picked an import mode. `parseAndMigrateBackup` handles the
 * format/version/schema pipeline; this adds the one check it can't do on
 * its own (a single record's shape can be valid while the collection as a
 * whole is internally inconsistent — see `validateBackupReferentialIntegrity`).
 */
export function previewBackupFile(rawText: string): PreviewBackupResult {
  const parsed = parseAndMigrateBackup(rawText);
  if (!parsed.ok) {
    return { ok: false, code: parsed.error, message: parsed.message };
  }

  const integrity = validateBackupReferentialIntegrity(parsed.backup);
  if (!integrity.ok) {
    return {
      ok: false,
      code: "integrity_error",
      message: `This backup contains ${integrity.errors.length} inconsistent internal reference(s) and cannot be safely imported.`,
    };
  }

  return { ok: true, backup: parsed.backup, summary: summarize(parsed.backup) };
}

export type BackupImportMode = "new_profile" | "replace_profile";

export interface CommitBackupImportParams {
  backup: BackupV1;
  mode: BackupImportMode;
  /** Required, and only meaningful, when `mode` is `"replace_profile"` — the local profile being overwritten. */
  targetProfileId?: string;
}

export interface CommitBackupImportResult {
  profileId: string;
  /**
   * Only present for `"replace_profile"` — a complete backup of the
   * profile exactly as it was immediately before being overwritten (see
   * docs/product-spec.md, "IMPORT MODES": "Before replacing: consider
   * automatically creating a safety backup of the existing profile. If
   * practical, do so."). Building it is cheap (pure reads, same as any
   * export) and always done for a destructive replace; what happens to it
   * — prompting a download, discarding it — is the caller's decision, not
   * this function's.
   */
  safetyBackup?: BackupV1;
}

/**
 * The destructive second half of an import — only ever called after
 * `previewBackupFile` has succeeded and the user has confirmed a mode (see
 * docs/product-spec.md, "IMPORT MODES", "TRANSACTIONAL RESTORE"). All the
 * actual atomicity guarantees live in `BackupRestoreRepository`'s local
 * implementation; this function is just the thin orchestration layer that
 * picks which repository method to call and, for a replace, captures the
 * safety backup first.
 */
export async function commitBackupImport(
  repos: Repositories,
  params: CommitBackupImportParams,
  deps: {
    idGenerator: IdGenerator;
    clock: Clock;
    currentSchemaVersion: number;
  },
): Promise<CommitBackupImportResult> {
  if (params.mode === "new_profile") {
    const result = await repos.backupRestore.importAsNewProfile(
      params.backup,
      deps,
    );
    return { profileId: result.profileId };
  }

  if (!params.targetProfileId) {
    throw new Error("Replacing a profile requires a targetProfileId.");
  }

  const safetyBackup = await buildProfileBackup(repos, params.targetProfileId, {
    clock: deps.clock,
  });
  const result = await repos.backupRestore.replaceProfile(
    params.targetProfileId,
    params.backup,
    deps,
  );
  return { profileId: result.profileId, safetyBackup };
}
