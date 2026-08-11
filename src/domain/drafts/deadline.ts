import { addDays, endOfMonth } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import type { DraftTimeMode } from "@/repositories";

/** Timer mode's fixed duration (see docs/product-spec.md, "Draft Time Mode"). */
export const TIMER_MODE_DURATION_DAYS = 30;

export interface DeadlineInput {
  timeMode: DraftTimeMode;
  /** Server-generated creation instant. Never derive this from the client clock. */
  startedAt: Date;
  /** IANA timezone name, e.g. "Europe/London". Required for calendar mode. */
  timezone: string;
}

/**
 * Computes a draft's deadline once, at creation time, so it can be persisted
 * and never recalculated from the browser clock (see docs/product-spec.md,
 * "Draft Time Mode" — a draft created late in the month must NOT effectively
 * get extra days just because "30 days" would push past month-end).
 *
 * - Timer mode: exactly TIMER_MODE_DURATION_DAYS * 24h after startedAt.
 * - Calendar mode: the last instant of startedAt's calendar month, evaluated
 *   in the given timezone (23:59:59.999 local time on the last day),
 *   converted back to a UTC instant.
 */
export function calculateDraftDeadline({
  timeMode,
  startedAt,
  timezone,
}: DeadlineInput): Date {
  if (timeMode === "timer") {
    return addDays(startedAt, TIMER_MODE_DURATION_DAYS);
  }

  const zonedStart = toZonedTime(startedAt, timezone);
  const zonedEndOfMonth = endOfMonth(zonedStart);
  return fromZonedTime(zonedEndOfMonth, timezone);
}
