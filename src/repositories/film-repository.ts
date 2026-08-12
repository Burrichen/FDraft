import type { FilmMetadataRecord, FilmRecord } from "./records";

/**
 * Films and their enrichment metadata (see docs/product-spec.md, "DATA
 * PROVIDER RULE" and "CORE DATA MODEL"). Kept profile-agnostic — a film
 * like a specific movie is the same regardless of which local profile
 * references it, mirroring the original shared `films`/`film_metadata`
 * catalog design — but unlike the Supabase version there is no
 * admin-vs-user-scoped client distinction to worry about, since it's all
 * one local database.
 */
export interface FilmRepository {
  getById(id: string): Promise<FilmRecord | null>;
  findByLetterboxdSlug(slug: string): Promise<FilmRecord | null>;
  /** Heuristic fallback lookup for identities with no Letterboxd URI (see `src/domain/import/film-key.ts`). */
  findByTitleAndYear(
    title: string,
    releaseYear: number | null,
  ): Promise<FilmRecord | null>;
  create(film: FilmRecord): Promise<void>;
  update(film: FilmRecord): Promise<void>;

  getMetadataForFilm(filmId: string): Promise<FilmMetadataRecord[]>;
  getMetadataForFilms(
    filmIds: string[],
  ): Promise<Map<string, FilmMetadataRecord[]>>;
  upsertMetadata(metadata: FilmMetadataRecord): Promise<void>;
  /** For the manual-match "provider_identifier_conflict" safety check (see docs/product-spec.md, "METADATA MATCHER AUDIT") — is this exact provider film already attached to a DIFFERENT local film? */
  findMetadataByExternalId(
    provider: string,
    externalId: string,
  ): Promise<FilmMetadataRecord | null>;
}
