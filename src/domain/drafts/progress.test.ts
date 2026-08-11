import { describe, expect, it } from "vitest";
import {
  calculateDraftFilmProgress,
  calculateDraftTimeProgress,
} from "./progress";

describe("calculateDraftTimeProgress", () => {
  it("just created: 0% elapsed, full days remaining, not expired", () => {
    const startedAt = new Date("2026-01-01T00:00:00.000Z");
    const deadlineAt = new Date("2026-01-31T00:00:00.000Z"); // 30 days
    const result = calculateDraftTimeProgress({
      now: startedAt,
      startedAt,
      deadlineAt,
      timezone: "UTC",
    });
    expect(result).toMatchObject({
      daysRemaining: 30,
      percentElapsed: 0,
      isExpired: false,
      isFinalDay: false,
    });
  });

  it("midway: ~50% elapsed", () => {
    const startedAt = new Date("2026-01-01T00:00:00.000Z");
    const deadlineAt = new Date("2026-01-31T00:00:00.000Z");
    const now = new Date("2026-01-16T00:00:00.000Z"); // 15 of 30 days
    const result = calculateDraftTimeProgress({
      now,
      startedAt,
      deadlineAt,
      timezone: "UTC",
    });
    expect(result.percentElapsed).toBe(50);
    expect(result.isExpired).toBe(false);
  });

  it("final day: now falls on the same local calendar day as the deadline", () => {
    const startedAt = new Date("2026-01-01T00:00:00.000Z");
    const deadlineAt = new Date("2026-01-31T23:59:59.999Z");
    const now = new Date("2026-01-31T08:00:00.000Z");
    const result = calculateDraftTimeProgress({
      now,
      startedAt,
      deadlineAt,
      timezone: "UTC",
    });
    expect(result.isFinalDay).toBe(true);
    expect(result.isExpired).toBe(false);
    expect(result.daysRemaining).toBe(1);
  });

  it("expired: now is past the deadline", () => {
    const startedAt = new Date("2026-01-01T00:00:00.000Z");
    const deadlineAt = new Date("2026-01-31T00:00:00.000Z");
    const now = new Date("2026-02-05T00:00:00.000Z");
    const result = calculateDraftTimeProgress({
      now,
      startedAt,
      deadlineAt,
      timezone: "UTC",
    });
    expect(result.isExpired).toBe(true);
    expect(result.daysRemaining).toBe(0);
    expect(result.percentElapsed).toBe(100);
    expect(result.isFinalDay).toBe(false);
  });

  it("boundary: exactly at the deadline instant counts as expired", () => {
    const startedAt = new Date("2026-01-01T00:00:00.000Z");
    const deadlineAt = new Date("2026-01-31T00:00:00.000Z");
    const result = calculateDraftTimeProgress({
      now: deadlineAt,
      startedAt,
      deadlineAt,
      timezone: "UTC",
    });
    expect(result.isExpired).toBe(true);
    expect(result.daysRemaining).toBe(0);
  });

  it("timezone boundary: the same UTC instant is or isn't the deadline's local day depending on timezone", () => {
    // Deadline is 2026-01-31 23:59:59 UTC. In UTC-8 (Los Angeles, winter), that
    // instant is still 2026-01-31 locally right up to the boundary, but an
    // instant a few hours earlier that's still Jan 31 in UTC is Jan 30 locally.
    const startedAt = new Date("2026-01-01T00:00:00.000Z");
    const deadlineAt = new Date("2026-01-31T23:59:59.000Z");
    const now = new Date("2026-01-31T04:00:00.000Z"); // Jan 30, 20:00 in America/Los_Angeles

    const utcResult = calculateDraftTimeProgress({
      now,
      startedAt,
      deadlineAt,
      timezone: "UTC",
    });
    const laResult = calculateDraftTimeProgress({
      now,
      startedAt,
      deadlineAt,
      timezone: "America/Los_Angeles",
    });

    expect(utcResult.isFinalDay).toBe(true);
    expect(laResult.isFinalDay).toBe(false);
  });

  it("does not divide by zero when startedAt equals deadlineAt", () => {
    const instant = new Date("2026-01-01T00:00:00.000Z");
    const result = calculateDraftTimeProgress({
      now: instant,
      startedAt: instant,
      deadlineAt: instant,
      timezone: "UTC",
    });
    expect(result.percentElapsed).toBe(100);
    expect(result.isExpired).toBe(true);
    expect(Number.isNaN(result.percentElapsed)).toBe(false);
  });

  it("never reports a negative days-remaining once expired", () => {
    const startedAt = new Date("2026-01-01T00:00:00.000Z");
    const deadlineAt = new Date("2026-01-31T00:00:00.000Z");
    const now = new Date("2027-01-01T00:00:00.000Z"); // a full year late
    const result = calculateDraftTimeProgress({
      now,
      startedAt,
      deadlineAt,
      timezone: "UTC",
    });
    expect(result.daysRemaining).toBe(0);
  });

  it("rounds up partial days remaining (e.g. 12 hours left reads as 1 day)", () => {
    const startedAt = new Date("2026-01-01T00:00:00.000Z");
    const deadlineAt = new Date("2026-01-31T00:00:00.000Z");
    const now = new Date("2026-01-30T12:00:00.000Z");
    const result = calculateDraftTimeProgress({
      now,
      startedAt,
      deadlineAt,
      timezone: "UTC",
    });
    expect(result.daysRemaining).toBe(1);
  });
});

describe("calculateDraftFilmProgress", () => {
  it("just created: 0 watched of the total", () => {
    const result = calculateDraftFilmProgress(0, 10);
    expect(result).toEqual({
      watchedCount: 0,
      totalCount: 10,
      percentWatched: 0,
      isFullyWatched: false,
    });
  });

  it("partial progress rounds to the nearest percent", () => {
    const result = calculateDraftFilmProgress(1, 3);
    expect(result.percentWatched).toBe(33);
    expect(result.isFullyWatched).toBe(false);
  });

  it("completed early: every film watched", () => {
    const result = calculateDraftFilmProgress(10, 10);
    expect(result.percentWatched).toBe(100);
    expect(result.isFullyWatched).toBe(true);
  });

  it("does not divide by zero for a draft with no items", () => {
    const result = calculateDraftFilmProgress(0, 0);
    expect(result.percentWatched).toBe(0);
    expect(result.isFullyWatched).toBe(false);
    expect(Number.isNaN(result.percentWatched)).toBe(false);
  });
});
