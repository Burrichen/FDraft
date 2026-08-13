import { unzipSync } from "fflate";

/**
 * Locates the CSVs we understand inside a full Letterboxd export ZIP. Only
 * watchlist.csv is required — the others (ratings/watched/diary) are
 * imported when present, matching docs/product-spec.md: "Prefer also
 * accepting the user's full Letterboxd export ZIP ... so personal ratings,
 * watched history, diary information ... can be imported" without making
 * any of them mandatory.
 */
export interface ExtractedExportFiles {
  watchlistCsv: string | null;
  ratingsCsv: string | null;
  watchedCsv: string | null;
  diaryCsv: string | null;
}

/** Same shape, but with watchlistCsv narrowed to non-null — always true once `ok` is true. */
export type ExtractedExportFilesWithWatchlist = ExtractedExportFiles & {
  watchlistCsv: string;
};

export type ExtractExportZipResult =
  | { ok: true; files: ExtractedExportFilesWithWatchlist }
  | { ok: false; reason: string };

const FILENAME_MATCHERS: Record<keyof ExtractedExportFiles, RegExp> = {
  watchlistCsv: /(^|\/)watchlist\.csv$/i,
  ratingsCsv: /(^|\/)ratings\.csv$/i,
  // Letterboxd has shipped this file as both "watched.csv" and
  // "watched-films.csv" across export format revisions.
  watchedCsv: /(^|\/)watched(-films)?\.csv$/i,
  diaryCsv: /(^|\/)diary\.csv$/i,
};

export function extractLetterboxdExportZip(
  buffer: Uint8Array,
): ExtractExportZipResult {
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(buffer);
  } catch (error) {
    return {
      ok: false,
      reason: `Could not read the ZIP file: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }

  const decoder = new TextDecoder("utf-8");
  const files: ExtractedExportFiles = {
    watchlistCsv: null,
    ratingsCsv: null,
    watchedCsv: null,
    diaryCsv: null,
  };
  // A zero-byte watchlist.csv decodes to "" — falsy, but genuinely present.
  // Tracked separately so that case reports "the file is empty" (from
  // `parseCsv`, once this returns `ok: true`) rather than the misleading
  // "does not contain a watchlist.csv file at all" — see
  // docs/product-spec.md, "COMPLETE PRODUCT AUDIT".
  let watchlistCsvFound = false;

  for (const [path, data] of Object.entries(unzipped)) {
    if (path.endsWith("/")) continue; // directory entry
    for (const [key, pattern] of Object.entries(FILENAME_MATCHERS) as [
      keyof ExtractedExportFiles,
      RegExp,
    ][]) {
      if (pattern.test(path)) {
        files[key] = decoder.decode(data);
        if (key === "watchlistCsv") watchlistCsvFound = true;
      }
    }
  }

  if (!watchlistCsvFound) {
    return {
      ok: false,
      reason: "The export ZIP does not contain a watchlist.csv file.",
    };
  }

  return {
    ok: true,
    files: { ...files, watchlistCsv: files.watchlistCsv ?? "" },
  };
}
