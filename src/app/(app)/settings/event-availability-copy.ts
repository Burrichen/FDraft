import type { EventAvailability } from "@/domain/events/event-definition";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function formatMonthDayTime(
  month: number,
  day: number,
  hour?: number,
  minute?: number,
): string {
  const datePart = `${day} ${MONTH_NAMES[month - 1]}`;
  if (hour === undefined) {
    return datePart;
  }
  const displayHour = ((hour + 11) % 12) + 1;
  const suffix = hour >= 12 ? "pm" : "am";
  const timePart = minute
    ? `${displayHour}:${String(minute).padStart(2, "0")}${suffix}`
    : `${displayHour}${suffix}`;
  return `${datePart}, ${timePart}`;
}

/**
 * A short, human-readable description of a recurring event's natural
 * window (see docs/updates, "SETTINGS INFORMATION ARCHITECTURE REBUILD"
 * §4 — e.g. "30 September, 7pm – 31 October") for the Settings "Available
 * now" list. Purely presentational — reads the registry's own declared
 * month/day/hour values directly rather than resolving a timezone instant,
 * since this describes the event's nominal recurring window, not a
 * specific profile's local moment.
 *
 * An end time of exactly midnight (Halloween's `endHour: 0, endMinute: 0`,
 * meaning "through 1 November at 00:00") displays as the previous day
 * instead — "through 31 October" is how a person actually describes that
 * window, and `isEventAvailable`'s own exclusive-end-boundary semantics
 * (see `event-availability.ts`) already mean the window never actually
 * includes 1 November itself. `null` for any event with no recurring
 * window at all (manual-only, e.g. The Watchlist Frontier).
 */
export function describeEventAvailabilityWindow(
  availability: EventAvailability,
): string | null {
  const range = availability.recurringMonthDayRange;
  if (!range) {
    return null;
  }
  const start = formatMonthDayTime(
    range.startMonth,
    range.startDay,
    range.startHour,
    range.startMinute,
  );
  let endMonth = range.endMonth;
  let endDay = range.endDay;
  if (range.endHour === 0 && (range.endMinute ?? 0) === 0) {
    const previousDay = new Date(2001, endMonth - 1, endDay - 1);
    endMonth = previousDay.getMonth() + 1;
    endDay = previousDay.getDate();
  }
  const end = formatMonthDayTime(endMonth, endDay);
  return `${start} – ${end}`;
}
