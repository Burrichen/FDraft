import type {
  DraftItemEntrySource,
  DraftItemRecord,
} from "@/repositories/records";
import { resolveDraftItemEntrySource } from "./living-draft";

/**
 * The order Stats presents source buckets in — generation methods first,
 * then user-driven ones, then Events. Fixed here so every future surface
 * agrees, rather than depending on `Object.keys` ordering.
 */
export const DRAFT_ENTRY_SOURCE_ORDER: readonly DraftItemEntrySource[] = [
  "random",
  "challenge",
  "diy",
  "manual_add",
  "manual_replace",
  "reroll",
  "event",
] as const;

/** Human-readable labels, verbatim from the source list docs/updates "FDRAFT v1.2.1 — LIVING DRAFTS" Part 3 §1 gives for the Stats breakdown. */
export const DRAFT_ENTRY_SOURCE_LABELS: Record<DraftItemEntrySource, string> = {
  random: "Random",
  challenge: "Challenge",
  diy: "DIY",
  manual_add: "Manually Added",
  manual_replace: "Manual Replacement",
  reroll: "Rerolled",
  event: "Event",
};

export interface DraftSourceStat {
  source: DraftItemEntrySource;
  label: string;
  /** How many WATCHED draft films entered this way. */
  watchedFilms: number;
  /** `watchedFilms` as a whole-number percentage of every watched draft film counted. `0` when nothing has been watched. */
  percentOfWatched: number;
}

export interface DraftSourceBreakdown {
  /** Every source, in `DRAFT_ENTRY_SOURCE_ORDER`, including ones with zero watched films — a caller decides whether to hide those. */
  stats: DraftSourceStat[];
  totalWatchedFilms: number;
}

/**
 * How the films a profile has actually WATCHED from Drafts got into those
 * Drafts (see docs/updates, "FDRAFT v1.2.1 — LIVING DRAFTS" §8) — the raw
 * count and percentage split Stats will present.
 *
 * Counts draft ITEMS, across whatever set of drafts the caller passes:
 * give it every historical draft's items and it describes a profile's
 * whole history, not just the active draft (§8: "Make sure enough
 * information is persisted historically so this is not limited to only
 * the currently active Draft"). Items persist untouched when a draft is
 * archived or expires, so no separate historical copy is needed.
 *
 * Only `isCompleted` items count. An unwatched film has no source
 * contribution to make, and an expired draft's unresolved items must not
 * inflate a "watched by source" breakdown.
 *
 * Percentages are rounded to whole numbers independently and so may not
 * sum to exactly 100 — deliberately, rather than fudging one bucket to
 * force it. A caller that needs an exact total should use the raw counts.
 */
export function summariseWatchedDraftFilmsBySource(
  items: readonly DraftItemRecord[],
): DraftSourceBreakdown {
  const watched = items.filter((item) => item.isCompleted);
  const counts = new Map<DraftItemEntrySource, number>();
  for (const item of watched) {
    const source = resolveDraftItemEntrySource(item);
    counts.set(source, (counts.get(source) ?? 0) + 1);
  }

  const totalWatchedFilms = watched.length;
  const stats = DRAFT_ENTRY_SOURCE_ORDER.map((source) => {
    const watchedFilms = counts.get(source) ?? 0;
    return {
      source,
      label: DRAFT_ENTRY_SOURCE_LABELS[source],
      watchedFilms,
      percentOfWatched:
        totalWatchedFilms === 0
          ? 0
          : Math.round((watchedFilms / totalWatchedFilms) * 100),
    };
  });

  return { stats, totalWatchedFilms };
}

/**
 * The breakdown as Stats actually presents it (see docs/updates, "FDRAFT
 * v1.2.1 — LIVING DRAFTS" Part 3 §2: "Only display meaningful
 * categories/data. Do not clutter the UI with zero-value categories").
 *
 * Drops every source nothing was watched from, and ranks the rest by count
 * — matching how every other distribution on the Stats page already reads,
 * rather than showing a fixed list of seven rows with five of them empty.
 * Ties keep `DRAFT_ENTRY_SOURCE_ORDER`, so the order is stable rather than
 * dependent on sort implementation.
 *
 * Returns an empty array when nothing has been watched at all, which is
 * the caller's signal to omit the card entirely — the same rule
 * `StatCard`/`DistributionCard` already follow for unavailable stats.
 */
export function rankWatchedDraftFilmSources(
  breakdown: DraftSourceBreakdown,
): DraftSourceStat[] {
  return breakdown.stats
    .filter((stat) => stat.watchedFilms > 0)
    .sort((a, b) => {
      if (b.watchedFilms !== a.watchedFilms) {
        return b.watchedFilms - a.watchedFilms;
      }
      return (
        DRAFT_ENTRY_SOURCE_ORDER.indexOf(a.source) -
        DRAFT_ENTRY_SOURCE_ORDER.indexOf(b.source)
      );
    });
}
