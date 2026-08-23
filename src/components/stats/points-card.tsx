import type { ComponentType, SVGProps } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * One permanent point currency's total on the Stats page (see
 * docs/updates, "PROMPT B2.2 — HALLOWEEN PAGE REBUILD + DEADLINE +
 * STATS" §6) — always shown, even at 0 (a real, earned total, never an
 * "unavailable" stat to hide the way `StatCard` hides watchlist-derived
 * stats with no data).
 */
export function PointsCard({
  icon: Icon,
  iconClassName,
  label,
  value,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  iconClassName?: string;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-muted-foreground flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
          <Icon aria-hidden="true" className={cn("size-4", iconClassName)} />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-foreground text-2xl font-semibold tabular-nums">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
