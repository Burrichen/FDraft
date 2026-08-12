import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { parseCalendarDate } from "@/domain/time/calendar-date";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * A human-readable date — "9 August 2026", never a raw ISO string (see
 * docs/product-spec.md, "WATCHED DATE FORMAT"). `"long"` (the default)
 * spells the month out in full, matching that section's own example;
 * `"medium"` (already used by the Draft History page's date ranges)
 * abbreviates it. Uses the browser's own locale/timezone via `undefined`
 * — the same convention already used everywhere else a date is displayed
 * in this app, not a new one.
 *
 * Only for a full ISO DATETIME (e.g. `draft.startedAt`) — for a plain
 * "YYYY-MM-DD" calendar date (watched date, date added), use
 * `formatReadableCalendarDate` instead. `new Date(iso)` parses a
 * date-only string as UTC midnight per the ECMA-262 spec, which reads as
 * the PREVIOUS calendar day once formatted back in any negative-UTC
 * timezone — this function is only safe for values that already carry a
 * time component.
 */
export function formatReadableDate(
  iso: string,
  style: "long" | "medium" = "long",
): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: style });
}

/** `parseCalendarDate` (see `src/domain/time/calendar-date.ts`) + the same human-readable formatting `formatReadableDate` applies — for watched dates / date-added, never a full ISO datetime. */
export function formatReadableCalendarDate(
  isoDate: string,
  style: "long" | "medium" = "long",
): string {
  return parseCalendarDate(isoDate).toLocaleDateString(undefined, {
    dateStyle: style,
  });
}
