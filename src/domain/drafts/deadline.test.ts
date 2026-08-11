import { describe, expect, it } from "vitest";
import { calculateDraftDeadline, TIMER_MODE_DURATION_DAYS } from "./deadline";

describe("calculateDraftDeadline — timer mode", () => {
  it("is exactly 30 days after the start instant", () => {
    const startedAt = new Date("2026-01-05T10:15:00.000Z");
    const deadline = calculateDraftDeadline({
      timeMode: "timer",
      startedAt,
      timezone: "UTC",
    });
    const diffMs = deadline.getTime() - startedAt.getTime();
    expect(diffMs).toBe(TIMER_MODE_DURATION_DAYS * 24 * 60 * 60 * 1000);
  });

  it("does not depend on timezone", () => {
    const startedAt = new Date("2026-06-15T00:00:00.000Z");
    const utc = calculateDraftDeadline({
      timeMode: "timer",
      startedAt,
      timezone: "UTC",
    });
    const tokyo = calculateDraftDeadline({
      timeMode: "timer",
      startedAt,
      timezone: "Asia/Tokyo",
    });
    expect(utc.getTime()).toBe(tokyo.getTime());
  });
});

describe("calculateDraftDeadline — calendar mode", () => {
  it("created 27 August ends at the end of 31 August, not 30 days later", () => {
    // UTC keeps the arithmetic easy to reason about for this example from
    // the spec, and is exercised precisely (with a real IANA zone and its
    // offset) by the America/New_York case below.
    const startedAt = new Date("2026-08-27T09:00:00.000Z");
    const deadline = calculateDraftDeadline({
      timeMode: "calendar",
      startedAt,
      timezone: "UTC",
    });
    expect(deadline.toISOString()).toBe("2026-08-31T23:59:59.999Z");
  });

  it("resolves the last instant of the month in a non-UTC timezone (EST, no DST in February)", () => {
    // 2026-02-15 12:00 UTC is 2026-02-15 07:00 America/New_York (UTC-5).
    const startedAt = new Date("2026-02-15T12:00:00.000Z");
    const deadline = calculateDraftDeadline({
      timeMode: "calendar",
      startedAt,
      timezone: "America/New_York",
    });
    // Feb 28 2026 23:59:59.999 EST (UTC-5) = Mar 1 2026 04:59:59.999 UTC.
    expect(deadline.toISOString()).toBe("2026-03-01T04:59:59.999Z");
  });

  it("accounts for leap years", () => {
    const startedAt = new Date("2028-02-01T00:00:00.000Z");
    const deadline = calculateDraftDeadline({
      timeMode: "calendar",
      startedAt,
      timezone: "UTC",
    });
    expect(deadline.getUTCDate()).toBe(29);
  });

  it("a draft created on the first of the month still only runs to that month's end", () => {
    const startedAt = new Date("2026-04-01T00:00:00.000Z");
    const deadline = calculateDraftDeadline({
      timeMode: "calendar",
      startedAt,
      timezone: "UTC",
    });
    expect(deadline.toISOString()).toBe("2026-04-30T23:59:59.999Z");
  });

  it("two users in different timezones creating a draft at the same instant get different UTC deadlines", () => {
    const startedAt = new Date("2026-08-27T09:00:00.000Z");
    const london = calculateDraftDeadline({
      timeMode: "calendar",
      startedAt,
      timezone: "Europe/London",
    });
    const tokyo = calculateDraftDeadline({
      timeMode: "calendar",
      startedAt,
      timezone: "Asia/Tokyo",
    });
    expect(london.getTime()).not.toBe(tokyo.getTime());
  });
});
