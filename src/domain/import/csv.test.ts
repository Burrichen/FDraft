import { describe, expect, it } from "vitest";
import { findMissingHeaders, parseCsv } from "./csv";

describe("parseCsv", () => {
  it("parses a well-formed CSV into headers and rows", () => {
    const result = parseCsv("Date,Name,Year\n2024-01-01,Inception,2010\n");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.csv.headers).toEqual(["Date", "Name", "Year"]);
      expect(result.csv.rows).toEqual([
        { Date: "2024-01-01", Name: "Inception", Year: "2010" },
      ]);
    }
  });

  it("trims whitespace from header names", () => {
    const result = parseCsv(" Date , Name \n2024-01-01,Inception\n");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.csv.headers).toEqual(["Date", "Name"]);
    }
  });

  it("handles quoted fields containing commas", () => {
    const result = parseCsv('Date,Name\n2024-01-01,"Se7en, the movie"\n');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.csv.rows[0].Name).toBe("Se7en, the movie");
    }
  });

  it("rejects an empty file", () => {
    const result = parseCsv("");
    expect(result.ok).toBe(false);
  });

  it("rejects a file with only whitespace", () => {
    const result = parseCsv("   \n\n  ");
    expect(result.ok).toBe(false);
  });

  it("skips blank lines rather than treating them as malformed rows", () => {
    const result = parseCsv(
      "Date,Name\n2024-01-01,Inception\n\n2024-01-02,Arrival\n",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.csv.rows).toHaveLength(2);
    }
  });
});

describe("findMissingHeaders", () => {
  it("returns an empty array when all required headers are present", () => {
    expect(
      findMissingHeaders(["Date", "Name", "Year"], ["Date", "Name"]),
    ).toEqual([]);
  });

  it("returns missing headers in the required order", () => {
    expect(findMissingHeaders(["Name"], ["Date", "Name", "Year"])).toEqual([
      "Date",
      "Year",
    ]);
  });

  it("returns all required headers when none are present", () => {
    expect(findMissingHeaders([], ["Date", "Name"])).toEqual(["Date", "Name"]);
  });
});
