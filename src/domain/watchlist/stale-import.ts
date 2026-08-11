import { addMonths, isAfter, startOfDay } from "date-fns";
import { toZonedTime } from "date-fns-tz";

/**
 * See docs/product-spec.md, "Stale Watchlist Warning" — calendar-month
 * arithmetic, not a fixed day count (three months is NOT always 90 days).
 */
export const STALE_WATCHLIST_THRESHOLD_MONTHS = 3;

export interface StaleImportCheckInput {
  /** Most recent *completed* import's server timestamp, or null if the user has never imported. */
  lastImportCompletedAt: Date | null;
  now: Date;
  timezone: string;
}

/**
 * True once more than STALE_WATCHLIST_THRESHOLD_MONTHS calendar months have
 * elapsed since the last completed import, evaluated in the user's
 * timezone. Exactly three months out is not yet stale — per the spec's own
 * example, an import on 5 March starts warning after 5 June, i.e. from 6
 * June. A user who has never imported is not "stale" (that's a distinct
 * empty/first-run UI state, not a warning about staleness).
 */
export function isWatchlistStale({
  lastImportCompletedAt,
  now,
  timezone,
}: StaleImportCheckInput): boolean {
  if (!lastImportCompletedAt) {
    return false;
  }

  const zonedLastImport = toZonedTime(lastImportCompletedAt, timezone);
  const zonedNow = toZonedTime(now, timezone);
  const threshold = startOfDay(
    addMonths(zonedLastImport, STALE_WATCHLIST_THRESHOLD_MONTHS),
  );

  return isAfter(startOfDay(zonedNow), threshold);
}
