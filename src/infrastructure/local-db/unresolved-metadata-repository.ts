import type { UnresolvedMetadataRepository } from "@/repositories/unresolved-metadata-repository";
import type { UnresolvedMetadataRecord } from "@/repositories/records";
import type { FDraftLocalDatabase } from "./database";

export class LocalUnresolvedMetadataRepository implements UnresolvedMetadataRepository {
  constructor(private readonly db: FDraftLocalDatabase) {}

  async listAll(): Promise<UnresolvedMetadataRecord[]> {
    return this.db.unresolvedMetadata.toArray();
  }

  async getByFilmId(filmId: string): Promise<UnresolvedMetadataRecord | null> {
    const record = await this.db.unresolvedMetadata
      .where("filmId")
      .equals(filmId)
      .first();
    return record ?? null;
  }

  async upsert(record: UnresolvedMetadataRecord): Promise<void> {
    const existing = await this.db.unresolvedMetadata
      .where("filmId")
      .equals(record.filmId)
      .first();
    await this.db.unresolvedMetadata.put(
      existing ? { ...record, id: existing.id } : record,
    );
  }

  async deleteByFilmId(filmId: string): Promise<void> {
    await this.db.unresolvedMetadata.where("filmId").equals(filmId).delete();
  }
}
