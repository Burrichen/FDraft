import { describe, expect, it } from "vitest";
import {
  getAvailabilityCycleId,
  getNextOccurrenceStart,
  isEventAvailable,
} from "./event-availability";

describe("isEventAvailable", () => {
  it("no fixed window and no recurring months — never naturally available (manual-only)", () => {
    expect(
      isEventAvailable(
        {
          startsAt: null,
          endsAt: null,
          recurringMonths: null,
          recurringMonthDayRange: null,
        },
        new Date("2026-06-15T00:00:00.000Z"),
        "UTC",
      ),
    ).toBe(false);
  });

  it("recurringMonths: matches when the current month (in the given timezone) is included", () => {
    const availability = {
      startsAt: null,
      endsAt: null,
      recurringMonths: [1],
      recurringMonthDayRange: null,
    };
    expect(
      isEventAvailable(
        availability,
        new Date("2026-01-15T12:00:00.000Z"),
        "UTC",
      ),
    ).toBe(true);
    expect(
      isEventAvailable(
        availability,
        new Date("2026-06-15T12:00:00.000Z"),
        "UTC",
      ),
    ).toBe(false);
  });

  it("recurringMonths is evaluated in the given timezone, not UTC", () => {
    const availability = {
      startsAt: null,
      endsAt: null,
      recurringMonths: [1],
      recurringMonthDayRange: null,
    };
    // 2026-01-31 23:30 UTC is already 2026-02-01 in UTC+1 (e.g. much of
    // Europe in winter is actually UTC+0/+1 — pick an offset that
    // unambiguously crosses the month boundary either way).
    expect(
      isEventAvailable(
        availability,
        new Date("2026-01-31T23:30:00.000Z"),
        "Pacific/Kiritimati", // UTC+14 — already February 1st there.
      ),
    ).toBe(false);
    expect(
      isEventAvailable(
        availability,
        new Date("2026-02-01T00:30:00.000Z"),
        "Pacific/Kiritimati",
      ),
    ).toBe(false);
    expect(
      isEventAvailable(
        availability,
        new Date("2026-01-01T00:30:00.000Z"),
        "Pacific/Kiritimati",
      ),
    ).toBe(true);
  });

  it("recurringMonths supports more than one month", () => {
    const availability = {
      startsAt: null,
      endsAt: null,
      recurringMonths: [6, 7, 8],
      recurringMonthDayRange: null,
    };
    expect(
      isEventAvailable(
        availability,
        new Date("2026-07-04T00:00:00.000Z"),
        "UTC",
      ),
    ).toBe(true);
    expect(
      isEventAvailable(
        availability,
        new Date("2026-12-25T00:00:00.000Z"),
        "UTC",
      ),
    ).toBe(false);
  });

  it("a fixed startsAt/endsAt window applies when recurringMonths is absent", () => {
    const availability = {
      startsAt: "2026-03-01T00:00:00.000Z",
      endsAt: "2026-03-15T00:00:00.000Z",
      recurringMonths: null,
      recurringMonthDayRange: null,
    };
    expect(
      isEventAvailable(
        availability,
        new Date("2026-02-28T23:59:59.000Z"),
        "UTC",
      ),
    ).toBe(false);
    expect(
      isEventAvailable(
        availability,
        new Date("2026-03-10T00:00:00.000Z"),
        "UTC",
      ),
    ).toBe(true);
    expect(
      isEventAvailable(
        availability,
        new Date("2026-03-15T00:00:00.000Z"),
        "UTC",
      ),
    ).toBe(false); // endsAt is exclusive
  });

  it("an open-ended fixed window (only startsAt or only endsAt) works", () => {
    const startOnly = {
      startsAt: "2026-03-01T00:00:00.000Z",
      endsAt: null,
      recurringMonths: null,
      recurringMonthDayRange: null,
    };
    expect(
      isEventAvailable(startOnly, new Date("2026-01-01T00:00:00.000Z"), "UTC"),
    ).toBe(false);
    expect(
      isEventAvailable(startOnly, new Date("2027-01-01T00:00:00.000Z"), "UTC"),
    ).toBe(true);

    const endOnly = {
      startsAt: null,
      endsAt: "2026-03-01T00:00:00.000Z",
      recurringMonths: null,
      recurringMonthDayRange: null,
    };
    expect(
      isEventAvailable(endOnly, new Date("2020-01-01T00:00:00.000Z"), "UTC"),
    ).toBe(true);
    expect(
      isEventAvailable(endOnly, new Date("2026-03-01T00:00:00.000Z"), "UTC"),
    ).toBe(false);
  });
});

describe("isEventAvailable — recurringMonthDayRange (25–31 January, event system Prompt 14)", () => {
  const availability = {
    startsAt: null,
    endsAt: null,
    recurringMonths: null,
    recurringMonthDayRange: {
      startMonth: 1,
      startDay: 25,
      endMonth: 1,
      endDay: 31,
    },
  };

  it("matches on the first day of the range, inclusive", () => {
    expect(
      isEventAvailable(
        availability,
        new Date("2026-01-25T00:00:00.000Z"),
        "UTC",
      ),
    ).toBe(true);
  });

  it("matches on the last day of the range, inclusive — all of 31 January counts", () => {
    expect(
      isEventAvailable(
        availability,
        new Date("2026-01-31T23:59:59.000Z"),
        "UTC",
      ),
    ).toBe(true);
  });

  it("does not match the day before the range starts (24 January)", () => {
    expect(
      isEventAvailable(
        availability,
        new Date("2026-01-24T23:59:59.000Z"),
        "UTC",
      ),
    ).toBe(false);
  });

  it("does not match the day after the range ends (1 February) — the exclusive boundary", () => {
    expect(
      isEventAvailable(
        availability,
        new Date("2026-02-01T00:00:00.000Z"),
        "UTC",
      ),
    ).toBe(false);
  });

  it("does not match a month entirely outside the range", () => {
    expect(
      isEventAvailable(
        availability,
        new Date("2026-06-15T00:00:00.000Z"),
        "UTC",
      ),
    ).toBe(false);
  });

  it("is evaluated in the given timezone, not UTC — already 25 January further east while still 24 January in UTC", () => {
    const instant = new Date("2026-01-24T20:00:00.000Z");
    expect(isEventAvailable(availability, instant, "Pacific/Kiritimati")).toBe(
      true, // UTC+14 — already 2026-01-25 10:00 there.
    );
    expect(isEventAvailable(availability, instant, "UTC")).toBe(false);
  });

  it("is evaluated in the given timezone, not UTC — already 1 February further east while still 31 January in UTC", () => {
    const instant = new Date("2026-01-31T20:00:00.000Z");
    expect(isEventAvailable(availability, instant, "Pacific/Kiritimati")).toBe(
      false, // UTC+14 — already 2026-02-01 10:00 there.
    );
    expect(isEventAvailable(availability, instant, "UTC")).toBe(true);
  });

  it("takes priority over recurringMonths when a definition somehow sets both", () => {
    const both = {
      startsAt: null,
      endsAt: null,
      recurringMonths: [1], // would match the whole month on its own
      recurringMonthDayRange: {
        startMonth: 1,
        startDay: 25,
        endMonth: 1,
        endDay: 31,
      },
    };
    // 10 January is within recurringMonths' whole-month window but outside
    // the day range — the day range wins, so this is unavailable.
    expect(
      isEventAvailable(both, new Date("2026-01-10T00:00:00.000Z"), "UTC"),
    ).toBe(false);
  });
});

describe("getAvailabilityCycleId", () => {
  it("recurringMonths: identifies the occurrence by the profile's local year", () => {
    const availability = {
      startsAt: null,
      endsAt: null,
      recurringMonths: [1],
      recurringMonthDayRange: null,
    };
    expect(
      getAvailabilityCycleId(
        availability,
        new Date("2026-01-15T00:00:00.000Z"),
        "UTC",
      ),
    ).toBe("2026");
    expect(
      getAvailabilityCycleId(
        availability,
        new Date("2027-01-15T00:00:00.000Z"),
        "UTC",
      ),
    ).toBe("2027");
  });

  it("recurringMonths: evaluated in the given timezone, not UTC", () => {
    const availability = {
      startsAt: null,
      endsAt: null,
      recurringMonths: [1],
      recurringMonthDayRange: null,
    };
    expect(
      getAvailabilityCycleId(
        availability,
        new Date("2026-12-31T23:30:00.000Z"),
        "Pacific/Kiritimati", // UTC+14 — already 2027-01-01 there.
      ),
    ).toBe("2027");
  });

  it("a fixed window's cycle id is its own startsAt — never repeats", () => {
    const availability = {
      startsAt: "2026-03-01T00:00:00.000Z",
      endsAt: "2026-03-15T00:00:00.000Z",
      recurringMonths: null,
      recurringMonthDayRange: null,
    };
    expect(
      getAvailabilityCycleId(
        availability,
        new Date("2026-03-10T00:00:00.000Z"),
        "UTC",
      ),
    ).toBe("2026-03-01T00:00:00.000Z");
  });

  it("no natural window at all — no cycle to identify", () => {
    const availability = {
      startsAt: null,
      endsAt: null,
      recurringMonths: null,
      recurringMonthDayRange: null,
    };
    expect(
      getAvailabilityCycleId(
        availability,
        new Date("2026-03-10T00:00:00.000Z"),
        "UTC",
      ),
    ).toBeNull();
  });

  it("an end-only fixed window has no startsAt to key off of — no cycle id", () => {
    const availability = {
      startsAt: null,
      endsAt: "2026-03-01T00:00:00.000Z",
      recurringMonths: null,
      recurringMonthDayRange: null,
    };
    expect(
      getAvailabilityCycleId(
        availability,
        new Date("2026-01-01T00:00:00.000Z"),
        "UTC",
      ),
    ).toBeNull();
  });
});

describe("getAvailabilityCycleId — recurringMonthDayRange", () => {
  const availability = {
    startsAt: null,
    endsAt: null,
    recurringMonths: null,
    recurringMonthDayRange: {
      startMonth: 1,
      startDay: 25,
      endMonth: 1,
      endDay: 31,
    },
  };

  it("identifies the occurrence by the profile's local year", () => {
    expect(
      getAvailabilityCycleId(
        availability,
        new Date("2026-01-27T00:00:00.000Z"),
        "UTC",
      ),
    ).toBe("2026");
    expect(
      getAvailabilityCycleId(
        availability,
        new Date("2027-01-27T00:00:00.000Z"),
        "UTC",
      ),
    ).toBe("2027");
  });

  it("is evaluated in the given timezone, not UTC", () => {
    expect(
      getAvailabilityCycleId(
        availability,
        new Date("2026-01-24T20:00:00.000Z"), // already 2026-01-25 in UTC+14
        "Pacific/Kiritimati",
      ),
    ).toBe("2026");
  });
});

describe("isEventAvailable — recurringMonthDayRange with hour/minute precision (Halloween, PROMPT 18)", () => {
  // 30 September 19:00 through 1 November 00:00, exclusive — Halloween's
  // real, permanent natural window (see event-registry.ts).
  const availability = {
    startsAt: null,
    endsAt: null,
    recurringMonths: null,
    recurringMonthDayRange: {
      startMonth: 9,
      startDay: 30,
      startHour: 19,
      startMinute: 0,
      endMonth: 11,
      endDay: 1,
      endHour: 0,
      endMinute: 0,
    },
  };

  it("is NOT available at 30 September 18:59", () => {
    expect(
      isEventAvailable(
        availability,
        new Date("2026-09-30T18:59:00.000Z"),
        "UTC",
      ),
    ).toBe(false);
  });

  it("IS available at exactly 30 September 19:00 — the inclusive start", () => {
    expect(
      isEventAvailable(
        availability,
        new Date("2026-09-30T19:00:00.000Z"),
        "UTC",
      ),
    ).toBe(true);
  });

  it("is available on 1 October", () => {
    expect(
      isEventAvailable(
        availability,
        new Date("2026-10-01T12:00:00.000Z"),
        "UTC",
      ),
    ).toBe(true);
  });

  it("is available on 31 October, right up to 23:59", () => {
    expect(
      isEventAvailable(
        availability,
        new Date("2026-10-31T23:59:00.000Z"),
        "UTC",
      ),
    ).toBe(true);
  });

  it("is NOT available at exactly 1 November 00:00 — the exclusive end", () => {
    expect(
      isEventAvailable(
        availability,
        new Date("2026-11-01T00:00:00.000Z"),
        "UTC",
      ),
    ).toBe(false);
  });

  it("is evaluated in the profile's own timezone, not UTC", () => {
    // 30 September 18:30 UTC is already 19:30 in a UTC+1 zone — available
    // there, not yet in UTC.
    const instant = new Date("2026-09-30T18:30:00.000Z");
    expect(isEventAvailable(availability, instant, "Europe/Paris")).toBe(true);
    expect(isEventAvailable(availability, instant, "UTC")).toBe(false);
  });

  it("absent hour/minute fields (e.g. January's range) still behave exactly as whole-day-inclusive", () => {
    const dayOnly = {
      startsAt: null,
      endsAt: null,
      recurringMonths: null,
      recurringMonthDayRange: {
        startMonth: 1,
        startDay: 25,
        endMonth: 1,
        endDay: 31,
      },
    };
    expect(
      isEventAvailable(dayOnly, new Date("2026-01-25T00:00:00.000Z"), "UTC"),
    ).toBe(true);
    expect(
      isEventAvailable(dayOnly, new Date("2026-01-31T23:59:59.000Z"), "UTC"),
    ).toBe(true);
    expect(
      isEventAvailable(dayOnly, new Date("2026-02-01T00:00:00.000Z"), "UTC"),
    ).toBe(false);
  });
});

describe("getNextOccurrenceStart", () => {
  const halloween = {
    startsAt: null,
    endsAt: null,
    recurringMonths: null,
    recurringMonthDayRange: {
      startMonth: 9,
      startDay: 30,
      startHour: 19,
      startMinute: 0,
      endMonth: 11,
      endDay: 1,
      endHour: 0,
      endMinute: 0,
    },
  };

  it("returns this year's start when it's still ahead of now", () => {
    const next = getNextOccurrenceStart(
      halloween,
      new Date("2026-06-15T00:00:00.000Z"),
      "UTC",
    );
    expect(next).toEqual(new Date("2026-09-30T19:00:00.000Z"));
  });

  it("rolls forward to next year's start once this year's window has already passed", () => {
    const next = getNextOccurrenceStart(
      halloween,
      new Date("2026-12-01T00:00:00.000Z"),
      "UTC",
    );
    expect(next).toEqual(new Date("2027-09-30T19:00:00.000Z"));
  });

  it("rolls forward while the window is currently active too — there's no 'next' during it", () => {
    const next = getNextOccurrenceStart(
      halloween,
      new Date("2026-10-15T00:00:00.000Z"),
      "UTC",
    );
    expect(next).toEqual(new Date("2027-09-30T19:00:00.000Z"));
  });

  it("is computed in the profile's own timezone", () => {
    const next = getNextOccurrenceStart(
      halloween,
      new Date("2026-06-15T00:00:00.000Z"),
      "America/New_York",
    );
    // 19:00 America/New_York on 30 Sep 2026 (EDT, UTC-4) is 23:00 UTC.
    expect(next).toEqual(new Date("2026-09-30T23:00:00.000Z"));
  });

  it("returns null for an availability shape with no recurringMonthDayRange", () => {
    expect(
      getNextOccurrenceStart(
        {
          startsAt: null,
          endsAt: null,
          recurringMonths: [6, 7, 8],
          recurringMonthDayRange: null,
        },
        new Date("2026-06-15T00:00:00.000Z"),
        "UTC",
      ),
    ).toBeNull();
  });
});
