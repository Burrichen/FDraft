import { describe, expect, it } from "vitest";
import {
  calculateDraftFilmProgress,
  calculateDraftTimeProgress,
} from "./progress";

describe("calculateDraftTimeProgress — timer mode", () => {
  it("just created: 0% elapsed, full days remaining, not expired", () => {
    const startedAt = new Date("2026-01-01T00:00:00.000Z");
    const deadlineAt = new Date("2026-01-31T00:00:00.000Z"); // 30 days
    const result = calculateDraftTimeProgress({
      mode: "timer",
      now: startedAt,
      startedAt,
      deadlineAt,
      timezone: "UTC",
    });
    expect(result).toMatchObject({
      daysRemaining: 30,
      percentElapsed: 0,
      percentRemaining: 100,
      isExpired: false,
      isFinalDay: false,
    });
  });

  it("midway: ~50% elapsed", () => {
    const startedAt = new Date("2026-01-01T00:00:00.000Z");
    const deadlineAt = new Date("2026-01-31T00:00:00.000Z");
    const now = new Date("2026-01-16T00:00:00.000Z"); // 15 of 30 days
    const result = calculateDraftTimeProgress({
      mode: "timer",
      now,
      startedAt,
      deadlineAt,
      timezone: "UTC",
    });
    expect(result.percentElapsed).toBe(50);
    expect(result.percentRemaining).toBe(50);
    expect(result.isExpired).toBe(false);
  });

  it("final day: now falls on the same local calendar day as the deadline", () => {
    const startedAt = new Date("2026-01-01T00:00:00.000Z");
    const deadlineAt = new Date("2026-01-31T23:59:59.999Z");
    const now = new Date("2026-01-31T08:00:00.000Z");
    const result = calculateDraftTimeProgress({
      mode: "timer",
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
      mode: "timer",
      now,
      startedAt,
      deadlineAt,
      timezone: "UTC",
    });
    expect(result.isExpired).toBe(true);
    expect(result.daysRemaining).toBe(0);
    expect(result.percentElapsed).toBe(100);
    expect(result.percentRemaining).toBe(0);
    expect(result.isFinalDay).toBe(false);
  });

  it("boundary: exactly at the deadline instant counts as expired", () => {
    const startedAt = new Date("2026-01-01T00:00:00.000Z");
    const deadlineAt = new Date("2026-01-31T00:00:00.000Z");
    const result = calculateDraftTimeProgress({
      mode: "timer",
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
      mode: "timer",
      now,
      startedAt,
      deadlineAt,
      timezone: "UTC",
    });
    const laResult = calculateDraftTimeProgress({
      mode: "timer",
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
      mode: "timer",
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
      mode: "timer",
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
      mode: "timer",
      now,
      startedAt,
      deadlineAt,
      timezone: "UTC",
    });
    expect(result.daysRemaining).toBe(1);
  });
});

describe("calculateDraftTimeProgress — calendar mode", () => {
  // Deadline is always the end of the calendar month (23:59:59.999 local),
  // exactly what `calculateDraftDeadline` persists — see deadline.ts.
  const deadlineAt = new Date("2026-08-31T23:59:59.999Z");

  it("regression: a draft created partway through the month is NOT stuck at 0% just because it was created late (see docs/product-spec.md, 'Draft Time Mode')", () => {
    // Created on the 11th — the exact scenario from the bug report.
    const startedAt = new Date("2026-08-11T09:00:00.000Z");
    const now = startedAt;
    const result = calculateDraftTimeProgress({
      mode: "calendar",
      now,
      startedAt,
      deadlineAt,
      timezone: "UTC",
    });
    expect(result.percentElapsed).toBeGreaterThan(0);
  });

  it("August 1st: approximately 0% through the month", () => {
    const startedAt = new Date("2026-08-01T00:00:00.000Z");
    const result = calculateDraftTimeProgress({
      mode: "calendar",
      now: startedAt,
      startedAt,
      deadlineAt,
      timezone: "UTC",
    });
    expect(result.percentElapsed).toBe(0);
  });

  it("August 11th: approximately one-third through the month, regardless of when the draft was actually created", () => {
    const now = new Date("2026-08-11T00:00:00.000Z");

    const createdEarly = calculateDraftTimeProgress({
      mode: "calendar",
      now,
      startedAt: new Date("2026-08-01T00:00:00.000Z"),
      deadlineAt,
      timezone: "UTC",
    });
    const createdLate = calculateDraftTimeProgress({
      mode: "calendar",
      now,
      startedAt: new Date("2026-08-11T00:00:00.000Z"),
      deadlineAt,
      timezone: "UTC",
    });

    expect(createdEarly.percentElapsed).toBeGreaterThanOrEqual(30);
    expect(createdEarly.percentElapsed).toBeLessThanOrEqual(35);
    // Progress depends only on the calendar month and `now` — not on when
    // the draft itself was created.
    expect(createdLate.percentElapsed).toBe(createdEarly.percentElapsed);
  });

  it("August 31st: approaching/at 100% through the month", () => {
    const now = new Date("2026-08-31T20:00:00.000Z");
    const result = calculateDraftTimeProgress({
      mode: "calendar",
      now,
      startedAt: new Date("2026-08-11T00:00:00.000Z"),
      deadlineAt,
      timezone: "UTC",
    });
    expect(result.percentElapsed).toBeGreaterThanOrEqual(95);
  });

  it("uses the calendar month in the draft's own timezone, not UTC", () => {
    // "End of August, local time" is a different UTC instant depending on
    // the timezone: 23:59:59.999 NZST (UTC+12) is 11:59:59.999 UTC the same
    // day, twelve hours earlier than the plain-UTC deadline used elsewhere
    // in this file — so the two months' start-of-month instants (and thus
    // the elapsed-percentage math) diverge too.
    const aucklandDeadline = new Date("2026-08-31T11:59:59.999Z");
    const now = new Date("2026-08-15T00:00:00.000Z");

    const utcResult = calculateDraftTimeProgress({
      mode: "calendar",
      now,
      startedAt: new Date("2026-08-15T00:00:00.000Z"),
      deadlineAt,
      timezone: "UTC",
    });
    const aucklandResult = calculateDraftTimeProgress({
      mode: "calendar",
      now,
      startedAt: new Date("2026-08-15T00:00:00.000Z"),
      deadlineAt: aucklandDeadline,
      timezone: "Pacific/Auckland",
    });

    expect(utcResult.percentElapsed).not.toBe(aucklandResult.percentElapsed);
  });

  it("daysRemaining and isExpired are unaffected by the progress-window change — they're always measured from `now` to the deadline", () => {
    const startedAt = new Date("2026-08-11T00:00:00.000Z");
    const now = new Date("2026-08-30T00:00:00.000Z");
    const result = calculateDraftTimeProgress({
      mode: "calendar",
      now,
      startedAt,
      deadlineAt,
      timezone: "UTC",
    });
    expect(result.daysRemaining).toBe(2);
    expect(result.isExpired).toBe(false);
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
