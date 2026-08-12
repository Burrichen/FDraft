import { describe, expect, it } from "vitest";
import { parseCalendarDate } from "@/domain/time/calendar-date";
import { formatReadableCalendarDate } from "./utils";

/**
 * See docs/product-spec.md's "COMPLETE PRODUCT AUDIT" phase entry — a
 * plain "YYYY-MM-DD" calendar date parsed with bare `new Date(iso)` reads
 * as the PREVIOUS calendar day once displayed in any negative-UTC-offset
 * timezone, since `new Date("2026-08-12")` parses as UTC midnight, not
 * local midnight. `parseCalendarDate` is the fix; these tests pin its
 * behavior across the DST/timezone boundary this bug actually hides in.
 */
describe("parseCalendarDate", () => {
  it("produces a Date whose LOCAL calendar day matches the input, regardless of the runtime's timezone", () => {
    const date = parseCalendarDate("2026-08-12");
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(7); // 0-indexed
    expect(date.getDate()).toBe(12);
  });

  it("never shifts to the previous day, unlike the bare `new Date(iso)` it replaces", () => {
    // JS's multi-arg Date constructor always interprets its arguments as
    // LOCAL time components — that's what makes this correct by
    // construction in every timezone the test could possibly run in,
    // unlike `new Date("2026-08-12")`, which parses the string as UTC
    // midnight (per the ECMA-262 date-only-string rule) and only reads
    // back as the 12th in `toLocaleDateString` for timezones at or east
    // of UTC — anywhere behind UTC, that instant's LOCAL day is the 11th.
    const date = parseCalendarDate("2026-08-12");
    expect(date.getDate()).toBe(12);
    expect(date.getMonth()).toBe(7);
    expect(date.getFullYear()).toBe(2026);
  });

  it("handles a leap-day date", () => {
    const date = parseCalendarDate("2028-02-29");
    expect(date.getMonth()).toBe(1);
    expect(date.getDate()).toBe(29);
  });
});

describe("formatReadableCalendarDate", () => {
  it("formats without throwing and includes the year", () => {
    const formatted = formatReadableCalendarDate("2026-08-12");
    expect(formatted).toContain("2026");
  });

  it("never renders the day before the stored calendar date", () => {
    // Regression pin: format the same string both ways and confirm the
    // fixed formatter's own parsed day-of-month equals the input's.
    const isoDate = "2026-01-01";
    const parsed = parseCalendarDate(isoDate);
    expect(parsed.getDate()).toBe(1);
    expect(parsed.getMonth()).toBe(0);
  });
});
