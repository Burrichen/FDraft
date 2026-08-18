import { formatInTimeZone } from "date-fns-tz";
import type { EventAvailability } from "./event-definition";

/**
 * Whether `now` (in the given timezone) falls within an annually-recurring
 * month/day range, inclusive on both ends — see `EventAvailability.
 * recurringMonthDayRange`'s doc comment for the "within one calendar year,
 * start ≤ end" scope this supports. A plain (month, day) tuple comparison
 * rather than constructing real `Date` instants for the boundaries — once
 * `formatInTimeZone` has resolved the correct wall-clock month/day for
 * `now` in the target timezone, comparing those two small integers is both
 * simpler and just as DST-safe as any instant-based arithmetic would be.
 */
function isWithinMonthDayRange(
  range: NonNullable<EventAvailability["recurringMonthDayRange"]>,
  now: Date,
  timezone: string,
): boolean {
  const currentMonth = Number(formatInTimeZone(now, timezone, "M"));
  const currentDay = Number(formatInTimeZone(now, timezone, "d"));
  const afterOrOnStart =
    currentMonth > range.startMonth ||
    (currentMonth === range.startMonth && currentDay >= range.startDay);
  const beforeOrOnEnd =
    currentMonth < range.endMonth ||
    (currentMonth === range.endMonth && currentDay <= range.endDay);
  return afterOrOnStart && beforeOrOnEnd;
}

/**
 * Whether an event is naturally available right now — the one generic
 * function every event's `availability` is evaluated through (see
 * docs/product-spec.md, event system Phase 2: "one engine instead of
 * hardcoding January/Sci-Fi/Western logic throughout the app"). No event
 * name or id appears here; a 25–31 January event, a whole-June-through-
 * August event, and a one-off fixed window are just different
 * `EventAvailability` data passed into the exact same check.
 *
 * `recurringMonthDayRange` takes priority when present, then
 * `recurringMonths`, both evaluated in the profile's own timezone (the
 * same `formatInTimeZone` convention `markLocalFilmWatched`'s watched-date
 * already uses — the OS's local time or a hardcoded UTC would put a
 * profile in a different hemisphere into or out of the event on the wrong
 * day). Otherwise a fixed `startsAt`/`endsAt` window applies, evaluated as
 * plain instants — no timezone conversion needed for two absolute
 * timestamps. None present means never naturally available (manual-only).
 */
export function isEventAvailable(
  availability: EventAvailability,
  now: Date,
  timezone: string,
): boolean {
  if (availability.recurringMonthDayRange) {
    return isWithinMonthDayRange(
      availability.recurringMonthDayRange,
      now,
      timezone,
    );
  }

  if (availability.recurringMonths && availability.recurringMonths.length > 0) {
    const currentMonth = Number(formatInTimeZone(now, timezone, "M"));
    return availability.recurringMonths.includes(currentMonth);
  }

  if (availability.startsAt !== null || availability.endsAt !== null) {
    const time = now.getTime();
    if (
      availability.startsAt !== null &&
      time < new Date(availability.startsAt).getTime()
    ) {
      return false;
    }
    if (
      availability.endsAt !== null &&
      time >= new Date(availability.endsAt).getTime()
    ) {
      return false;
    }
    return true;
  }

  return false;
}

/**
 * A stable identifier for whichever occurrence of `availability` `now`
 * falls into — the "smallest generic representation" event introduction
 * dismissal needs (see docs/product-spec.md, event system Phase 6): a
 * dismissal recorded against this id only ever suppresses THIS occurrence,
 * never a later one. `recurringMonthDayRange`/`recurringMonths` both repeat
 * every calendar year and (per their own within-a-year scope) never span a
 * year boundary, so the profile's local year (the same `formatInTimeZone`
 * convention `isEventAvailable` itself uses) is the natural cycle boundary
 * for either. A fixed `startsAt`/`endsAt` window never repeats, so its own
 * `startsAt` already uniquely identifies it. `null` when `availability` has
 * no natural window at all (manual-only — there is no "occurrence" to
 * identify). Callers pair this with `isEventAvailable` themselves; this
 * does not re-check membership.
 */
export function getAvailabilityCycleId(
  availability: EventAvailability,
  now: Date,
  timezone: string,
): string | null {
  if (
    availability.recurringMonthDayRange ||
    (availability.recurringMonths && availability.recurringMonths.length > 0)
  ) {
    return formatInTimeZone(now, timezone, "yyyy");
  }
  if (availability.startsAt !== null) {
    return availability.startsAt;
  }
  return null;
}
