import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { EventAvailability } from "./event-definition";

/**
 * A monotonic ordinal for a (month, day, hour, minute) wall-clock moment —
 * NOT a real calendar computation (month is scaled by 31 regardless of how
 * many days that month actually has), only ever used to ORDER two moments
 * against each other, never to do date arithmetic. Safe because both sides
 * of every comparison come from real calendar values (`formatInTimeZone`
 * output, or a `recurringMonthDayRange` a human wrote), so the "gaps" this
 * scaling leaves for day values a short month never reaches are simply
 * never compared against.
 */
function toMonthDayOrdinal(
  month: number,
  day: number,
  hour: number,
  minute: number,
): number {
  return ((month * 31 + day) * 24 + hour) * 60 + minute;
}

/**
 * Whether `now` (in the given timezone) falls within an annually-recurring
 * month/day range — see `EventAvailability.recurringMonthDayRange`'s doc
 * comment for the "within one calendar year, start ≤ end" scope this
 * supports, and for its optional hour/minute fields. The start boundary is
 * inclusive; the end boundary is exclusive — `endHour`/`endMinute`
 * defaulting to end-of-day (24:00) is what makes a day-only range (no
 * end time set, e.g. January's) still include the ENTIRE last day, exactly
 * as before this function gained time-of-day precision. Comparing
 * `toMonthDayOrdinal` outputs rather than constructing real `Date`
 * instants for the boundaries is both simpler and just as DST-safe as any
 * instant-based arithmetic would be, once `formatInTimeZone` has resolved
 * the correct wall-clock components for `now` in the target timezone.
 */
function isWithinMonthDayRange(
  range: NonNullable<EventAvailability["recurringMonthDayRange"]>,
  now: Date,
  timezone: string,
): boolean {
  const current = toMonthDayOrdinal(
    Number(formatInTimeZone(now, timezone, "M")),
    Number(formatInTimeZone(now, timezone, "d")),
    Number(formatInTimeZone(now, timezone, "H")),
    Number(formatInTimeZone(now, timezone, "m")),
  );
  const start = toMonthDayOrdinal(
    range.startMonth,
    range.startDay,
    range.startHour ?? 0,
    range.startMinute ?? 0,
  );
  const end = toMonthDayOrdinal(
    range.endMonth,
    range.endDay,
    range.endHour ?? 24,
    range.endMinute ?? 0,
  );
  return current >= start && current < end;
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

/**
 * When a `recurringMonthDayRange` event next STARTS, relative to `now` —
 * powers "Returns 30 September at 7:00 PM"-style Settings/Event Page copy
 * for an event that isn't naturally available right now (see docs/updates,
 * "PROMPT 18 — EVENT PAGES + HALLOWEEN LIFECYCLE"). `null` for any other
 * `EventAvailability` shape — a fixed one-off window has no meaningful
 * "next" occurrence, and this phase has no UI need for one on
 * `recurringMonths`-shaped events.
 *
 * Builds this year's candidate start via the same wall-clock-components
 * `fromZonedTime` technique the Event Test Switcher uses; if that instant
 * is still ahead of `now`, it's the answer, otherwise the range already
 * started (or is currently active) this year, so next year's is returned.
 * Deliberately does not check `isEventAvailable` itself — call that first
 * if you need to distinguish "returns later" from "available right now."
 */
export function getNextOccurrenceStart(
  availability: EventAvailability,
  now: Date,
  timezone: string,
): Date | null {
  const range = availability.recurringMonthDayRange;
  if (!range) {
    return null;
  }
  const currentYear = Number(formatInTimeZone(now, timezone, "yyyy"));
  const buildCandidate = (year: number) =>
    fromZonedTime(
      new Date(
        year,
        range.startMonth - 1,
        range.startDay,
        range.startHour ?? 0,
        range.startMinute ?? 0,
      ),
      timezone,
    );
  const thisYear = buildCandidate(currentYear);
  return thisYear.getTime() > now.getTime()
    ? thisYear
    : buildCandidate(currentYear + 1);
}

/**
 * The real start/end instants of the `recurringMonthDayRange` occurrence
 * `now` currently falls WITHIN — see `EventDefinition.fixedEventDeadline`
 * (docs/updates, "PROMPT B2.2 — HALLOWEEN PAGE REBUILD + DEADLINE +
 * STATS" §3): a Draft deadline that's fixed to "the end of the event"
 * needs the actual end instant, and its time-progress display needs the
 * actual start instant, of the occurrence currently in progress — not the
 * NEXT occurrence (`getNextOccurrenceStart`, which is for an event that
 * ISN'T currently available). Only meaningful while `isEventAvailable`
 * is true for the same `now`; callers should check that first.
 *
 * Relies on the same "stays within one calendar year, start ≤ end" scope
 * `isEventAvailable` itself assumes for `recurringMonthDayRange` (see its
 * own doc comment) — `now`'s own local year is used for BOTH the start and
 * end candidate, which is correct exactly because the range never crosses
 * a year boundary. `null` for any other `EventAvailability` shape.
 */
export function getCurrentOccurrenceBounds(
  availability: EventAvailability,
  now: Date,
  timezone: string,
): { start: Date; end: Date } | null {
  const range = availability.recurringMonthDayRange;
  if (!range) {
    return null;
  }
  const year = Number(formatInTimeZone(now, timezone, "yyyy"));
  const build = (month: number, day: number, hour: number, minute: number) =>
    fromZonedTime(new Date(year, month - 1, day, hour, minute), timezone);
  return {
    start: build(
      range.startMonth,
      range.startDay,
      range.startHour ?? 0,
      range.startMinute ?? 0,
    ),
    end: build(
      range.endMonth,
      range.endDay,
      range.endHour ?? 0,
      range.endMinute ?? 0,
    ),
  };
}
