import type { WatchlistRepository } from "@/repositories/watchlist-repository";
import type {
  WatchlistEntryRecord,
  WatchlistImportRecord,
} from "@/repositories/records";
import type { FDraftLocalDatabase } from "./database";

export class LocalWatchlistRepository implements WatchlistRepository {
  constructor(private readonly db: FDraftLocalDatabase) {}

  async listActiveEntries(profileId: string): Promise<WatchlistEntryRecord[]> {
    // `isActive` can't be part of an IndexedDB index key (see schema.ts) —
    // filter in JS after the indexed profileId lookup instead.
    return this.db.watchlistEntries
      .where("profileId")
      .equals(profileId)
      .and((entry) => entry.isActive)
      .toArray();
  }

  async listAllEntries(profileId: string): Promise<WatchlistEntryRecord[]> {
    return this.db.watchlistEntries
      .where("profileId")
      .equals(profileId)
      .toArray();
  }

  async getEntryById(
    profileId: string,
    entryId: string,
  ): Promise<WatchlistEntryRecord | null> {
    const entry = await this.db.watchlistEntries.get(entryId);
    return entry && entry.profileId === profileId ? entry : null;
  }

  async findActiveEntryByFilmId(
    profileId: string,
    filmId: string,
  ): Promise<WatchlistEntryRecord | null> {
    const entry = await this.db.watchlistEntries
      .where("[profileId+filmId]")
      .equals([profileId, filmId])
      .and((e) => e.isActive)
      .first();
    return entry ?? null;
  }

  async createEntry(entry: WatchlistEntryRecord): Promise<void> {
    await this.db.watchlistEntries.add(entry);
  }

  async updateEntry(entry: WatchlistEntryRecord): Promise<void> {
    await this.db.watchlistEntries.put(entry);
  }

  async createImport(record: WatchlistImportRecord): Promise<void> {
    await this.db.watchlistImports.add(record);
  }

  async updateImport(record: WatchlistImportRecord): Promise<void> {
    await this.db.watchlistImports.put(record);
  }

  async listImports(profileId: string): Promise<WatchlistImportRecord[]> {
    return this.db.watchlistImports
      .where("profileId")
      .equals(profileId)
      .toArray();
  }

  async getLatestCompletedImport(
    profileId: string,
  ): Promise<WatchlistImportRecord | null> {
    const imports = await this.db.watchlistImports
      .where("profileId")
      .equals(profileId)
      .and(
        (record) =>
          record.status === "completed" && record.completedAt !== null,
      )
      .toArray();
    if (imports.length === 0) {
      return null;
    }
    imports.sort((a, b) =>
      (b.completedAt ?? "").localeCompare(a.completedAt ?? ""),
    );
    return imports[0];
  }
}
