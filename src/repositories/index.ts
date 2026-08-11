import type { BackupRestoreRepository } from "./backup-restore-repository";
import type { DataErasureRepository } from "./data-erasure-repository";
import type { DraftRepository } from "./draft-repository";
import type { FilmRepository } from "./film-repository";
import type { HistoryRepository } from "./history-repository";
import type { ProfileRepository } from "./profile-repository";
import type { SettingsRepository } from "./settings-repository";
import type { WatchlistRepository } from "./watchlist-repository";

export type {
  ChallengeAttemptStatus,
  ChallengeInteractionStatus,
  DraftChallengeAttemptRecord,
  DraftChallengeInteractionRecord,
  DraftChallengeMode,
  DraftDifficulty,
  DraftItemRecord,
  DraftItemSource,
  DraftPostmortemResponseRecord,
  DraftRecord,
  DraftStatus,
  DraftTimeMode,
  FilmMetadataRecord,
  FilmRecord,
  FreeformRank,
  ImportSource,
  ImportStatus,
  PostmortemResponseType,
  SelectionWeightAdjustmentRecord,
  UserRatingRecord,
  WatchedHistoryRecord,
  WatchedHistorySource,
  WatchlistEntryRecord,
  WatchlistImportRecord,
  WatchlistRemovalReason,
} from "./records";
export type {
  BackupImportDeps,
  BackupImportResult,
  BackupRestoreRepository,
} from "./backup-restore-repository";
export type { DataErasureRepository } from "./data-erasure-repository";
export type { DraftRepository } from "./draft-repository";
export type { FilmRepository } from "./film-repository";
export type { HistoryRepository } from "./history-repository";
export type { ProfileRepository } from "./profile-repository";
export type { SettingsRepository } from "./settings-repository";
export type { WatchlistRepository } from "./watchlist-repository";

/**
 * The full set of repositories an application service needs. Application
 * services (`src/application/**`) take this bag as a constructor/function
 * parameter rather than importing any concrete implementation directly —
 * the one rule that actually makes "swap local storage for sync later
 * without rewriting the draft/challenge engine" possible.
 */
export interface Repositories {
  profiles: ProfileRepository;
  films: FilmRepository;
  watchlist: WatchlistRepository;
  drafts: DraftRepository;
  history: HistoryRepository;
  settings: SettingsRepository;
  dataErasure: DataErasureRepository;
  backupRestore: BackupRestoreRepository;
}
