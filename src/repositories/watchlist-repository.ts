import type { WatchlistEntryRecord, WatchlistImportRecord } from "./records";

/**
 * A profile's watchlist entries and import history (see
 * docs/product-spec.md, "CORE DATA MODEL", "LETTERBOXD IMPORT"). Every
 * method is scoped by an explicit `profileId` parameter — never an implicit
 * "current user" — so the boundary that used to be Postgres RLS is instead
 * enforced by always querying/writing through this profileId, and is
 * exactly what the cross-profile isolation tests exercise directly against
 * the local implementation.
 */
export interface WatchlistRepository {
  listActiveEntries(profileId: string): Promise<WatchlistEntryRecord[]>;
  listAllEntries(profileId: string): Promise<WatchlistEntryRecord[]>;
  getEntryById(
    profileId: string,
    entryId: string,
  ): Promise<WatchlistEntryRecord | null>;
  findActiveEntryByFilmId(
    profileId: string,
    filmId: string,
  ): Promise<WatchlistEntryRecord | null>;
  createEntry(entry: WatchlistEntryRecord): Promise<void>;
  updateEntry(entry: WatchlistEntryRecord): Promise<void>;

  createImport(record: WatchlistImportRecord): Promise<void>;
  updateImport(record: WatchlistImportRecord): Promise<void>;
  listImports(profileId: string): Promise<WatchlistImportRecord[]>;
  getLatestCompletedImport(
    profileId: string,
  ): Promise<WatchlistImportRecord | null>;
}
