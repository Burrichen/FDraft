/**
 * Deriving a stable identity for a film from what a Letterboxd CSV export
 * actually gives us. The Letterboxd URI's slug is the reliable key (it's
 * how Letterboxd itself identifies the film); title+year is a best-effort
 * fallback for the rare row that has no URI, and is heuristic — two
 * different films can share a title and year. See
 * docs/product-spec.md, "Letterboxd Import".
 */

const LETTERBOXD_FILM_URI_PATTERN =
  /^https?:\/\/(?:www\.)?letterboxd\.com\/film\/([^/]+)\/?/i;

/** Extracts the slug from a Letterboxd film URL, e.g. "inception" from "https://letterboxd.com/film/inception/". Returns null for anything else. */
export function extractLetterboxdSlug(
  uri: string | null | undefined,
): string | null {
  if (!uri) return null;
  const match = LETTERBOXD_FILM_URI_PATTERN.exec(uri.trim());
  return match ? match[1] : null;
}

export interface FilmIdentity {
  letterboxdUri: string | null;
  title: string;
  releaseYear: number | null;
}

/**
 * A stable key for correlating rows within one import run and against the
 * existing film catalog. Prefixed so a slug-based key and a title/year
 * fallback key can never collide with each other.
 */
export function computeFilmKey(identity: FilmIdentity): string {
  const slug = extractLetterboxdSlug(identity.letterboxdUri);
  if (slug) {
    return `slug:${slug}`;
  }
  const normalizedTitle = identity.title.trim().toLowerCase();
  const year = identity.releaseYear ?? "unknown";
  return `title-year:${normalizedTitle}::${year}`;
}
