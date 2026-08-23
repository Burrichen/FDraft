import type { EventManifestFilm } from "@/domain/events/event-manifest-schema";
import { defaultIdGenerator, type IdGenerator } from "@/domain/shared/id";
import { SystemClock, type Clock } from "@/domain/time/clock";
import type { FilmRepository } from "@/repositories/film-repository";
import type { FilmRecord } from "@/repositories/records";

export interface ResolveOrCreateHalloweenFilmsResult {
  /** Every entry's resolved local `FilmRecord.id`, deduplicated. */
  resolvedFilmIds: string[];
  /** The subset of `resolvedFilmIds` that didn't exist locally before this call and were just created — the caller (`halloween-manifest-service.ts`) uses this to enrich ONLY genuinely new films, never re-enriching an already-resolved one on every refresh. */
  newlyCreatedFilmIds: string[];
}

/**
 * Turns Halloween manifest entries (the `horror`/`kitsch` arrays — see
 * `halloween-manifest-schema.ts`) into real local `FilmRecord`s, creating
 * one when no match exists — see docs/updates, "PROMPT 19 — HALLOWEEN
 * DRAFT MECHANICS" §7, "CUSTOM EVENT FILMS". This is the one genuinely new
 * piece January's own `resolve-manifest-film-ids.ts` deliberately doesn't
 * do (it only ever resolves an existing film, "a manifest entry with no
 * matching local film simply contributes nothing") — Halloween's Horror/
 * Kitsch pools must work even for a title nobody has ever imported,
 * without ever touching anyone's Letterboxd watchlist.
 *
 * Match order per entry, first hit wins — identical to
 * `resolveOneManifestFilmId`: `tmdbId` (via `findMetadataByExternalId`),
 * then `letterboxdSlug`, then `title`+`year`. On a miss, creates a new
 * `FilmRecord` using the exact same shape `local-import-service.ts`'s
 * `resolveFilmId` uses for a new import row (title/releaseYear from the
 * entry, `letterboxdSlug` from the entry if present else `null`,
 * `letterboxdUri: null`) — never fabricates metadata beyond what the
 * manifest itself supplies. Metadata enrichment (via the real provider,
 * when online) is a separate, later step — see `halloween-manifest-service.ts`.
 */
export async function resolveOrCreateHalloweenManifestFilms(
  repos: { films: FilmRepository },
  entries: EventManifestFilm[],
  deps: { idGenerator?: IdGenerator; clock?: Clock } = {},
): Promise<ResolveOrCreateHalloweenFilmsResult> {
  const idGenerator = deps.idGenerator ?? defaultIdGenerator;
  const clock = deps.clock ?? new SystemClock();
  const now = clock.now().toISOString();

  const resolved = new Set<string>();
  const newlyCreated: string[] = [];

  for (const entry of entries) {
    const existingId = await resolveExistingHalloweenFilmId(repos, entry);
    if (existingId) {
      resolved.add(existingId);
      continue;
    }
    const film: FilmRecord = {
      id: idGenerator.generate(),
      title: entry.title,
      releaseYear: entry.year ?? null,
      letterboxdSlug: entry.letterboxdSlug ?? null,
      letterboxdUri: null,
      createdAt: now,
      updatedAt: now,
    };
    await repos.films.create(film);
    resolved.add(film.id);
    newlyCreated.push(film.id);
  }

  return { resolvedFilmIds: [...resolved], newlyCreatedFilmIds: newlyCreated };
}

async function resolveExistingHalloweenFilmId(
  repos: { films: FilmRepository },
  entry: EventManifestFilm,
): Promise<string | null> {
  if (entry.tmdbId) {
    const metadata = await repos.films.findMetadataByExternalId(
      "tmdb",
      entry.tmdbId,
    );
    if (metadata) {
      return metadata.filmId;
    }
  }
  if (entry.letterboxdSlug) {
    const film = await repos.films.findByLetterboxdSlug(entry.letterboxdSlug);
    if (film) {
      return film.id;
    }
  }
  const film = await repos.films.findByTitleAndYear(
    entry.title,
    entry.year ?? null,
  );
  return film?.id ?? null;
}
