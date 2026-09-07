import { retryMetadataForFilms } from "@/application/metadata/local-metadata-service";
import {
  findCrossCategoryDuplicates,
  type EventFilmEntry,
} from "@/domain/events/event-film-content-schema";
import { setEventCategoryFilmIds } from "@/domain/events/event-category-manifest-overlay";
import type { FilmRepository } from "@/repositories/film-repository";
import type { UnresolvedMetadataRepository } from "@/repositories/unresolved-metadata-repository";
import { resolveOrCreateHalloweenManifestFilms } from "./resolve-or-create-halloween-films";

/**
 * Generic version of `halloween-film-content-service.ts`'s
 * `loadHalloweenFilmContent`, parameterized by event id and its categories
 * (see docs/updates, "FDRAFT UPDATE 1 — EVENT ONE AT A TIME DRAFTING") —
 * used by Christmas today, and any future category-based event, so this
 * exists once rather than once per event. Halloween itself keeps using its
 * own OLDER, separate pipeline (`loadHalloweenFilmContent`, still called
 * from `app-shell.tsx` for the pre-existing bulk-generation flow); the new
 * generic `event-category-manifest-overlay.ts` is populated for Halloween
 * by copying that pipeline's already-resolved ids directly (see
 * `app-shell.tsx`), never by running a second, redundant resolve-or-create
 * pass over the same `films.json`.
 *
 * `resolveOrCreateHalloweenManifestFilms` is reused verbatim despite its
 * name — its implementation only ever takes a plain `EventFilmEntry[]`, it
 * has no Halloween-specific logic at all (confirmed by reading it in
 * full — title+year resolve-or-create against `FilmRepository`, nothing
 * else).
 */
export async function loadEventCategoryFilmContent(
  eventId: string,
  categories: Record<string, EventFilmEntry[]>,
  deps: {
    films: FilmRepository;
    unresolvedMetadata: UnresolvedMetadataRepository;
  },
): Promise<void> {
  const duplicates = findCrossCategoryDuplicates(categories);
  for (const duplicate of duplicates) {
    // Never removed from either category (see `findCrossCategoryDuplicates`'s
    // own doc comment) — the Challenge/random candidate union's own
    // first-declared-category-wins provenance rule already guarantees this
    // film is never double-counted. Purely a heads-up for whoever authored
    // this event's `films.json`.
    console.warn(
      `${eventId} film "${duplicate.entry.title} (${duplicate.entry.year})" appears in more than one category: ${duplicate.categories.join(", ")}.`,
    );
  }

  // Sequential, deliberately NOT `Promise.all` — same reasoning as
  // `loadHalloweenFilmContent`: a film listed in more than one category
  // must resolve to the exact same local `FilmRecord`, never two separate
  // ones created by a race between concurrent resolve-or-create passes.
  const resolvedByCategory: Record<string, string[]> = {};
  const newlyCreatedFilmIds: string[] = [];
  for (const [categoryKey, entries] of Object.entries(categories)) {
    const result = await resolveOrCreateHalloweenManifestFilms(
      { films: deps.films },
      entries,
    );
    resolvedByCategory[categoryKey] = result.resolvedFilmIds;
    newlyCreatedFilmIds.push(...result.newlyCreatedFilmIds);
  }
  setEventCategoryFilmIds(eventId, resolvedByCategory);

  if (newlyCreatedFilmIds.length > 0) {
    try {
      await retryMetadataForFilms(
        { films: deps.films, unresolvedMetadata: deps.unresolvedMetadata },
        newlyCreatedFilmIds,
      );
    } catch {
      // Enrichment is best-effort — never allowed to fail content loading
      // itself (see `loadHalloweenFilmContent`'s identical rationale).
    }
  }
}
