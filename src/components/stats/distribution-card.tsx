import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Stat } from "@/domain/stats/types";
import type { DistributionEntry } from "@/domain/stats/watchlist-stats";
import { DistributionBars } from "./distribution-bars";

interface DistributionCardProps {
  title: string;
  stat: Stat<DistributionEntry[]>;
  formatLabel?: (key: string) => string;
}

/** Omits itself entirely when unavailable — same rule as StatCard. */
export function DistributionCard({
  title,
  stat,
  formatLabel,
}: DistributionCardProps) {
  if (!stat.available) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <DistributionBars entries={stat.value} formatLabel={formatLabel} />
      </CardContent>
    </Card>
  );
}
