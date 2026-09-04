import { describe, expect, it } from "vitest";
import {
  getDefaultDraftName,
  getDraftDisplayName,
  getHalloweenDraftDisplayName,
} from "./draft-name";

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
        sourceEventId: null,
        eventOccurrenceYear: null,
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
        sourceEventId: null,
        eventOccurrenceYear: null,
      }),
    ).toBe("Summer Blockbusters");
  });

  it("uses the canonical Halloween title for a Halloween draft, ignoring any custom name", () => {
    expect(
      getDraftDisplayName({
        customName: "My Spooky Picks",
        startedAt: "2026-10-15T00:00:00.000Z",
        timezone: "UTC",
        difficulty: "baby",
        sourceEventId: "halloween",
        eventOccurrenceYear: 2026,
      }),
    ).toBe("Halloween 2026 Draft");
  });

  it("uses the canonical Halloween title even with no custom name, never the generated <Month> <Difficulty> Draft form", () => {
    expect(
      getDraftDisplayName({
        customName: null,
        startedAt: "2026-10-15T00:00:00.000Z",
        timezone: "UTC",
        difficulty: "baby",
        sourceEventId: "halloween",
        eventOccurrenceYear: 2026,
      }),
    ).toBe("Halloween 2026 Draft");
  });
});

describe("getHalloweenDraftDisplayName", () => {
  it("prefers the persisted eventOccurrenceYear over startedAt's own year", () => {
    // Simulates Admin Event Testing: the draft was created while an
    // October 2028 occurrence was simulated, but `startedAt` still records
    // the real (2026) system-clock instant — the persisted year must win.
    expect(
      getHalloweenDraftDisplayName({
        startedAt: "2026-09-04T12:00:00.000Z",
        timezone: "UTC",
        eventOccurrenceYear: 2028,
      }),
    ).toBe("Halloween 2028 Draft");
  });

  it("falls back to startedAt's own year for a legacy draft with no persisted year", () => {
    expect(
      getHalloweenDraftDisplayName({
        startedAt: "2026-10-15T00:00:00.000Z",
        timezone: "UTC",
        eventOccurrenceYear: null,
      }),
    ).toBe("Halloween 2026 Draft");
  });

  it("evaluates the fallback year in the draft's own timezone, not UTC", () => {
    // 2026-12-31 23:30 UTC is already 2027 in a UTC+something zone.
    expect(
      getHalloweenDraftDisplayName({
        startedAt: "2026-12-31T23:30:00.000Z",
        timezone: "Pacific/Kiritimati",
        eventOccurrenceYear: null,
      }),
    ).toBe("Halloween 2027 Draft");
  });
});
