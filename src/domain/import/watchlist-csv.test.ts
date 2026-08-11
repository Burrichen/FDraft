import { describe, expect, it } from "vitest";
import { parseWatchlistCsv } from "./watchlist-csv";

const VALID_CSV = [
  "Date,Name,Year,Letterboxd URI",
  "2023-01-15,Inception,2010,https://letterboxd.com/film/inception/",
  "2023-02-20,Arrival,2016,https://letterboxd.com/film/arrival-2016/",
].join("\n");

describe("parseWatchlistCsv", () => {
  it("parses valid rows preserving Date Added, title, year, and Letterboxd URI", () => {
    const result = parseWatchlistCsv(VALID_CSV);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toEqual([
      {
        dateAdded: "2023-01-15",
        title: "Inception",
        releaseYear: 2010,
        letterboxdUri: "https://letterboxd.com/film/inception/",
        sourceRowNumber: 2,
      },
      {
        dateAdded: "2023-02-20",
        title: "Arrival",
        releaseYear: 2016,
        letterboxdUri: "https://letterboxd.com/film/arrival-2016/",
        sourceRowNumber: 3,
      },
    ]);
    expect(result.unresolvedRows).toEqual([]);
  });

  it("preserves file order for later ordinal-position derivation", () => {
    const result = parseWatchlistCsv(VALID_CSV);
    if (!result.ok) throw new Error("expected ok");
    expect(result.rows.map((r) => r.title)).toEqual(["Inception", "Arrival"]);
  });

  it("rejects a file missing required headers", () => {
    const result = parseWatchlistCsv("Name,Year\nInception,2010\n");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("Date");
    expect(result.reason).toContain("Letterboxd URI");
  });

  it("rejects a malformed (unparsable) file", () => {
    const result = parseWatchlistCsv("");
    expect(result.ok).toBe(false);
  });

  it("marks a row with a missing Name as unresolved rather than failing the whole file", () => {
    const csv = [
      "Date,Name,Year,Letterboxd URI",
      "2023-01-15,,2010,https://letterboxd.com/film/inception/",
      "2023-02-20,Arrival,2016,https://letterboxd.com/film/arrival-2016/",
    ].join("\n");
    const result = parseWatchlistCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].title).toBe("Arrival");
    expect(result.unresolvedRows).toEqual([
      { sourceRowNumber: 2, reason: "missing_name" },
    ]);
  });

  it("marks a row with a missing or invalid Date as unresolved", () => {
    const csv = [
      "Date,Name,Year,Letterboxd URI",
      "not-a-date,Inception,2010,https://letterboxd.com/film/inception/",
      ",Arrival,2016,https://letterboxd.com/film/arrival-2016/",
    ].join("\n");
    const result = parseWatchlistCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(0);
    expect(result.unresolvedRows).toEqual([
      { sourceRowNumber: 2, reason: "missing_or_invalid_date" },
      { sourceRowNumber: 3, reason: "missing_or_invalid_date" },
    ]);
  });

  it("treats a missing or non-4-digit Year as null rather than rejecting the row", () => {
    const csv = [
      "Date,Name,Year,Letterboxd URI",
      "2023-01-15,Untitled Project,,https://letterboxd.com/film/untitled/",
    ].join("\n");
    const result = parseWatchlistCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0].releaseYear).toBeNull();
  });

  it("treats a missing Letterboxd URI as null rather than rejecting the row", () => {
    const csv = [
      "Date,Name,Year,Letterboxd URI",
      "2023-01-15,Some Obscure Film,2020,",
    ].join("\n");
    const result = parseWatchlistCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0].letterboxdUri).toBeNull();
  });

  it("passes duplicate rows through unchanged (deduplication is the import plan's job, not the parser's)", () => {
    const csv = [
      "Date,Name,Year,Letterboxd URI",
      "2023-01-15,Inception,2010,https://letterboxd.com/film/inception/",
      "2023-01-16,Inception,2010,https://letterboxd.com/film/inception/",
    ].join("\n");
    const result = parseWatchlistCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(2);
  });
});
