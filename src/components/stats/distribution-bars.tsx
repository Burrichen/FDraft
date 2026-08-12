import type { DistributionEntry } from "@/domain/stats/watchlist-stats";

interface DistributionBarsProps {
  entries: DistributionEntry[];
  formatLabel?: (key: string) => string;
}

/**
 * A minimal ranked horizontal-bar list: one series, one accent hue, counts
 * always shown as direct labels rather than hidden behind hover (this app
 * targets touch as a first-class input — see docs/product-spec.md,
 * "Design Direction"). Track uses a recessive, muted fill so only the
 * data bar itself carries visual weight.
 */
export function DistributionBars({
  entries,
  formatLabel,
}: DistributionBarsProps) {
  const max = Math.max(...entries.map((entry) => entry.count), 1);

  return (
    <ul className="space-y-2.5">
      {entries.map((entry) => (
        <li key={entry.key}>
          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
            <span className="text-foreground truncate">
              {formatLabel ? formatLabel(entry.key) : entry.key}
            </span>
            <span className="text-muted-foreground tabular-nums">
              {entry.count}
            </span>
          </div>
          <div className="bg-secondary border-border/60 h-2 w-full overflow-hidden rounded-full border">
            <div
              className="bg-watchlist-blue h-full rounded-full transition-[width] duration-500 ease-out"
              style={{ width: `${Math.max((entry.count / max) * 100, 4)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
