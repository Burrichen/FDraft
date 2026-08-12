import type { BackupV1 } from "@/domain/backup/backup-schema";
import { resolveMatchMethod } from "@/domain/metadata/match-method";
import { resolveDefaultPage } from "@/domain/profiles/default-page";
import type { LocalProfile } from "@/domain/profiles/profile";
import { resolveProfileTimezone } from "@/domain/profiles/timezone";
import type {
  BackupImportDeps,
  BackupImportResult,
  BackupRestoreRepository,
} from "@/repositories/backup-restore-repository";
import type {
  DraftChallengeAttemptRecord,
  DraftChallengeInteractionRecord,
  DraftItemRecord,
  DraftPostmortemResponseRecord,
  DraftRecord,
  FilmMetadataRecord,
  FilmRecord,
  SelectionWeightAdjustmentRecord,
  UnresolvedMetadataRecord,
  UserRatingRecord,
  WatchedHistoryRecord,
  WatchlistEntryRecord,
  WatchlistImportRecord,
} from "@/repositories/records";
import { LocalDataErasureRepository } from "./data-erasure-repository";
import type { FDraftLocalDatabase, SettingsRow } from "./database";

/**
 * Local (Dexie) implementation of `BackupRestoreRepository` — see that
 * interface for the full rationale. Both entry points wrap the entire
 * restore in one `db.transaction("rw", ...)`: if anything throws partway
 * through (a `put`/`add` failure, a storage quota error, ...), Dexie rolls
 * the whole transaction back, so the previous local data is left exactly
 * as it was (see docs/product-spec.md, "TRANSACTIONAL RESTORE").
 * `replaceProfile` reuses `LocalDataErasureRepository` for its erase step —
 * Dexie reuses the enclosing transaction for a nested `db.transaction()`
 * call as long as the inner call's tables are a subset of the outer one's,
 * which they are here, so the erase and the restore commit or roll back
 * together as a single unit.
 */
export class LocalBackupRestoreRepository implements BackupRestoreRepository {
  constructor(private readonly db: FDraftLocalDatabase) {}

  private restoreTables() {
    return [
      this.db.profiles,
      this.db.films,
      this.db.filmMetadata,
      this.db.watchlistEntries,
      this.db.watchlistImports,
      this.db.watchedHistory,
      this.db.userRatings,
      this.db.drafts,
      this.db.draftItems,
      this.db.draftChallengeAttempts,
      this.db.draftChallengeInteractions,
      this.db.draftPostmortemResponses,
      this.db.selectionWeightAdjustments,
      this.db.settings,
      this.db.unresolvedMetadata,
    ];
  }

  async importAsNewProfile(
    backup: BackupV1,
    deps: BackupImportDeps,
  ): Promise<BackupImportResult> {
    const targetProfileId = deps.idGenerator.generate();
    await this.db.transaction("rw", this.restoreTables(), async () => {
      await this.writeRemappedBackup(backup, targetProfileId, deps);
    });
    return { profileId: targetProfileId };
  }

  async replaceProfile(
    existingProfileId: string,
    backup: BackupV1,
    deps: BackupImportDeps,
  ): Promise<BackupImportResult> {
    await this.db.transaction("rw", this.restoreTables(), async () => {
      await new LocalDataErasureRepository(this.db).eraseProfileCompletely(
        existingProfileId,
      );
      await this.writeRemappedBackup(backup, existingProfileId, deps);
    });
    return { profileId: existingProfileId };
  }

  /**
   * Writes every record in `backup` under `targetProfileId`, with every
   * profile-owned id freshly regenerated and every internal reference
   * remapped alongside it. Films/metadata are the exception — deduplicated
   * against the existing shared local catalog rather than reinserted (see
   * the interface doc comment).
   */
  private async writeRemappedBackup(
    backup: BackupV1,
    targetProfileId: string,
    deps: BackupImportDeps,
  ): Promise<void> {
    const { idGenerator, clock, currentSchemaVersion } = deps;

    const filmIdMap = new Map<string, string>();
    for (const film of backup.films) {
      const existing = film.letterboxdSlug
        ? await this.db.films
            .where("letterboxdSlug")
            .equals(film.letterboxdSlug)
            .first()
        : await this.findFilmByTitleAndYear(film.title, film.releaseYear);
      if (existing) {
        filmIdMap.set(film.id, existing.id);
        continue;
      }
      const newId = idGenerator.generate();
      filmIdMap.set(film.id, newId);
      const record: FilmRecord = { ...film, id: newId };
      await this.db.films.add(record);
    }

    for (const metadata of backup.filmMetadata) {
      const newFilmId = filmIdMap.get(metadata.filmId);
      // Referential integrity is validated before this repository is ever
      // called (see `parseAndMigrateBackup` / `validateBackupReferentialIntegrity`
      // in the import application service) — this can't happen in practice,
      // but skipping rather than throwing keeps this pass defensive either way.
      if (!newFilmId) continue;
      await this.upsertMetadataIfMissing({
        ...metadata,
        id: idGenerator.generate(),
        filmId: newFilmId,
        matchMethod: resolveMatchMethod(metadata.matchMethod),
      });
    }

    // Optional — see `backupV1Schema`'s own doc comment: a backup exported
    // before this existed simply has nothing to restore here.
    for (const unresolved of backup.unresolvedMetadata ?? []) {
      const newFilmId = filmIdMap.get(unresolved.filmId);
      if (!newFilmId) continue;
      await this.upsertUnresolvedMetadataIfMissing({
        ...unresolved,
        id: idGenerator.generate(),
        filmId: newFilmId,
      });
    }

    const watchlistImportIdMap = new Map(
      backup.watchlistImports.map((record) => [
        record.id,
        idGenerator.generate(),
      ]),
    );
    const watchlistEntryIdMap = new Map(
      backup.watchlistEntries.map((entry) => [
        entry.id,
        idGenerator.generate(),
      ]),
    );
    const watchedHistoryIdMap = new Map(
      backup.watchedHistory.map((record) => [
        record.id,
        idGenerator.generate(),
      ]),
    );
    const draftIdMap = new Map(
      backup.drafts.map((draft) => [draft.id, idGenerator.generate()]),
    );
    const draftItemIdMap = new Map(
      backup.draftItems.map((item) => [item.id, idGenerator.generate()]),
    );
    const draftChallengeAttemptIdMap = new Map(
      backup.draftChallengeAttempts.map((attempt) => [
        attempt.id,
        idGenerator.generate(),
      ]),
    );
    const draftPostmortemResponseIdMap = new Map(
      backup.draftPostmortemResponses.map((response) => [
        response.id,
        idGenerator.generate(),
      ]),
    );

    const profile: LocalProfile = {
      id: targetProfileId,
      displayName: backup.profile.displayName,
      createdAt: backup.profile.createdAt,
      lastOpenedAt: clock.now().toISOString(),
      // A hand-edited or corrupted backup could carry an unrecognized
      // timezone string — `resolveProfileTimezone` falls back to this
      // device's own current timezone rather than letting an invalid
      // zone silently break Calendar Mode deadlines or crash "mark
      // watched" the first time this profile's timezone is actually used
      // (see docs/product-spec.md, "COMPLETE PRODUCT AUDIT").
      timezone: resolveProfileTimezone(backup.profile.timezone),
      // A backup exported before "DEFAULT START PAGE SETTING" existed has
      // no `defaultPage` at all — `resolveDefaultPage` is what falls that
      // back to Watchlist, the same normalization every other reader of
      // this setting goes through, rather than restoring `undefined` into
      // a field the rest of the app assumes is always a real `DefaultPage`.
      settings: {
        ...backup.profile.settings,
        defaultPage: resolveDefaultPage(backup.profile.settings.defaultPage),
      },
      dataVersion: currentSchemaVersion,
    };
    await this.db.profiles.add(profile);

    for (const record of backup.watchlistImports) {
      const mapped: WatchlistImportRecord = {
        ...record,
        id: watchlistImportIdMap.get(record.id)!,
        profileId: targetProfileId,
      };
      await this.db.watchlistImports.add(mapped);
    }

    for (const entry of backup.watchlistEntries) {
      const mapped: WatchlistEntryRecord = {
        ...entry,
        id: watchlistEntryIdMap.get(entry.id)!,
        profileId: targetProfileId,
        filmId: filmIdMap.get(entry.filmId)!,
        importId: entry.importId
          ? (watchlistImportIdMap.get(entry.importId) ?? null)
          : null,
      };
      await this.db.watchlistEntries.add(mapped);
    }

    for (const record of backup.watchedHistory) {
      const mapped: WatchedHistoryRecord = {
        ...record,
        id: watchedHistoryIdMap.get(record.id)!,
        profileId: targetProfileId,
        filmId: filmIdMap.get(record.filmId)!,
        watchlistEntryId: record.watchlistEntryId
          ? (watchlistEntryIdMap.get(record.watchlistEntryId) ?? null)
          : null,
      };
      await this.db.watchedHistory.add(mapped);
    }

    for (const rating of backup.userRatings) {
      const mapped: UserRatingRecord = {
        ...rating,
        id: idGenerator.generate(),
        profileId: targetProfileId,
        filmId: filmIdMap.get(rating.filmId)!,
      };
      await this.db.userRatings.add(mapped);
    }

    for (const draft of backup.drafts) {
      const mapped: DraftRecord = {
        ...draft,
        id: draftIdMap.get(draft.id)!,
        profileId: targetProfileId,
      };
      await this.db.drafts.add(mapped);
    }

    for (const item of backup.draftItems) {
      const mapped: DraftItemRecord = {
        ...item,
        id: draftItemIdMap.get(item.id)!,
        draftId: draftIdMap.get(item.draftId)!,
        filmId: filmIdMap.get(item.filmId)!,
        watchlistEntryId: item.watchlistEntryId
          ? (watchlistEntryIdMap.get(item.watchlistEntryId) ?? null)
          : null,
        challengeAttemptId: item.challengeAttemptId
          ? (draftChallengeAttemptIdMap.get(item.challengeAttemptId) ?? null)
          : null,
        watchedHistoryId: item.watchedHistoryId
          ? (watchedHistoryIdMap.get(item.watchedHistoryId) ?? null)
          : null,
      };
      await this.db.draftItems.add(mapped);
    }

    for (const attempt of backup.draftChallengeAttempts) {
      const mapped: DraftChallengeAttemptRecord = {
        ...attempt,
        id: draftChallengeAttemptIdMap.get(attempt.id)!,
        draftId: draftIdMap.get(attempt.draftId)!,
        candidateFilmId: attempt.candidateFilmId
          ? (filmIdMap.get(attempt.candidateFilmId) ?? null)
          : null,
      };
      await this.db.draftChallengeAttempts.add(mapped);
    }

    for (const interaction of backup.draftChallengeInteractions) {
      const mapped: DraftChallengeInteractionRecord = {
        ...interaction,
        id: idGenerator.generate(),
        draftId: draftIdMap.get(interaction.draftId)!,
        resultingWatchlistEntryId: interaction.resultingWatchlistEntryId
          ? (watchlistEntryIdMap.get(interaction.resultingWatchlistEntryId) ??
            null)
          : null,
      };
      await this.db.draftChallengeInteractions.add(mapped);
    }

    for (const response of backup.draftPostmortemResponses) {
      const mapped: DraftPostmortemResponseRecord = {
        ...response,
        id: draftPostmortemResponseIdMap.get(response.id)!,
        draftId: draftIdMap.get(response.draftId)!,
        draftItemId: draftItemIdMap.get(response.draftItemId)!,
      };
      await this.db.draftPostmortemResponses.add(mapped);
    }

    for (const adjustment of backup.selectionWeightAdjustments) {
      const mapped: SelectionWeightAdjustmentRecord = {
        ...adjustment,
        id: idGenerator.generate(),
        watchlistEntryId: watchlistEntryIdMap.get(adjustment.watchlistEntryId)!,
        draftPostmortemResponseId: adjustment.draftPostmortemResponseId
          ? (draftPostmortemResponseIdMap.get(
              adjustment.draftPostmortemResponseId,
            ) ?? null)
          : null,
      };
      await this.db.selectionWeightAdjustments.add(mapped);
    }

    for (const entry of backup.settings) {
      const row: SettingsRow = {
        profileId: targetProfileId,
        key: entry.key,
        value: entry.value,
      };
      await this.db.settings.put(row);
    }
  }

  private async findFilmByTitleAndYear(
    title: string,
    releaseYear: number | null,
  ): Promise<FilmRecord | undefined> {
    if (releaseYear === null) {
      const lowerTitle = title.toLowerCase();
      return this.db.films
        .filter(
          (film) =>
            film.releaseYear === null &&
            film.title.toLowerCase() === lowerTitle,
        )
        .first();
    }
    return this.db.films
      .where("[title+releaseYear]")
      .equals([title, releaseYear])
      .first();
  }

  /** Unlike `LocalFilmRepository.upsertMetadata`, this never overwrites an existing row — the shared catalog's own enrichment data (possibly fresher than whatever an imported backup happened to capture) always wins over a restored one for the same film+provider pair. */
  private async upsertMetadataIfMissing(
    metadata: FilmMetadataRecord,
  ): Promise<void> {
    const existing = await this.db.filmMetadata
      .where("[filmId+provider]")
      .equals([metadata.filmId, metadata.provider])
      .first();
    if (existing) {
      return;
    }
    await this.db.filmMetadata.add(metadata);
  }

  /**
   * Same "existing shared catalog state always wins" rule as
   * `upsertMetadataIfMissing` — if this device already knows this film is
   * matched (or already has its own unresolved record), the restored one
   * never overwrites it. Checking `filmMetadata` too (not just
   * `unresolvedMetadata`) is what actually makes the "already matched"
   * half of that guarantee true — a device that matched a film AFTER a
   * now-restored backup was taken elsewhere must not have it reappear as
   * unresolved (see docs/product-spec.md, "COMPLETE PRODUCT AUDIT").
   */
  private async upsertUnresolvedMetadataIfMissing(
    record: UnresolvedMetadataRecord,
  ): Promise<void> {
    const alreadyMatched = await this.db.filmMetadata
      .where("filmId")
      .equals(record.filmId)
      .first();
    if (alreadyMatched) {
      return;
    }
    const existing = await this.db.unresolvedMetadata
      .where("filmId")
      .equals(record.filmId)
      .first();
    if (existing) {
      return;
    }
    await this.db.unresolvedMetadata.add(record);
  }
}
