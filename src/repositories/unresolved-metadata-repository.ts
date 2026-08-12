import type { UnresolvedMetadataRecord } from "./records";

/**
 * Keyed by `filmId` alone (a unique index — see `schema.ts` version 3):
 * there is only ever one configured metadata provider active at a time,
 * so "is this film resolved" is a per-film question, not a
 * per-(film, provider) one. `provider` lives on the record as an
 * informational field, never as part of its identity — see
 * docs/product-spec.md, "COMPLETE PRODUCT AUDIT" for the bug this fixed
 * (a film could otherwise accumulate multiple stuck rows across
 * providers, only one of which a later match would ever clear).
 */
export interface UnresolvedMetadataRepository {
  listAll(): Promise<UnresolvedMetadataRecord[]>;
  getByFilmId(filmId: string): Promise<UnresolvedMetadataRecord | null>;
  /** Looked up by `filmId`, same idempotency shape as `FilmRepository.upsertMetadata` — preserves the existing row's `id` when one already exists rather than creating a duplicate. */
  upsert(record: UnresolvedMetadataRecord): Promise<void>;
  deleteByFilmId(filmId: string): Promise<void>;
}
