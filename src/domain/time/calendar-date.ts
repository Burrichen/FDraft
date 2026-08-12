/**
 * Parses a plain "YYYY-MM-DD" calendar date (never a full ISO datetime —
 * e.g. `WatchlistEntryRecord.dateAdded`, `WatchedHistoryRecord.watchedDate`)
 * as LOCAL midnight rather than UTC midnight.
 *
 * `new Date("2026-08-12")` parses as `2026-08-12T00:00:00.000Z` per the
 * ECMA-262 date-only-string rule — a UTC instant, not a local one. Any
 * later `toLocaleDateString`/`differenceInCalendarDays`/`differenceInYears`
 * call against that value reads back the PREVIOUS calendar day for every
 * timezone behind UTC (all of the Americas, among others). JS's multi-arg
 * `Date` constructor always interprets its arguments as LOCAL components,
 * which is what makes this correct by construction in every timezone.
 */
export function parseCalendarDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day);
}
