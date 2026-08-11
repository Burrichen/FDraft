import { describe, expect, it } from "vitest";
import { parseHalfStarRating, parseRatingsCsv } from "./ratings-csv";

const VALID_CSV = [
  "Date,Name,Year,Letterboxd URI,Rating",
  "2023-01-15,Inception,2010,https://letterboxd.com/film/inception/,4.5",
  "2023-02-20,Arrival,2016,https://letterboxd.com/film/arrival-2016/,5",
].join("\n");

describe("parseRatingsCsv", () => {
  it("parses valid rating rows", () => {
    const result = parseRatingsCsv(VALID_CSV);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toEqual([
      {
        title: "Inception",
        releaseYear: 2010,
        letterboxdUri: "https://letterboxd.com/film/inception/",
        rating: 4.5,
        ratedAt: "2023-01-15",
        sourceRowNumber: 2,
      },
      {
        title: "Arrival",
        releaseYear: 2016,
        letterboxdUri: "https://letterboxd.com/film/arrival-2016/",
        rating: 5,
        ratedAt: "2023-02-20",
        sourceRowNumber: 3,
      },
    ]);
  });

  it("rejects a file missing required headers", () => {
    const result = parseRatingsCsv(
      "Date,Name,Year,Letterboxd URI\n2023-01-15,Inception,2010,\n",
    );
    expect(result.ok).toBe(false);
  });

  it("marks a row with a missing rating as unresolved", () => {
    const csv =
      "Date,Name,Year,Letterboxd URI,Rating\n2023-01-15,Inception,2010,,\n";
    const result = parseRatingsCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(0);
    expect(result.unresolvedRows).toEqual([
      { sourceRowNumber: 2, reason: "missing_or_invalid_rating" },
    ]);
  });

  it("marks a row with an out-of-range rating as unresolved", () => {
    const csv =
      "Date,Name,Year,Letterboxd URI,Rating\n2023-01-15,Inception,2010,,6\n";
    const result = parseRatingsCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.unresolvedRows).toHaveLength(1);
  });
});

describe("parseHalfStarRating", () => {
  it.each(["0.5", "1", "1.5", "5"])(
    "accepts valid half-star rating %s",
    (value) => {
      expect(parseHalfStarRating(value)).toBe(Number(value));
    },
  );

  it.each(["0", "5.5", "-1", "abc", "", "1.25"])(
    "rejects invalid rating %s",
    (value) => {
      expect(parseHalfStarRating(value)).toBeNull();
    },
  );
});
