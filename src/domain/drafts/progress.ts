import { isSameDay } from "date-fns";
import { toZonedTime } from "date-fns-tz";

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
  /** How much of the draft's total duration has elapsed, 0-100. */
  percentElapsed: number;
  /** `now` is at or past `deadlineAt`. */
  isExpired: boolean;
  /** `now` and the deadline fall on the same local calendar day (in the draft's stored timezone), and it hasn't expired yet. */
  isFinalDay: boolean;
}

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export function calculateDraftTimeProgress(params: {
  now: Date;
  startedAt: Date;
  deadlineAt: Date;
  timezone: string;
}): DraftTimeProgress {
  const { now, startedAt, deadlineAt, timezone } = params;

  const isExpired = now.getTime() >= deadlineAt.getTime();

  const totalDurationMs = deadlineAt.getTime() - startedAt.getTime();
  const elapsedMs = now.getTime() - startedAt.getTime();
  const percentElapsed =
    totalDurationMs <= 0
      ? 100
      : Math.min(
          100,
          Math.max(0, Math.round((elapsedMs / totalDurationMs) * 100)),
        );

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

  return { daysRemaining, percentElapsed, isExpired, isFinalDay };
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
