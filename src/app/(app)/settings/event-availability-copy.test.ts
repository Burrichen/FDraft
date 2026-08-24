import { describe, expect, it } from "vitest";
import { HALLOWEEN_EVENT_ID } from "@/domain/events/event-registry";
import { getEventDefinition } from "@/domain/events/event-registry";
import { describeEventAvailabilityWindow } from "./event-availability-copy";

describe("describeEventAvailabilityWindow", () => {
  it("describes Halloween's window, displaying its midnight end as the previous day", () => {
    const halloween = getEventDefinition(HALLOWEEN_EVENT_ID)!;
    expect(describeEventAvailabilityWindow(halloween.availability)).toBe(
      "30 September, 7pm – 31 October",
    );
  });

  it("describes a day-only range (no hour set) with no time-of-day text", () => {
    expect(
      describeEventAvailabilityWindow({
        startsAt: null,
        endsAt: null,
        recurringMonths: null,
        recurringMonthDayRange: {
          startMonth: 1,
          startDay: 25,
          endMonth: 1,
          endDay: 31,
        },
      }),
    ).toBe("25 January – 31 January");
  });

  it("returns null for an event with no recurring window at all", () => {
    expect(
      describeEventAvailabilityWindow({
        startsAt: null,
        endsAt: null,
        recurringMonths: null,
        recurringMonthDayRange: null,
      }),
    ).toBeNull();
  });
});
