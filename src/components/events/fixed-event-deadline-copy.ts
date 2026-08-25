import { formatInTimeZone } from "date-fns-tz";

/**
 * User-facing copy for a `fixedEventDeadline` event's end instant (see
 * `EventDefinition.fixedEventDeadline` — today, only Halloween) — see
 * docs/updates, "HALLOWEEN PAGE REBUILD" §6: "User-facing copy should
 * generally say: Ends 31 October at midnight." `end` is an EXCLUSIVE
 * boundary (Halloween's is `1 November 00:00`, see `event-registry.ts`),
 * so naively formatting it verbatim reads as "Ends 1 November at 00:00" —
 * technically correct but not how a person describes that window.
 * Subtracting one minute before formatting lands on the actual last
 * minute the window is live (`31 October 23:59`), which is what makes the
 * date PART of the output read as the intuitive "31 October" — the
 * midnight special-case below still renders the time part as "midnight"
 * regardless, rather than "11:59 pm".
 */
export function describeFixedEventDeadline(
  end: Date,
  timezone: string,
): string {
  const lastLiveMinute = new Date(end.getTime() - 60_000);
  const datePart = formatInTimeZone(lastLiveMinute, timezone, "d MMMM");
  const isMidnight = formatInTimeZone(end, timezone, "HH:mm") === "00:00";
  const timePart = isMidnight
    ? "midnight"
    : formatInTimeZone(end, timezone, "h:mm a");
  return `${datePart} at ${timePart}`;
}
