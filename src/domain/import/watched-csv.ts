import { findMissingHeaders, parseCsv } from "./csv";
import { isIsoDate, parseYear } from "./watchlist-csv";

/**
 * Letterboxd's "Watched Films" export. Unlike diary.csv, this has no
 * distinct "Watched Date" column — its "Date" is the best signal available
 * here for when the film was watched, so it's carried through as-is rather
 * than guessed at further.
 */
export const WATCHED_CSV_REQUIRED_HEADERS = [
  "Date",
  "Name",
  "Year",
  "Letterboxd URI",
] as const;

export interface ParsedWatchedRow {
  title: string;
  releaseYear: number | null;
  letterboxdUri: string | null;
  /** ISO calendar date, or null when the export's Date column is missing/unparseable. */
  watchedDate: string | null;
  sourceRowNumber: number;
}

export interface UnresolvedRow {
  sourceRowNumber: number;
  reason: "missing_name";
}

export type WatchedCsvParseResult =
  | { ok: true; rows: ParsedWatchedRow[]; unresolvedRows: UnresolvedRow[] }
  | { ok: false; reason: string };

export function parseWatchedCsv(content: string): WatchedCsvParseResult {
  const parsed = parseCsv(content);
  if (!parsed.ok) {
    return { ok: false, reason: parsed.failure.message };
  }

  const missing = findMissingHeaders(
    parsed.csv.headers,
    WATCHED_CSV_REQUIRED_HEADERS,
  );
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `Missing required column(s): ${missing.join(", ")}`,
    };
  }

  const rows: ParsedWatchedRow[] = [];
  const unresolvedRows: UnresolvedRow[] = [];

  parsed.csv.rows.forEach((raw, index) => {
    const sourceRowNumber = index + 2;
    const title = (raw["Name"] ?? "").trim();
    if (!title) {
      unresolvedRows.push({ sourceRowNumber, reason: "missing_name" });
      return;
    }

    const dateRaw = (raw["Date"] ?? "").trim();
    rows.push({
      title,
      releaseYear: parseYear(raw["Year"]),
      letterboxdUri: (raw["Letterboxd URI"] ?? "").trim() || null,
      watchedDate: isIsoDate(dateRaw) ? dateRaw : null,
      sourceRowNumber,
    });
  });

  return { ok: true, rows, unresolvedRows };
}
