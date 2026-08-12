import type { UnresolvedMetadataRecord } from "./records";

export interface UnresolvedMetadataRepository {
  listAll(): Promise<UnresolvedMetadataRecord[]>;
  getByFilmId(
    filmId: string,
    provider: string,
  ): Promise<UnresolvedMetadataRecord | null>;
  /** Looked up by `[filmId+provider]`, same idempotency shape as `FilmRepository.upsertMetadata` — preserves the existing row's `id` when one already exists rather than creating a duplicate. */
  upsert(record: UnresolvedMetadataRecord): Promise<void>;
  deleteByFilmId(filmId: string, provider: string): Promise<void>;
}
