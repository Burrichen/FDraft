import {
  differenceInCalendarDays,
  differenceInCalendarMonths,
  differenceInCalendarYears,
} from "date-fns";
import { parseCalendarDate } from "./calendar-date";

/**
 * A short, human-readable "how long has this been on the watchlist"
 * phrase (e.g. `"2 years"`, `"8 months"`, `"5 days"`) — the DIY Draft
 * "Need ideas?" sidebar's qualifier for its "longest on watchlist"
 * question (see docs/updates, v1.1.1). Coarsest unit that's still
 * non-zero wins, matching how people actually talk about this ("8
 * months", not "243 days"). `now` is always an explicit parameter, never
 * read internally — see `domain/time/clock.ts`'s `Clock` convention.
 */
export function formatWatchlistDuration(dateAdded: string, now: Date): string {
  const added = parseCalendarDate(dateAdded);
  const years = differenceInCalendarYears(now, added);
  if (years >= 1) {
    return `${years} year${years === 1 ? "" : "s"}`;
  }
  const months = differenceInCalendarMonths(now, added);
  if (months >= 1) {
    return `${months} month${months === 1 ? "" : "s"}`;
  }
  const days = differenceInCalendarDays(now, added);
  if (days <= 0) {
    return "today";
  }
  return `${days} day${days === 1 ? "" : "s"}`;
}
