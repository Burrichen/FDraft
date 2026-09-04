import type { EventFilmEntry } from "@/domain/events/event-film-content-schema";
import type { FilmRepository } from "@/repositories/film-repository";

/**
 * Turns a curated content list's film entries into actual local
 * `FilmRecord.id`s (see docs/updates, "STATIC EVENT FILM CONTENT PACKS" —
 * used by January's additive eligibility list, never Halloween's pools,
 * which resolve-OR-CREATE instead — see
 * `resolve-or-create-halloween-films.ts`). An entry with no matching
 * local film simply contributes nothing — this never imports/creates a
 * film or touches anyone's watchlist (see docs/product-spec.md, "WHITELIST
 * MATCHING": "do not automatically add globally curated movies to
 * someone's personal watchlist"); it only ever resolves an id that
 * `EventEligibilityRules.curatedFilmIds` can later be additive with,
 * which itself only matters for a film already on a profile's own active
 * watchlist (see `resolveEligibleCandidates`).
 *
 * Title+year is the entry's entire identity now (see
 * `eventFilmEntrySchema`) — exact, case-insensitive title match plus an
 * exact year match (`FilmRepository.findByTitleAndYear`), deliberately
 * never fuzzy: a curated "Halloween (1978)" entry must never resolve to a
 * locally-known "Halloween (2007)". Never throws — a non-matching entry
 * is just skipped.
 */
export async function resolveManifestFilmIds(
  repos: { films: FilmRepository },
  entries: EventFilmEntry[],
): Promise<string[]> {
  const resolved = new Set<string>();
  for (const entry of entries) {
    const film = await repos.films.findByTitleAndYear(entry.title, entry.year);
    if (film) {
      resolved.add(film.id);
    }
  }
  return [...resolved];
}
