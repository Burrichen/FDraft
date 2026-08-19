import { describe, expect, it } from "vitest";
import { formatWatchlistDuration } from "./watchlist-duration";

describe("formatWatchlistDuration", () => {
  it("formats a multi-year gap in years", () => {
    expect(formatWatchlistDuration("2024-01-01", new Date(2026, 5, 1))).toBe(
      "2 years",
    );
  });

  it("uses singular 'year' for exactly one year", () => {
    expect(formatWatchlistDuration("2025-01-01", new Date(2026, 1, 1))).toBe(
      "1 year",
    );
  });

  it("formats a multi-month gap (under a year) in months", () => {
    expect(formatWatchlistDuration("2026-01-01", new Date(2026, 8, 1))).toBe(
      "8 months",
    );
  });

  it("uses singular 'month' for exactly one month", () => {
    expect(formatWatchlistDuration("2026-01-01", new Date(2026, 1, 1))).toBe(
      "1 month",
    );
  });

  it("formats a gap under a month in days", () => {
    expect(formatWatchlistDuration("2026-01-01", new Date(2026, 0, 6))).toBe(
      "5 days",
    );
  });

  it("uses singular 'day' for exactly one day", () => {
    expect(formatWatchlistDuration("2026-01-01", new Date(2026, 0, 2))).toBe(
      "1 day",
    );
  });

  it("says 'today' for the same calendar day", () => {
    expect(formatWatchlistDuration("2026-01-01", new Date(2026, 0, 1))).toBe(
      "today",
    );
  });
});
