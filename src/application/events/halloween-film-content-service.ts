import { retryMetadataForFilms } from "@/application/metadata/local-metadata-service";
import { findCrossCategoryDuplicates } from "@/domain/events/event-film-content-schema";
import { HALLOWEEN_FILM_CONTENT } from "@/domain/events/event-film-content";
import { setHalloweenManifestFilmIds } from "@/domain/events/halloween-manifest-overlay";
import type { FilmRepository } from "@/repositories/film-repository";
import type { UnresolvedMetadataRepository } from "@/repositories/unresolved-metadata-repository";
import { resolveOrCreateHalloweenManifestFilms } from "./resolve-or-create-halloween-films";

/**
 * The one place Halloween's static Horror/Kitsch content
 * (`public/events/halloween/films.json`, see docs/updates, "STATIC EVENT
 * FILM CONTENT PACKS") gets turned into the resolved local film ids
 * `createHalloweenLocalDraft` reads (see `halloween-manifest-overlay.ts`)
 * — replaces the old `refreshHalloweenManifest`'s remote fetch/cache/
 * staleness dance entirely: there is nothing left to fetch, so this is
 * just "resolve-or-create every entry, enrich whatever was just created."
 * Still async (resolving/creating local `FilmRecord`s is a real IndexedDB
 * round trip) and still never throws — an enrichment failure (offline,
 * rate-limited, etc.) is swallowed here exactly as before, so a newly
 * created film simply keeps its bare title/year identity until enrichment
 * eventually succeeds, and this can never be what breaks app startup.
 */
export async function loadHalloweenFilmContent(deps: {
  films: FilmRepository;
  unresolvedMetadata: UnresolvedMetadataRepository;
}): Promise<void> {
  const duplicates = findCrossCategoryDuplicates({
    horror: HALLOWEEN_FILM_CONTENT.horror,
    kitsch: HALLOWEEN_FILM_CONTENT.kitsch,
  });
  for (const duplicate of duplicates) {
    // Never removed from either list (see `findCrossCategoryDuplicates`'s
    // own doc comment) — draft generation's own cross-pool exclusion
    // already guarantees this film is never drawn twice into the same
    // Draft regardless. This is purely a heads-up for whoever authored
    // `films.json`.
    console.warn(
      `Halloween film "${duplicate.entry.title} (${duplicate.entry.year})" appears in more than one category: ${duplicate.categories.join(", ")}.`,
    );
  }

  // Sequential, deliberately NOT `Promise.all` — a film listed (almost
  // certainly by accident, see the duplicate warning above) in BOTH
  // categories must resolve to the exact same local `FilmRecord`, not two
  // separate ones. Running both resolve-or-create passes concurrently
  // raced them: each would independently see "no local match yet" and
  // create its own new film, leaving two distinct records for what's
  // really one film — silently defeating the Draft generator's own
  // dedup-by-id cross-pool exclusion (see docs/updates, "STATIC EVENT
  // FILM CONTENT PACKS" §8/§18). Awaiting horror fully before kitsch
  // starts means kitsch's own lookup already finds whatever horror just
  // created.
  const horror = await resolveOrCreateHalloweenManifestFilms(
    { films: deps.films },
    HALLOWEEN_FILM_CONTENT.horror,
  );
  const kitsch = await resolveOrCreateHalloweenManifestFilms(
    { films: deps.films },
    HALLOWEEN_FILM_CONTENT.kitsch,
  );
  setHalloweenManifestFilmIds({
    horrorFilmIds: horror.resolvedFilmIds,
    kitschFilmIds: kitsch.resolvedFilmIds,
  });

  const newlyCreatedFilmIds = [
    ...horror.newlyCreatedFilmIds,
    ...kitsch.newlyCreatedFilmIds,
  ];
  if (newlyCreatedFilmIds.length > 0) {
    try {
      await retryMetadataForFilms(
        { films: deps.films, unresolvedMetadata: deps.unresolvedMetadata },
        newlyCreatedFilmIds,
      );
    } catch {
      // Enrichment is best-effort — a network/provider failure here must
      // never fail content loading itself (see doc comment above).
    }
  }
}
