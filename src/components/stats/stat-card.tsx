import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Stat } from "@/domain/stats/types";

interface StatCardProps<T> {
  title: string;
  stat: Stat<T>;
  render: (value: T) => ReactNode;
}

/**
 * Renders nothing at all when the stat is unavailable — see
 * docs/product-spec.md, "Statistics": "Do not render meaningless 'N/A'
 * dashboards... Hide or gracefully omit unsupported cards." There is
 * deliberately no unavailable-state UI here; omission *is* the UI.
 */
export function StatCard<T>({ title, stat, render }: StatCardProps<T>) {
  if (!stat.available) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{render(stat.value)}</CardContent>
    </Card>
  );
}
