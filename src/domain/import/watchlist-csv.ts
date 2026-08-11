import { findMissingHeaders, parseCsv } from "./csv";

/**
 * The columns Letterboxd's "Watchlist" export CSV has always shipped with.
 * Order in the file has no header of its own — we treat row order as the
 * watchlist's ordinal position, which is the only ordering signal a CSV
 * export gives us (see docs/product-spec.md, "Letterboxd Import" —
 * "preserve watchlist ordering/ordinal position where determinable").
 */
export const WATCHLIST_CSV_REQUIRED_HEADERS = [
  "Date",
  "Name",
  "Year",
  "Letterboxd URI",
] as const;

export interface ParsedWatchlistRow {
  /** ISO calendar date (YYYY-MM-DD), preserved exactly as Letterboxd reported it. */
  dateAdded: string;
  title: string;
  releaseYear: number | null;
  letterboxdUri: string | null;
  /** 1-based row number in the source file (header row is row 1), for error reporting. */
  sourceRowNumber: number;
}

export interface UnresolvedRow {
  sourceRowNumber: number;
  reason: "missing_name" | "missing_or_invalid_date";
}

export type WatchlistCsvParseResult =
  | { ok: true; rows: ParsedWatchlistRow[]; unresolvedRows: UnresolvedRow[] }
  | { ok: false; reason: string };

export function parseWatchlistCsv(content: string): WatchlistCsvParseResult {
  const parsed = parseCsv(content);
  if (!parsed.ok) {
    return { ok: false, reason: parsed.failure.message };
  }

  const missing = findMissingHeaders(
    parsed.csv.headers,
    WATCHLIST_CSV_REQUIRED_HEADERS,
  );
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `Missing required column(s): ${missing.join(", ")}`,
    };
  }

  const rows: ParsedWatchlistRow[] = [];
  const unresolvedRows: UnresolvedRow[] = [];

  parsed.csv.rows.forEach((raw, index) => {
    const sourceRowNumber = index + 2; // header is row 1, data starts at row 2

    const title = (raw["Name"] ?? "").trim();
    if (!title) {
      unresolvedRows.push({ sourceRowNumber, reason: "missing_name" });
      return;
    }

    const dateAdded = (raw["Date"] ?? "").trim();
    if (!isIsoDate(dateAdded)) {
      unresolvedRows.push({
        sourceRowNumber,
        reason: "missing_or_invalid_date",
      });
      return;
    }

    rows.push({
      dateAdded,
      title,
      releaseYear: parseYear(raw["Year"]),
      letterboxdUri: (raw["Letterboxd URI"] ?? "").trim() || null,
      sourceRowNumber,
    });
  });

  return { ok: true, rows, unresolvedRows };
}

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

export function parseYear(value: string | undefined): number | null {
  const trimmed = (value ?? "").trim();
  return /^\d{4}$/.test(trimmed) ? Number(trimmed) : null;
}
