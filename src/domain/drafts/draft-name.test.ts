import { describe, expect, it } from "vitest";
import { getDefaultDraftName, getDraftDisplayName } from "./draft-name";

describe("getDefaultDraftName", () => {
  it("formats as <Month> <Difficulty> Draft, using the draft's own month", () => {
    expect(
      getDefaultDraftName({
        startedAt: "2026-08-15T00:00:00.000Z",
        timezone: "UTC",
        difficulty: "easy",
      }),
    ).toBe("August Easy Draft");
  });

  it("uses the difficulty's display label, not the raw id", () => {
    expect(
      getDefaultDraftName({
        startedAt: "2026-01-05T00:00:00.000Z",
        timezone: "UTC",
        difficulty: "hardcore",
      }),
    ).toBe("January Hardcore Draft");
  });

  it("evaluates the month in the draft's own timezone, not UTC or the system clock", () => {
    // 2026-01-31 23:30 UTC is already February in a UTC+something zone —
    // must report January, since that's this draft's actual timezone.
    expect(
      getDefaultDraftName({
        startedAt: "2026-01-31T23:30:00.000Z",
        timezone: "UTC",
        difficulty: "baby",
      }),
    ).toBe("January Baby Draft");
    expect(
      getDefaultDraftName({
        startedAt: "2026-01-31T23:30:00.000Z",
        timezone: "Pacific/Kiritimati", // UTC+14 — already Feb 1st there.
        difficulty: "baby",
      }),
    ).toBe("February Baby Draft");
  });
});

describe("getDraftDisplayName", () => {
  it("uses the generated default when no custom name is set", () => {
    expect(
      getDraftDisplayName({
        customName: null,
        startedAt: "2026-08-15T00:00:00.000Z",
        timezone: "UTC",
        difficulty: "medium",
      }),
    ).toBe("August Medium Draft");
  });

  it("uses the custom name when one is set, instead of the generated default", () => {
    expect(
      getDraftDisplayName({
        customName: "Summer Blockbusters",
        startedAt: "2026-08-15T00:00:00.000Z",
        timezone: "UTC",
        difficulty: "medium",
      }),
    ).toBe("Summer Blockbusters");
  });
});
