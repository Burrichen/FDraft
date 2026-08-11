import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { extractLetterboxdExportZip } from "./export-zip";

function buildZip(files: Record<string, string>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(files)) {
    entries[path] = strToU8(content);
  }
  return zipSync(entries);
}

describe("extractLetterboxdExportZip", () => {
  it("extracts watchlist.csv from a flat export", () => {
    const zip = buildZip({
      "watchlist.csv":
        "Date,Name,Year,Letterboxd URI\n2023-01-01,Inception,2010,\n",
    });
    const result = extractLetterboxdExportZip(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.files.watchlistCsv).toContain("Inception");
  });

  it("extracts watchlist.csv nested under a folder", () => {
    const zip = buildZip({
      "letterboxd-export-2024/watchlist.csv":
        "Date,Name,Year,Letterboxd URI\n2023-01-01,Inception,2010,\n",
    });
    const result = extractLetterboxdExportZip(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.files.watchlistCsv).toContain("Inception");
  });

  it("extracts ratings, watched, and diary CSVs when present", () => {
    const zip = buildZip({
      "watchlist.csv": "watchlist-content",
      "ratings.csv": "ratings-content",
      "watched.csv": "watched-content",
      "diary.csv": "diary-content",
    });
    const result = extractLetterboxdExportZip(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.files).toEqual({
      watchlistCsv: "watchlist-content",
      ratingsCsv: "ratings-content",
      watchedCsv: "watched-content",
      diaryCsv: "diary-content",
    });
  });

  it("accepts the legacy watched-films.csv filename", () => {
    const zip = buildZip({
      "watchlist.csv": "x",
      "watched-films.csv": "watched-content",
    });
    const result = extractLetterboxdExportZip(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.files.watchedCsv).toBe("watched-content");
  });

  it("succeeds with only watchlist.csv — the other files are optional", () => {
    const zip = buildZip({ "watchlist.csv": "x" });
    const result = extractLetterboxdExportZip(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.files.ratingsCsv).toBeNull();
    expect(result.files.watchedCsv).toBeNull();
    expect(result.files.diaryCsv).toBeNull();
  });

  it("fails when the ZIP has no watchlist.csv at all", () => {
    const zip = buildZip({ "ratings.csv": "x" });
    const result = extractLetterboxdExportZip(zip);
    expect(result.ok).toBe(false);
  });

  it("fails gracefully on a malformed (non-ZIP) buffer instead of throwing", () => {
    const result = extractLetterboxdExportZip(new Uint8Array([1, 2, 3, 4, 5]));
    expect(result.ok).toBe(false);
  });
});
