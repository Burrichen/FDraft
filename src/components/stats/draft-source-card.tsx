import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  rankWatchedDraftFilmSources,
  type DraftSourceBreakdown,
} from "@/domain/drafts/draft-source-stats";
import { DistributionBars } from "./distribution-bars";

/**
 * How the Draft films a profile has WATCHED got into their Drafts (see
 * docs/updates, "FDRAFT v1.2.1 — LIVING DRAFTS" Part 3 §1/§2) — count and
 * percentage per source, across every Draft the profile has ever had, not
 * just the active one.
 *
 * Reuses `DistributionBars`, the same treatment the Decades/Genres/Ratings
 * cards use, so this reads as one more Stats distribution rather than a
 * new kind of chart — no charting dependency involved. The only addition
 * is the percentage alongside each count, since the point of THIS
 * breakdown is the distribution rather than the raw totals.
 *
 * Omits itself entirely when no Draft film has been watched yet — the same
 * rule `StatCard`/`DistributionCard` already follow for a stat with
 * nothing to say. Sources nothing was watched from are dropped rather than
 * padding the card with empty rows (see `rankWatchedDraftFilmSources`).
 *
 * Deliberately the ONLY place this metadata surfaces: no per-film source
 * label appears on Draft, History, Watchlist or film-detail cards, and the
 * Challenge identity behind a `Challenge` film stays internal (§3).
 */
export function DraftSourceCard({
  breakdown,
}: {
  breakdown: DraftSourceBreakdown;
}) {
  const stats = rankWatchedDraftFilmSources(breakdown);
  if (stats.length === 0) {
    return null;
  }

  const entries = stats.map((stat) => ({
    key: stat.source,
    count: stat.watchedFilms,
  }));
  // Keyed by plain string: `DistributionBars` hands its formatters the
  // row's `key` as a `string`, not this union.
  const percentBySource = new Map<string, number>(
    stats.map((stat) => [stat.source, stat.percentOfWatched]),
  );
  const labelBySource = new Map<string, string>(
    stats.map((stat) => [stat.source, stat.label]),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          Watched films by source
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground text-xs">
          {breakdown.totalWatchedFilms} watched draft film
          {breakdown.totalWatchedFilms === 1 ? "" : "s"}
        </p>
        <DistributionBars
          entries={entries}
          formatLabel={(key) => labelBySource.get(key) ?? key}
          formatValue={(entry) =>
            `${entry.count} · ${percentBySource.get(entry.key) ?? 0}%`
          }
        />
      </CardContent>
    </Card>
  );
}
