import type { FilmRepository } from "@/repositories/film-repository";
import type { FilmMetadataRecord, FilmRecord } from "@/repositories/records";
import type { FDraftLocalDatabase } from "./database";

export class LocalFilmRepository implements FilmRepository {
  constructor(private readonly db: FDraftLocalDatabase) {}

  async getById(id: string): Promise<FilmRecord | null> {
    const film = await this.db.films.get(id);
    return film ?? null;
  }

  async findByLetterboxdSlug(slug: string): Promise<FilmRecord | null> {
    const film = await this.db.films
      .where("letterboxdSlug")
      .equals(slug)
      .first();
    return film ?? null;
  }

  async findByTitleAndYear(
    title: string,
    releaseYear: number | null,
  ): Promise<FilmRecord | null> {
    // Dexie compound indexes require every key part to be present, and
    // `releaseYear` is nullable here (see src/domain/import/film-key.ts —
    // this is the slug-less fallback path), so this falls back to a full
    // scan rather than the `[title+releaseYear]` index when there's no year.
    if (releaseYear === null) {
      const lowerTitle = title.toLowerCase();
      const films = await this.db.films
        .filter(
          (film) =>
            film.releaseYear === null &&
            film.title.toLowerCase() === lowerTitle,
        )
        .toArray();
      return films[0] ?? null;
    }
    const film = await this.db.films
      .where("[title+releaseYear]")
      .equals([title, releaseYear])
      .first();
    return film ?? null;
  }

  async create(film: FilmRecord): Promise<void> {
    await this.db.films.add(film);
  }

  async update(film: FilmRecord): Promise<void> {
    await this.db.films.put(film);
  }

  async getMetadataForFilm(filmId: string): Promise<FilmMetadataRecord[]> {
    return this.db.filmMetadata.where("filmId").equals(filmId).toArray();
  }

  async getMetadataForFilms(
    filmIds: string[],
  ): Promise<Map<string, FilmMetadataRecord[]>> {
    if (filmIds.length === 0) {
      return new Map();
    }
    const rows = await this.db.filmMetadata
      .where("filmId")
      .anyOf(filmIds)
      .toArray();
    const byFilmId = new Map<string, FilmMetadataRecord[]>();
    for (const row of rows) {
      const existing = byFilmId.get(row.filmId);
      if (existing) {
        existing.push(row);
      } else {
        byFilmId.set(row.filmId, [row]);
      }
    }
    return byFilmId;
  }

  async upsertMetadata(metadata: FilmMetadataRecord): Promise<void> {
    const existing = await this.db.filmMetadata
      .where("[filmId+provider]")
      .equals([metadata.filmId, metadata.provider])
      .first();
    await this.db.filmMetadata.put(
      existing ? { ...metadata, id: existing.id } : metadata,
    );
  }

  async findMetadataByExternalId(
    provider: string,
    externalId: string,
  ): Promise<FilmMetadataRecord | null> {
    // Neither `provider` alone nor `externalIds` (a free-form JSON object)
    // is an indexed Dexie field, so this is a full-table scan — fine
    // here: it only ever runs on the rare, human-initiated "Use This
    // Film" action, never in the bulk enrichment queue's hot path.
    const match = await this.db.filmMetadata
      .filter(
        (row) =>
          row.provider === provider &&
          row.externalIds?.[provider] === externalId,
      )
      .first();
    return match ?? null;
  }
}
