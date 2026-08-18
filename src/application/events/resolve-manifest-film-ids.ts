import type { EventManifest, EventManifestFilm } from "@/domain/events/event-manifest-schema";
import type { FilmRepository } from "@/repositories/film-repository";

/**
 * Turns a manifest's film entries into actual local `FilmRecord.id`s (see
 * docs/updates, "GLOBAL CURATED JANUARY LIST" — "prefer stable provider
 * ids ... permit a fallback identity"). A manifest entry with no matching
 * local film simply contributes nothing — this never imports/creates a
 * film or touches anyone's watchlist (see "WHITELIST MATCHING": "do not
 * automatically add globally curated movies to someone's personal
 * watchlist"); it only ever resolves an id that
 * `EventEligibilityRules.curatedFilmIds` can later be additive with,
 * which itself only matters for a film already on a profile's own active
 * watchlist (see `resolveEligibleCandidates`).
 *
 * Match order per entry, first hit wins: TMDB id (the project's one real
 * provider — see `src/domain/import/providers/tmdb-provider.ts`) via
 * `findMetadataByExternalId`, then Letterboxd slug, then title+year. Never
 * throws — a malformed or non-matching entry is just skipped.
 */
export async function resolveManifestFilmIds(
  repos: { films: FilmRepository },
  manifest: EventManifest,
): Promise<string[]> {
  const resolved = new Set<string>();
  for (const entry of manifest.films) {
    const filmId = await resolveOneManifestFilmId(repos, entry);
    if (filmId) {
      resolved.add(filmId);
    }
  }
  return [...resolved];
}

async function resolveOneManifestFilmId(
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
