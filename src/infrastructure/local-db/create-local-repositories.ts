import type { Repositories } from "@/repositories";
import { LocalBackupRestoreRepository } from "./backup-restore-repository";
import { LocalDataErasureRepository } from "./data-erasure-repository";
import { FDraftLocalDatabase } from "./database";
import { LocalDraftRepository } from "./draft-repository";
import { LocalFilmRepository } from "./film-repository";
import { LocalHistoryRepository } from "./history-repository";
import { LocalProfileRepository } from "./profile-repository";
import { LocalSettingsRepository } from "./settings-repository";
import { LocalUnresolvedMetadataRepository } from "./unresolved-metadata-repository";
import { LocalWatchlistRepository } from "./watchlist-repository";

/**
 * Wires one `FDraftLocalDatabase` instance to every local repository
 * implementation. This is the single place in the app that knows the
 * concrete (Dexie/IndexedDB) storage engine — application services import
 * this factory's return type (`Repositories`, from `src/repositories`)
 * only, never the concrete classes, which is what makes it possible to
 * later add a `createRemoteRepositories()`/`createSyncedRepositories()`
 * with the exact same shape.
 */
export function createLocalRepositories(
  db: FDraftLocalDatabase = new FDraftLocalDatabase(),
): Repositories {
  return {
    profiles: new LocalProfileRepository(db),
    films: new LocalFilmRepository(db),
    watchlist: new LocalWatchlistRepository(db),
    drafts: new LocalDraftRepository(db),
    history: new LocalHistoryRepository(db),
    settings: new LocalSettingsRepository(db),
    dataErasure: new LocalDataErasureRepository(db),
    backupRestore: new LocalBackupRestoreRepository(db),
    unresolvedMetadata: new LocalUnresolvedMetadataRepository(db),
  };
}
