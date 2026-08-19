import { extractLetterboxdExportZip } from "@/domain/import/export-zip";
import type { ImportLocalWatchlistFiles } from "./local-import-service";

export type ReadImportFileResult =
  | { ok: true; files: ImportLocalWatchlistFiles; source: "csv" | "zip" }
  | { ok: false; error: string };

/**
 * Reads a user-chosen Letterboxd watchlist.csv or full export .zip file
 * with the File API and extracts the individual CSV files
 * `importLocalWatchlistCsv` needs — the exact zip-detection and
 * extraction logic the normal Watchlist import page
 * (`app/(app)/watchlist/import/import-view.tsx`) already used, factored
 * out so "Re-import Letterboxd Watchlist" (see docs/updates, v1.1.2) can
 * reuse it instead of re-implementing file-type sniffing and zip
 * extraction a second time. Never sends the file anywhere — parsing is
 * entirely local (see docs/product-spec.md, "FULL OFFLINE CORE
 * FUNCTIONALITY").
 */
export async function readImportFile(
  file: File,
): Promise<ReadImportFileResult> {
  const isZip =
    file.name.toLowerCase().endsWith(".zip") || file.type === "application/zip";

  if (!isZip) {
    return {
      ok: true,
      files: { watchlistCsv: await file.text() },
      source: "csv",
    };
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  const extracted = extractLetterboxdExportZip(buffer);
  if (!extracted.ok) {
    return { ok: false, error: extracted.reason };
  }
  return { ok: true, files: extracted.files, source: "zip" };
}
