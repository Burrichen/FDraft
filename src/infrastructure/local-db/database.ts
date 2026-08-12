import Dexie, { type Table } from "dexie";
import type { LocalProfile } from "@/domain/profiles/profile";
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
import { applySchema } from "./schema";

/** Storage row for `SettingsRepository` — `[profileId+key]` is the Dexie primary key, so `value` is whatever JSON-serializable payload the caller stored. */
export interface SettingsRow {
  profileId: string;
  key: string;
  value: unknown;
}

/**
 * The local IndexedDB database (see docs/product-spec.md, "LOCAL DATABASE",
 * Prompt 9.5A). This is the ONLY file in the application, besides the
 * repository implementations right next to it, that imports Dexie —
 * everything above `src/infrastructure/local-db` talks to the
 * `Repositories` interface bag (`src/repositories/index.ts`) instead.
 *
 * One instance is meant to live for the lifetime of the app (see
 * `create-local-repositories.ts`), backing every profile on this
 * installation — profile isolation is enforced by always filtering on
 * `profileId`, not by using a separate database per profile.
 */
export class FDraftLocalDatabase extends Dexie {
  profiles!: Table<LocalProfile, string>;
  films!: Table<FilmRecord, string>;
  filmMetadata!: Table<FilmMetadataRecord, string>;
  watchlistEntries!: Table<WatchlistEntryRecord, string>;
  watchlistImports!: Table<WatchlistImportRecord, string>;
  watchedHistory!: Table<WatchedHistoryRecord, string>;
  userRatings!: Table<UserRatingRecord, string>;
  drafts!: Table<DraftRecord, string>;
  draftItems!: Table<DraftItemRecord, string>;
  draftChallengeAttempts!: Table<DraftChallengeAttemptRecord, string>;
  draftChallengeInteractions!: Table<DraftChallengeInteractionRecord, string>;
  draftPostmortemResponses!: Table<DraftPostmortemResponseRecord, string>;
  selectionWeightAdjustments!: Table<SelectionWeightAdjustmentRecord, string>;
  settings!: Table<SettingsRow, [string, string]>;
  unresolvedMetadata!: Table<UnresolvedMetadataRecord, string>;

  constructor(name = "fdraft") {
    super(name);
    applySchema(this);
  }
}
