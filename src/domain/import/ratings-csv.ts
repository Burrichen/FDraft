import { findMissingHeaders, parseCsv } from "./csv";
import { parseYear } from "./watchlist-csv";

export const RATINGS_CSV_REQUIRED_HEADERS = [
  "Date",
  "Name",
  "Year",
  "Letterboxd URI",
  "Rating",
] as const;

export interface ParsedRatingRow {
  title: string;
  releaseYear: number | null;
  letterboxdUri: string | null;
  /** Half-star increments, 0.5-5.0. */
  rating: number;
  /** ISO calendar date the rating was logged, if present. */
  ratedAt: string | null;
  sourceRowNumber: number;
}

export interface UnresolvedRow {
  sourceRowNumber: number;
  reason: "missing_name" | "missing_or_invalid_rating";
}

export type RatingsCsvParseResult =
  | { ok: true; rows: ParsedRatingRow[]; unresolvedRows: UnresolvedRow[] }
  | { ok: false; reason: string };

export function parseRatingsCsv(content: string): RatingsCsvParseResult {
  const parsed = parseCsv(content);
  if (!parsed.ok) {
    return { ok: false, reason: parsed.failure.message };
  }

  const missing = findMissingHeaders(
    parsed.csv.headers,
    RATINGS_CSV_REQUIRED_HEADERS,
  );
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `Missing required column(s): ${missing.join(", ")}`,
    };
  }

  const rows: ParsedRatingRow[] = [];
  const unresolvedRows: UnresolvedRow[] = [];

  parsed.csv.rows.forEach((raw, index) => {
    const sourceRowNumber = index + 2;

    const title = (raw["Name"] ?? "").trim();
    if (!title) {
      unresolvedRows.push({ sourceRowNumber, reason: "missing_name" });
      return;
    }

    const rating = parseHalfStarRating(raw["Rating"]);
    if (rating === null) {
      unresolvedRows.push({
        sourceRowNumber,
        reason: "missing_or_invalid_rating",
      });
      return;
    }

    const dateRaw = (raw["Date"] ?? "").trim();
    rows.push({
      title,
      releaseYear: parseYear(raw["Year"]),
      letterboxdUri: (raw["Letterboxd URI"] ?? "").trim() || null,
      rating,
      ratedAt: /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : null,
      sourceRowNumber,
    });
  });

  return { ok: true, rows, unresolvedRows };
}

/** Parses a Letterboxd rating string ("4", "3.5") into a validated 0.5-5.0 half-star value, or null if invalid. */
export function parseHalfStarRating(value: string | undefined): number | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  const rating = Number(trimmed);
  if (Number.isNaN(rating) || rating < 0.5 || rating > 5) return null;
  // Must land on a half-star increment (1, 1.5, 2, ...).
  if (Math.round(rating * 2) !== rating * 2) return null;
  return rating;
}
