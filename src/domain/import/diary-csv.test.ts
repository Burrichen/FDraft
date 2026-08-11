import { describe, expect, it } from "vitest";
import { parseDiaryCsv } from "./diary-csv";

describe("parseDiaryCsv", () => {
  it("parses valid rows, including rewatches", () => {
    const csv = [
      "Date,Name,Year,Letterboxd URI,Rewatch,Watched Date",
      "2023-01-16,Inception,2010,https://letterboxd.com/film/inception/,,2023-01-15",
      "2024-03-02,Inception,2010,https://letterboxd.com/film/inception/,Yes,2024-03-01",
    ].join("\n");
    const result = parseDiaryCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toEqual([
      {
        title: "Inception",
        releaseYear: 2010,
        letterboxdUri: "https://letterboxd.com/film/inception/",
        watchedDate: "2023-01-15",
        rewatch: false,
        sourceRowNumber: 2,
      },
      {
        title: "Inception",
        releaseYear: 2010,
        letterboxdUri: "https://letterboxd.com/film/inception/",
        watchedDate: "2024-03-01",
        rewatch: true,
        sourceRowNumber: 3,
      },
    ]);
  });

  it("rejects a file missing required headers", () => {
    const result = parseDiaryCsv("Date,Name,Year\n2023-01-15,Inception,2010\n");
    expect(result.ok).toBe(false);
  });

  it("marks a row with a missing or invalid Watched Date as unresolved", () => {
    const csv = [
      "Date,Name,Year,Letterboxd URI,Rewatch,Watched Date",
      "2023-01-16,Inception,2010,,,",
    ].join("\n");
    const result = parseDiaryCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.unresolvedRows).toEqual([
      { sourceRowNumber: 2, reason: "missing_or_invalid_watched_date" },
    ]);
  });

  it("marks a row with a missing Name as unresolved", () => {
    const csv = [
      "Date,Name,Year,Letterboxd URI,Rewatch,Watched Date",
      "2023-01-16,,2010,,,2023-01-15",
    ].join("\n");
    const result = parseDiaryCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.unresolvedRows).toEqual([
      { sourceRowNumber: 2, reason: "missing_name" },
    ]);
  });
});
