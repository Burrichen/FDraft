import { isSameDay, startOfMonth } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import type { DraftTimeMode } from "@/repositories";

/**
 * Pure progress calculations for the Active Draft page (see
 * docs/product-spec.md, "ACTIVE DRAFT PAGE"). Always takes `now` as a
 * parameter rather than reading the clock itself, so every edge case —
 * just created, final day, expired, completed early, timezone boundaries —
 * is deterministically testable.
 */

export interface DraftTimeProgress {
  /** Whole days left, floored at 0 once the deadline has passed. */
  daysRemaining: number;
  /** How much of the progress window has elapsed, 0-100 (see `mode` below for what the window is). */
  percentElapsed: number;
  /** `100 - percentElapsed`, provided so callers don't have to derive it themselves. */
  percentRemaining: number;
  /** `now` is at or past `deadlineAt`. */
  isExpired: boolean;
  /** `now` and the deadline fall on the same local calendar day (in the draft's stored timezone), and it hasn't expired yet. */
  isFinalDay: boolean;
}

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export function calculateDraftTimeProgress(params: {
  mode: DraftTimeMode;
  now: Date;
  startedAt: Date;
  deadlineAt: Date;
  timezone: string;
}): DraftTimeProgress {
  const { mode, now, startedAt, deadlineAt, timezone } = params;

  const isExpired = now.getTime() >= deadlineAt.getTime();

  // Calendar Mode's progress window is the WHOLE calendar month the
  // deadline falls in (see docs/product-spec.md, "Draft Time Mode",
  // "Calendar Mode Progress") — a draft created partway through the month
  // must not read as "0% elapsed" just because it hasn't personally been
  // running long. Timer Mode keeps the original creation-to-deadline
  // window: 0% is the exact draft creation timestamp.
  const progressStart =
    mode === "calendar"
      ? fromZonedTime(startOfMonth(toZonedTime(deadlineAt, timezone)), timezone)
      : startedAt;

  const totalDurationMs = deadlineAt.getTime() - progressStart.getTime();
  const elapsedMs = now.getTime() - progressStart.getTime();
  const percentElapsed =
    totalDurationMs <= 0
      ? 100
      : Math.min(
          100,
          Math.max(0, Math.round((elapsedMs / totalDurationMs) * 100)),
        );
  const percentRemaining = 100 - percentElapsed;

  const remainingMs = Math.max(0, deadlineAt.getTime() - now.getTime());
  const daysRemaining = isExpired
    ? 0
    : Math.ceil(remainingMs / MILLISECONDS_PER_DAY);

  // Compared as local wall-clock dates in the draft's own timezone, not UTC —
  // a deadline of "23:59:59 local" and "now" can be the same local calendar
  // day while being on different UTC calendar days.
  const isFinalDay =
    !isExpired &&
    isSameDay(toZonedTime(now, timezone), toZonedTime(deadlineAt, timezone));

  return {
    daysRemaining,
    percentElapsed,
    percentRemaining,
    isExpired,
    isFinalDay,
  };
}

export interface DraftFilmProgress {
  watchedCount: number;
  totalCount: number;
  /** 0-100; 0 for a draft with no items at all, never a division-by-zero NaN. */
  percentWatched: number;
  /** Every item is watched — "completed early" when this is true before the deadline. */
  isFullyWatched: boolean;
}

export function calculateDraftFilmProgress(
  watchedCount: number,
  totalCount: number,
): DraftFilmProgress {
  const percentWatched =
    totalCount > 0 ? Math.round((watchedCount / totalCount) * 100) : 0;
  return {
    watchedCount,
    totalCount,
    percentWatched,
    isFullyWatched: totalCount > 0 && watchedCount >= totalCount,
  };
}
