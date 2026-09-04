import type { EventFilmEntry } from "@/domain/events/event-film-content-schema";
import { defaultIdGenerator, type IdGenerator } from "@/domain/shared/id";
import { SystemClock, type Clock } from "@/domain/time/clock";
import type { FilmRepository } from "@/repositories/film-repository";
import type { FilmRecord } from "@/repositories/records";

export interface ResolveOrCreateHalloweenFilmsResult {
  /** Every entry's resolved local `FilmRecord.id`, deduplicated. */
  resolvedFilmIds: string[];
  /** The subset of `resolvedFilmIds` that didn't exist locally before this call and were just created — the caller (`halloween-film-content-service.ts`) uses this to enrich ONLY genuinely new films, never re-enriching an already-resolved one on every load. */
  newlyCreatedFilmIds: string[];
}

/**
 * Turns Halloween's static curated categories (the `horror`/`kitsch`
 * arrays — see `event-film-content-schema.ts`) into real local
 * `FilmRecord`s, creating one when no match exists (see docs/updates,
 * "STATIC EVENT FILM CONTENT PACKS", and the earlier "PROMPT 19 —
 * HALLOWEEN DRAFT MECHANICS" §7, "CUSTOM EVENT FILMS"). This is the one
 * genuinely different thing January's own `resolveManifestFilmIds`
 * deliberately doesn't do (it only ever resolves an EXISTING film, "an
 * entry with no matching local film simply contributes nothing") —
 * Halloween's Horror/Kitsch pools must work even for a title nobody has
 * ever imported, without ever touching anyone's Letterboxd watchlist.
 *
 * Title+year is the entry's entire identity now (see
 * `eventFilmEntrySchema`) — an exact, case-insensitive title match plus
 * an exact year match (`FilmRepository.findByTitleAndYear`), deliberately
 * never fuzzy. On a miss, creates a new `FilmRecord` using the exact same
 * shape `local-import-service.ts`'s `resolveFilmId` uses for a new import
 * row (title/releaseYear from the entry, `letterboxdSlug`/`letterboxdUri:
 * null` — a curated entry never carries either) — never fabricates
 * metadata beyond what the entry itself supplies. Metadata enrichment
 * (via the real provider, when online) is a separate, later step — see
 * `halloween-film-content-service.ts`.
 */
export async function resolveOrCreateHalloweenManifestFilms(
  repos: { films: FilmRepository },
  entries: EventFilmEntry[],
  deps: { idGenerator?: IdGenerator; clock?: Clock } = {},
): Promise<ResolveOrCreateHalloweenFilmsResult> {
  const idGenerator = deps.idGenerator ?? defaultIdGenerator;
  const clock = deps.clock ?? new SystemClock();
  const now = clock.now().toISOString();

  const resolved = new Set<string>();
  const newlyCreated: string[] = [];

  for (const entry of entries) {
    const existing = await repos.films.findByTitleAndYear(
      entry.title,
      entry.year,
    );
    if (existing) {
      resolved.add(existing.id);
      continue;
    }
    const film: FilmRecord = {
      id: idGenerator.generate(),
      title: entry.title,
      releaseYear: entry.year,
      letterboxdSlug: null,
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
