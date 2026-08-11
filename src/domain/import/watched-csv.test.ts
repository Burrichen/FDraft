import { describe, expect, it } from "vitest";
import { parseWatchedCsv } from "./watched-csv";

describe("parseWatchedCsv", () => {
  it("parses valid rows", () => {
    const csv = [
      "Date,Name,Year,Letterboxd URI",
      "2023-01-15,Inception,2010,https://letterboxd.com/film/inception/",
    ].join("\n");
    const result = parseWatchedCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toEqual([
      {
        title: "Inception",
        releaseYear: 2010,
        letterboxdUri: "https://letterboxd.com/film/inception/",
        watchedDate: "2023-01-15",
        sourceRowNumber: 2,
      },
    ]);
  });

  it("rejects a file missing required headers", () => {
    const result = parseWatchedCsv("Name,Year\nInception,2010\n");
    expect(result.ok).toBe(false);
  });

  it("treats a missing/invalid Date as null rather than rejecting the row", () => {
    const csv = ["Date,Name,Year,Letterboxd URI", ",Inception,2010,"].join(
      "\n",
    );
    const result = parseWatchedCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0].watchedDate).toBeNull();
  });

  it("marks a row with a missing Name as unresolved", () => {
    const csv = ["Date,Name,Year,Letterboxd URI", "2023-01-15,,2010,"].join(
      "\n",
    );
    const result = parseWatchedCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.unresolvedRows).toEqual([
      { sourceRowNumber: 2, reason: "missing_name" },
    ]);
  });
});
