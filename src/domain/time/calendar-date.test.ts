import { describe, expect, it } from "vitest";
import { parseCalendarDate } from "./calendar-date";

/**
 * See docs/product-spec.md's "COMPLETE PRODUCT AUDIT" phase entry —
 * `new Date("2026-08-12")` parses a plain calendar date as UTC midnight,
 * which reads as the PREVIOUS day once displayed/compared in any
 * negative-UTC-offset timezone. `parseCalendarDate` fixes this by using
 * the Date constructor's local-component form instead.
 */
describe("parseCalendarDate", () => {
  it("returns a Date whose local year/month/day match the input exactly", () => {
    const date = parseCalendarDate("2026-08-12");
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(7);
    expect(date.getDate()).toBe(12);
  });

  it("handles the first day of a month", () => {
    const date = parseCalendarDate("2026-01-01");
    expect(date.getMonth()).toBe(0);
    expect(date.getDate()).toBe(1);
  });

  it("handles a leap day", () => {
    const date = parseCalendarDate("2028-02-29");
    expect(date.getMonth()).toBe(1);
    expect(date.getDate()).toBe(29);
  });

  it("is correct by construction regardless of the runtime's timezone — never depends on new Date(iso)'s UTC-midnight parsing", () => {
    // JS's multi-arg Date constructor always interprets its arguments as
    // LOCAL time components, unlike the single-string form, which parses
    // a date-only string as UTC. This is what the fix relies on.
    const date = parseCalendarDate("2026-12-31");
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(11);
    expect(date.getDate()).toBe(31);
  });
});
