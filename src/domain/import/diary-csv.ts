import { findMissingHeaders, parseCsv } from "./csv";
import { isIsoDate, parseYear } from "./watchlist-csv";

/**
 * Letterboxd's diary export. One row per logged viewing (so a rewatched
 * film appears multiple times, each with its own Watched Date) — the most
 * reliable per-viewing watch date available from the export.
 */
export const DIARY_CSV_REQUIRED_HEADERS = [
  "Date",
  "Name",
  "Year",
  "Letterboxd URI",
  "Rewatch",
  "Watched Date",
] as const;

export interface ParsedDiaryRow {
  title: string;
  releaseYear: number | null;
  letterboxdUri: string | null;
  watchedDate: string;
  rewatch: boolean;
  sourceRowNumber: number;
}

export interface UnresolvedRow {
  sourceRowNumber: number;
  reason: "missing_name" | "missing_or_invalid_watched_date";
}

export type DiaryCsvParseResult =
  | { ok: true; rows: ParsedDiaryRow[]; unresolvedRows: UnresolvedRow[] }
  | { ok: false; reason: string };

export function parseDiaryCsv(content: string): DiaryCsvParseResult {
  const parsed = parseCsv(content);
  if (!parsed.ok) {
    return { ok: false, reason: parsed.failure.message };
  }

  const missing = findMissingHeaders(
    parsed.csv.headers,
    DIARY_CSV_REQUIRED_HEADERS,
  );
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `Missing required column(s): ${missing.join(", ")}`,
    };
  }

  const rows: ParsedDiaryRow[] = [];
  const unresolvedRows: UnresolvedRow[] = [];

  parsed.csv.rows.forEach((raw, index) => {
    const sourceRowNumber = index + 2;

    const title = (raw["Name"] ?? "").trim();
    if (!title) {
      unresolvedRows.push({ sourceRowNumber, reason: "missing_name" });
      return;
    }

    const watchedDate = (raw["Watched Date"] ?? "").trim();
    if (!isIsoDate(watchedDate)) {
      unresolvedRows.push({
        sourceRowNumber,
        reason: "missing_or_invalid_watched_date",
      });
      return;
    }

    rows.push({
      title,
      releaseYear: parseYear(raw["Year"]),
      letterboxdUri: (raw["Letterboxd URI"] ?? "").trim() || null,
      watchedDate,
      rewatch: (raw["Rewatch"] ?? "").trim().toLowerCase() === "yes",
      sourceRowNumber,
    });
  });

  return { ok: true, rows, unresolvedRows };
}
