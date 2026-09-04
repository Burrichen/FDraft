import { JANUARY_FILM_CONTENT } from "@/domain/events/event-film-content";
import { setJanuaryManifestCuratedFilmIds } from "@/domain/events/january-manifest-overlay";
import type { FilmRepository } from "@/repositories/film-repository";
import { resolveManifestFilmIds } from "./resolve-manifest-film-ids";

/**
 * The one place January's static curated list
 * (`public/events/january/films.json`, see docs/updates, "STATIC EVENT
 * FILM CONTENT PACKS") gets resolved into the local film ids
 * `EventEligibilityRules.curatedFilmIds` reads (see
 * `january-manifest-overlay.ts`) — replaces the old
 * `refreshJanuaryManifest`'s remote fetch/cache/staleness dance entirely.
 * Resolve-only, same as before: a curated title with no local match
 * simply contributes nothing (see `resolveManifestFilmIds`'s own doc
 * comment) — January's list never creates a film or touches anyone's
 * watchlist, unlike Halloween's pools.
 */
export async function loadJanuaryFilmContent(deps: {
  films: FilmRepository;
}): Promise<void> {
  const curatedFilmIds = await resolveManifestFilmIds(
    { films: deps.films },
    JANUARY_FILM_CONTENT.curated,
  );
  setJanuaryManifestCuratedFilmIds(curatedFilmIds);
}
