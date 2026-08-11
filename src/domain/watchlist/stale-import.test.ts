import { describe, expect, it } from "vitest";
import { isWatchlistStale } from "./stale-import";

describe("isWatchlistStale", () => {
  it("is not stale when the user has never imported", () => {
    expect(
      isWatchlistStale({
        lastImportCompletedAt: null,
        now: new Date("2026-06-06T00:00:00.000Z"),
        timezone: "UTC",
      }),
    ).toBe(false);
  });

  it("matches the spec example: imported 5 March, not yet stale on 5 June", () => {
    expect(
      isWatchlistStale({
        lastImportCompletedAt: new Date("2026-03-05T12:00:00.000Z"),
        now: new Date("2026-06-05T23:00:00.000Z"),
        timezone: "UTC",
      }),
    ).toBe(false);
  });

  it("matches the spec example: imported 5 March, stale from 6 June", () => {
    expect(
      isWatchlistStale({
        lastImportCompletedAt: new Date("2026-03-05T12:00:00.000Z"),
        now: new Date("2026-06-06T00:00:01.000Z"),
        timezone: "UTC",
      }),
    ).toBe(true);
  });

  it("is not stale well within the window", () => {
    expect(
      isWatchlistStale({
        lastImportCompletedAt: new Date("2026-03-05T12:00:00.000Z"),
        now: new Date("2026-04-01T00:00:00.000Z"),
        timezone: "UTC",
      }),
    ).toBe(false);
  });

  it("uses calendar months, not a fixed 90-day count", () => {
    // March (31) + April (30) + May (31) = 92 days to 5 June, proving the
    // threshold isn't simply "90 days after import".
    const lastImportCompletedAt = new Date("2026-03-05T12:00:00.000Z");
    const ninetyDaysLater = new Date(
      lastImportCompletedAt.getTime() + 90 * 24 * 60 * 60 * 1000,
    );
    expect(
      isWatchlistStale({
        lastImportCompletedAt,
        now: ninetyDaysLater,
        timezone: "UTC",
      }),
    ).toBe(false);
  });

  it("evaluates the boundary in the user's timezone, not UTC", () => {
    // 2026-03-05T23:30 UTC is already 2026-03-06 local in a UTC+1 zone, so
    // the three-month mark shifts a day later than a naive UTC comparison.
    const lastImportCompletedAt = new Date("2026-03-05T23:30:00.000Z");
    const justAfterUtcJune5 = new Date("2026-06-05T23:00:00.000Z"); // 2026-06-06T00:00 in Europe/Paris
    expect(
      isWatchlistStale({
        lastImportCompletedAt,
        now: justAfterUtcJune5,
        timezone: "Europe/Paris",
      }),
    ).toBe(false);
  });
});
