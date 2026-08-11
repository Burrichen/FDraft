import type { BackupV1 } from "@/domain/backup/backup-schema";
import type { IdGenerator } from "@/domain/shared/id";
import type { Clock } from "@/domain/time/clock";

export interface BackupImportDeps {
  idGenerator: IdGenerator;
  clock: Clock;
  /** The schema version imported data should be stamped with — see `src/domain/profiles/profile.ts`'s `CreateProfileParams.currentSchemaVersion` for the identical rationale: imported data is being written under today's schema, not whatever schema the exporting device happened to be on. */
  currentSchemaVersion: number;
}

export interface BackupImportResult {
  profileId: string;
}

/**
 * Restoring a backup (see docs/product-spec.md, "TRANSACTIONAL RESTORE" —
 * Prompt 9.5C) spans every table a profile owns, exactly like
 * `DataErasureRepository`, and for the same reason: it must be atomic. A
 * malformed backup, an unsupported version, or a storage failure partway
 * through must never leave the active local profile half-replaced — see
 * `parseAndMigrateBackup` and `validateBackupReferentialIntegrity`, which
 * the import application service runs to completion *before* ever calling
 * into this repository, so everything reaching here is already known-valid.
 *
 * Every profile-owned record id in the backup is regenerated fresh on
 * import, in BOTH modes below — never reused as-is. Profiles are isolated
 * by `profileId` filtering within one shared IndexedDB database (see
 * docs/product-spec.md, "LOCAL DATABASE"), not by separate databases per
 * profile, so a backup's original ids could collide with unrelated rows
 * already belonging to a completely different local profile on this
 * device. Internal relationships (a draft item's `watchlistEntryId`, a
 * postmortem response's `draftItemId`, ...) are preserved by remapping
 * every reference through the same id substitution, not by trusting the
 * original ids to still mean anything.
 *
 * Films and film metadata are the one exception: they're a shared,
 * profile-agnostic catalog (see docs/product-spec.md, "CORE DATA MODEL"),
 * so importing a backup deduplicates its films against whatever already
 * exists in the local catalog (by Letterboxd slug, falling back to
 * title+year) rather than always inserting fresh rows — see the local
 * implementation's film-dedup logic.
 */
export interface BackupRestoreRepository {
  /**
   * Imports the backup as a brand-new, separate local profile — the
   * default, non-destructive import mode (see docs/product-spec.md, "IMPORT
   * MODES"). Never touches any existing profile's data.
   */
  importAsNewProfile(
    backup: BackupV1,
    deps: BackupImportDeps,
  ): Promise<BackupImportResult>;

  /**
   * Replaces an existing local profile's entire data set with the
   * backup's, reusing `existingProfileId` as the resulting profile's id
   * (see docs/product-spec.md, "IMPORT MODES" — "Replace Existing
   * Profile"). Destructive: every record `existingProfileId` currently
   * owns is erased first, in the same atomic transaction as the restore,
   * so a failure partway through leaves the original data completely
   * intact rather than partially erased. Does NOT create a safety backup
   * of the profile being replaced — that is an application-service-level
   * decision (see `src/application/backup/import-backup.ts`), made before
   * this method is ever called.
   */
  replaceProfile(
    existingProfileId: string,
    backup: BackupV1,
    deps: BackupImportDeps,
  ): Promise<BackupImportResult>;
}
