import type { BackupV1 } from "./backup-schema";

/**
 * Referential integrity checks a schema alone can't express — see
 * docs/product-spec.md, "SECURITY / ROBUSTNESS": "Validate... relationship
 * references." Zod already guarantees every field has the right *type*
 * (a film id is a non-empty string, a status is one of the known enum
 * values, ...); this catches a structurally valid but internally
 * inconsistent backup — a draft item pointing at a film that isn't in
 * `films`, for instance — which `zod` has no way to express on its own
 * since it validates each record in isolation, not the collection as a
 * whole. A backup failing this check is treated as corrupted, exactly
 * like one failing schema validation — see `parseAndMigrateBackup` and
 * how the import pipeline chains the two.
 */
export interface BackupIntegrityError {
  collection: string;
  recordId: string;
  message: string;
}

export type BackupIntegrityResult =
  { ok: true } | { ok: false; errors: BackupIntegrityError[] };

export function validateBackupReferentialIntegrity(
  backup: BackupV1,
): BackupIntegrityResult {
  const errors: BackupIntegrityError[] = [];

  const filmIds = new Set(backup.films.map((film) => film.id));
  const watchlistEntryIds = new Set(
    backup.watchlistEntries.map((entry) => entry.id),
  );
  const watchlistImportIds = new Set(
    backup.watchlistImports.map((record) => record.id),
  );
  const draftIds = new Set(backup.drafts.map((draft) => draft.id));
  const draftItemIds = new Set(backup.draftItems.map((item) => item.id));
  const draftChallengeAttemptIds = new Set(
    backup.draftChallengeAttempts.map((attempt) => attempt.id),
  );
  const watchedHistoryIds = new Set(
    backup.watchedHistory.map((record) => record.id),
  );

  function checkFilmRef(collection: string, recordId: string, filmId: string) {
    if (!filmIds.has(filmId)) {
      errors.push({
        collection,
        recordId,
        message: `references film "${filmId}", which is not present in this backup's films.`,
      });
    }
  }
  function checkProfileRef(
    collection: string,
    recordId: string,
    profileId: string,
  ) {
    if (profileId !== backup.profile.id) {
      errors.push({
        collection,
        recordId,
        message: `belongs to profile "${profileId}", which does not match this backup's own profile "${backup.profile.id}".`,
      });
    }
  }
  function checkDraftRef(
    collection: string,
    recordId: string,
    draftId: string,
  ) {
    if (!draftIds.has(draftId)) {
      errors.push({
        collection,
        recordId,
        message: `references draft "${draftId}", which is not present in this backup's drafts.`,
      });
    }
  }

  for (const metadata of backup.filmMetadata) {
    checkFilmRef("filmMetadata", metadata.id, metadata.filmId);
  }
  for (const entry of backup.watchlistEntries) {
    checkProfileRef("watchlistEntries", entry.id, entry.profileId);
    checkFilmRef("watchlistEntries", entry.id, entry.filmId);
    if (entry.importId && !watchlistImportIds.has(entry.importId)) {
      errors.push({
        collection: "watchlistEntries",
        recordId: entry.id,
        message: `references import "${entry.importId}", which is not present in this backup's watchlistImports.`,
      });
    }
  }
  for (const record of backup.watchlistImports) {
    checkProfileRef("watchlistImports", record.id, record.profileId);
  }
  for (const record of backup.watchedHistory) {
    checkProfileRef("watchedHistory", record.id, record.profileId);
    checkFilmRef("watchedHistory", record.id, record.filmId);
    if (
      record.watchlistEntryId &&
      !watchlistEntryIds.has(record.watchlistEntryId)
    ) {
      errors.push({
        collection: "watchedHistory",
        recordId: record.id,
        message: `references watchlist entry "${record.watchlistEntryId}", which is not present in this backup.`,
      });
    }
  }
  for (const record of backup.userRatings) {
    checkProfileRef("userRatings", record.id, record.profileId);
    checkFilmRef("userRatings", record.id, record.filmId);
  }
  for (const draft of backup.drafts) {
    checkProfileRef("drafts", draft.id, draft.profileId);
  }
  for (const item of backup.draftItems) {
    checkDraftRef("draftItems", item.id, item.draftId);
    checkFilmRef("draftItems", item.id, item.filmId);
    if (
      item.watchlistEntryId &&
      !watchlistEntryIds.has(item.watchlistEntryId)
    ) {
      errors.push({
        collection: "draftItems",
        recordId: item.id,
        message: `references watchlist entry "${item.watchlistEntryId}", which is not present in this backup.`,
      });
    }
    if (
      item.watchedHistoryId &&
      !watchedHistoryIds.has(item.watchedHistoryId)
    ) {
      errors.push({
        collection: "draftItems",
        recordId: item.id,
        message: `references watched history "${item.watchedHistoryId}", which is not present in this backup.`,
      });
    }
    if (
      item.challengeAttemptId &&
      !draftChallengeAttemptIds.has(item.challengeAttemptId)
    ) {
      errors.push({
        collection: "draftItems",
        recordId: item.id,
        message: `references challenge attempt "${item.challengeAttemptId}", which is not present in this backup.`,
      });
    }
  }
  for (const attempt of backup.draftChallengeAttempts) {
    checkDraftRef("draftChallengeAttempts", attempt.id, attempt.draftId);
  }
  for (const interaction of backup.draftChallengeInteractions) {
    checkDraftRef(
      "draftChallengeInteractions",
      interaction.id,
      interaction.draftId,
    );
  }
  for (const response of backup.draftPostmortemResponses) {
    checkDraftRef("draftPostmortemResponses", response.id, response.draftId);
    if (!draftItemIds.has(response.draftItemId)) {
      errors.push({
        collection: "draftPostmortemResponses",
        recordId: response.id,
        message: `references draft item "${response.draftItemId}", which is not present in this backup.`,
      });
    }
  }
  for (const adjustment of backup.selectionWeightAdjustments) {
    if (!watchlistEntryIds.has(adjustment.watchlistEntryId)) {
      errors.push({
        collection: "selectionWeightAdjustments",
        recordId: adjustment.id,
        message: `references watchlist entry "${adjustment.watchlistEntryId}", which is not present in this backup.`,
      });
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
