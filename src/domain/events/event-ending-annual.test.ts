import { describe, expect, it } from "vitest";
import {
  computeEventAnnualNumber,
  formatOrdinal,
  getOrdinalSuffix,
  resolveEventEndingSecondaryMessage,
} from "./event-ending-annual";

describe("getOrdinalSuffix / formatOrdinal", () => {
  it.each([
    [1, "st"],
    [2, "nd"],
    [3, "rd"],
    [4, "th"],
    [10, "th"],
    [11, "th"],
    [12, "th"],
    [13, "th"],
    [21, "st"],
    [22, "nd"],
    [23, "rd"],
    [24, "th"],
    [101, "st"],
    [111, "th"],
    [112, "th"],
    [113, "th"],
    [121, "st"],
  ])("%i -> %s", (n, suffix) => {
    expect(getOrdinalSuffix(n)).toBe(suffix);
  });

  it("never produces a malformed suffix for 11/12/13 (EVENT SYSTEM — CURRENCY & EVENT-ENDING HARDENING §7)", () => {
    expect(formatOrdinal(11)).not.toBe("11st");
    expect(formatOrdinal(12)).not.toBe("12nd");
    expect(formatOrdinal(13)).not.toBe("13rd");
    expect(formatOrdinal(11)).toBe("11th");
    expect(formatOrdinal(12)).toBe("12th");
    expect(formatOrdinal(13)).toBe("13th");
  });

  it("formats the full ordinal string", () => {
    expect(formatOrdinal(1)).toBe("1st");
    expect(formatOrdinal(21)).toBe("21st");
    expect(formatOrdinal(13)).toBe("13th");
  });
});

describe("computeEventAnnualNumber — Halloween's exact canonical calculation (2026 = occurrence #1)", () => {
  it.each([
    [2026, 1],
    [2027, 2],
    [2028, 3],
    [2029, 4],
    [2036, 11],
    [2037, 12],
    [2038, 13],
    [2046, 21],
  ])("occurrence year %i -> annual number %i", (occurrenceYear, expected) => {
    expect(computeEventAnnualNumber(occurrenceYear, 2026)).toBe(expected);
  });

  it("returns null for an occurrence year that predates the founding year, rather than a nonsensical number", () => {
    expect(computeEventAnnualNumber(2025, 2026)).toBeNull();
    expect(computeEventAnnualNumber(1999, 2026)).toBeNull();
  });

  it("returns null for non-finite input", () => {
    expect(computeEventAnnualNumber(Number.NaN, 2026)).toBeNull();
  });
});

describe("resolveEventEndingSecondaryMessage — the exact §10/§16 rendered strings", () => {
  const ending = {
    secondaryMessageTemplate:
      "You survived the {ordinal} annual FDraft Halloween event.",
    foundingYear: 2026,
  };

  it.each([
    [2026, "You survived the 1st annual FDraft Halloween event."],
    [2027, "You survived the 2nd annual FDraft Halloween event."],
    [2028, "You survived the 3rd annual FDraft Halloween event."],
    [2029, "You survived the 4th annual FDraft Halloween event."],
    [2036, "You survived the 11th annual FDraft Halloween event."],
    [2037, "You survived the 12th annual FDraft Halloween event."],
    [2038, "You survived the 13th annual FDraft Halloween event."],
    [2046, "You survived the 21st annual FDraft Halloween event."],
  ])("occurrence year %i -> %s", (occurrenceYear, expected) => {
    expect(resolveEventEndingSecondaryMessage(ending, occurrenceYear)).toBe(
      expected,
    );
  });

  it("returns null when there's no template", () => {
    expect(
      resolveEventEndingSecondaryMessage({ foundingYear: 2026 }, 2026),
    ).toBeNull();
  });

  it("returns null when there's no foundingYear anchor (a future event ending config can omit it without error)", () => {
    expect(
      resolveEventEndingSecondaryMessage(
        { secondaryMessageTemplate: "You did it, {ordinal} time." },
        2026,
      ),
    ).toBeNull();
  });

  it("returns null when the occurrence year is unknown", () => {
    expect(resolveEventEndingSecondaryMessage(ending, null)).toBeNull();
  });

  it("returns null when the occurrence year predates the founding year", () => {
    expect(resolveEventEndingSecondaryMessage(ending, 2025)).toBeNull();
  });
});
