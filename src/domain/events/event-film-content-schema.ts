import { z } from "zod";

/**
 * A single curated Event film entry (see docs/updates, "STATIC EVENT FILM
 * CONTENT PACKS") — TITLE + YEAR is the entire authored identity, on
 * purpose. This deliberately supersedes the older `EventManifestFilm`
 * shape (which also allowed an optional `tmdbId`/`letterboxdSlug`): these
 * curated lists are now genuinely static content shipped with the app
 * (see `src/domain/events/event-film-content.ts`), never remotely
 * fetched, so there is no separate "authoring source" to reconcile a
 * provider id against — a human just writes the title and year they mean,
 * and FDraft's existing metadata system resolves everything else (poster,
 * runtime, rating, genres, ...) the exact same way it resolves any other
 * film. `year` is required (not optional/nullable, unlike the old shape)
 * precisely because year is what prevents "Halloween (1978)" from ever
 * being confused with "Halloween (2007)" — see
 * `src/repositories/film-repository.ts`'s `findByTitleAndYear`, an exact
 * (case-insensitive title, exact year) match, never fuzzy.
 */
export const eventFilmEntrySchema = z.object({
  title: z.string().trim().min(1).max(300),
  year: z.number().int().min(1870).max(2100),
});

export type EventFilmEntry = z.infer<typeof eventFilmEntrySchema>;

/**
 * Halloween's two static curated categories (see
 * `public/events/halloween/films.json`) — a film listed here does not
 * need to be on anyone's watchlist; `horror`/`kitsch` ARE the pool a
 * Halloween Draft draws from (see `createHalloweenLocalDraft`). Category
 * membership is entirely editorial (see docs/updates, "STATIC EVENT FILM
 * CONTENT PACKS" §7): which list a film is in is authoritative, and
 * nothing here or in draft generation ever inspects a film's own genre
 * metadata to move it between them.
 */
export const halloweenFilmContentSchema = z.object({
  schemaVersion: z.literal(1),
  event: z.literal("halloween"),
  horror: z.array(eventFilmEntrySchema).max(2000),
  kitsch: z.array(eventFilmEntrySchema).max(2000),
});

export type HalloweenFilmContent = z.infer<typeof halloweenFilmContentSchema>;

/**
 * January's curated extra-eligibility list (see
 * `public/events/january/films.json`). Unlike Halloween's pools, this is
 * strictly ADDITIVE eligibility on top of a profile's own active
 * watchlist (see `EventEligibilityRules.curatedFilmIds`,
 * `resolveEligibleCandidates`) — a film listed here that isn't already on
 * someone's watchlist contributes nothing for them; it is never injected
 * onto anyone's watchlist, and never creates a local film record the way
 * Halloween's pools do.
 */
export const januaryFilmContentSchema = z.object({
  schemaVersion: z.literal(1),
  event: z.literal("f-you-its-january"),
  curated: z.array(eventFilmEntrySchema).max(2000),
});

export type JanuaryFilmContent = z.infer<typeof januaryFilmContentSchema>;

/**
 * Christmas's two static curated categories (see
 * `public/events/christmas/films.json`) — content-pack support only, per
 * docs/updates, "STATIC EVENT FILM CONTENT PACKS" §9: no Christmas
 * `EventDefinition`/Draft mechanic exists yet (see `event-registry.ts`),
 * so nothing currently reads this at runtime — this only establishes the
 * same static-file shape/validation Halloween and January already have,
 * ready for whichever future phase adds the real Draft mechanic.
 *
 * - `classic` — films that are directly and recognisably Christmas films.
 * - `adjacent` — films that fit Christmas/winter/holiday-season viewing
 *   but aren't necessarily straightforward traditional Christmas films.
 *
 * Both are manually curated editorial categories, never inferred from
 * genre metadata (same rule as Halloween's Horror/Kitsch).
 */
export const christmasFilmContentSchema = z.object({
  schemaVersion: z.literal(1),
  event: z.literal("christmas"),
  classic: z.array(eventFilmEntrySchema).max(2000),
  adjacent: z.array(eventFilmEntrySchema).max(2000),
});

export type ChristmasFilmContent = z.infer<typeof christmasFilmContentSchema>;

/**
 * Parses raw JSON (a build-time `import` of a `films.json` file under
 * `public/events/<eventId>/`) into a validated content object. Unlike the
 * old remote-manifest schemas' `safeParse`-and-degrade convention, these
 * THROW on a malformed pack — same reasoning as `parseEventArtPack`: this
 * is a file this project ships and controls, not untrusted network input,
 * so a broken one is a real authoring mistake that should fail loudly (a
 * build/test error) rather than silently degrade into an empty pool for a
 * real user.
 */
export function parseHalloweenFilmContent(
  value: unknown,
): HalloweenFilmContent {
  return halloweenFilmContentSchema.parse(value);
}

export function parseJanuaryFilmContent(value: unknown): JanuaryFilmContent {
  return januaryFilmContentSchema.parse(value);
}

export function parseChristmasFilmContent(
  value: unknown,
): ChristmasFilmContent {
  return christmasFilmContentSchema.parse(value);
}

/**
 * Every category array across a content object, keyed by its own category
 * key (e.g. `{ horror: [...], kitsch: [...] }`) — the shape
 * `findCrossCategoryDuplicates`/`findWithinCategoryDuplicates` and a
 * generic "list every pool" caller both want, without each having to know
 * a given event's specific field names.
 */
export type EventFilmCategories = Record<string, EventFilmEntry[]>;

function filmEntryKey(entry: EventFilmEntry): string {
  return `${entry.title.trim().toLowerCase()}::${entry.year}`;
}

/**
 * A film's title+year appearing more than once WITHIN the same category
 * (see docs/updates, "STATIC EVENT FILM CONTENT PACKS" §17: "duplicate
 * title+year within a pool"). Returns the duplicated entries themselves
 * (each one that isn't the first occurrence), never silently deduplicated
 * — a caller decides what to do (warn, fail validation, etc.).
 */
export function findWithinCategoryDuplicates(
  entries: EventFilmEntry[],
): EventFilmEntry[] {
  const seen = new Set<string>();
  const duplicates: EventFilmEntry[] = [];
  for (const entry of entries) {
    const key = filmEntryKey(entry);
    if (seen.has(key)) {
      duplicates.push(entry);
    } else {
      seen.add(key);
    }
  }
  return duplicates;
}

/**
 * A film's title+year appearing in more than one CATEGORY of the same
 * Event (see docs/updates, "STATIC EVENT FILM CONTENT PACKS" §8/§17 —
 * e.g. the same film accidentally listed in both Horror and Kitsch, or
 * both Christmas Classic and Adjacent). Never removes it from either
 * list — "ambiguous WRONG matches are worse than unresolved ones," and a
 * genuine curator choice to double-list a film is never silently
 * overridden — this only reports it so a human (or a test) can decide.
 * Draft generation's own cross-pool exclusion (see
 * `createHalloweenLocalDraft`) already guarantees such a film is never
 * drawn twice into the same Draft regardless of what this reports.
 */
export function findCrossCategoryDuplicates(
  categories: EventFilmCategories,
): Array<{ entry: EventFilmEntry; categories: string[] }> {
  const categoryKeysByFilm = new Map<
    string,
    { entry: EventFilmEntry; categories: string[] }
  >();
  for (const [categoryKey, entries] of Object.entries(categories)) {
    for (const entry of entries) {
      const key = filmEntryKey(entry);
      const existing = categoryKeysByFilm.get(key);
      if (existing) {
        existing.categories.push(categoryKey);
      } else {
        categoryKeysByFilm.set(key, { entry, categories: [categoryKey] });
      }
    }
  }
  return [...categoryKeysByFilm.values()].filter(
    (candidate) => candidate.categories.length > 1,
  );
}
