import { describe, expect, it } from "vitest";
import { describeFixedEventDeadline } from "./fixed-event-deadline-copy";

describe("describeFixedEventDeadline", () => {
  it("describes an exact-midnight end as the previous day at midnight", () => {
    expect(
      describeFixedEventDeadline(new Date("2026-11-01T00:00:00.000Z"), "UTC"),
    ).toBe("31 October at midnight");
  });

  it("describes a non-midnight end with its own time", () => {
    expect(
      describeFixedEventDeadline(new Date("2026-10-31T18:30:00.000Z"), "UTC"),
    ).toBe("31 October at 6:30 PM");
  });

  it("resolves against the given timezone, not UTC", () => {
    // 2026-11-01T00:00 UTC is still 31 October in a negative-offset zone.
    expect(
      describeFixedEventDeadline(
        new Date("2026-11-01T00:00:00.000Z"),
        "America/Los_Angeles",
      ),
    ).toBe("31 October at 5:00 PM");
  });
});
