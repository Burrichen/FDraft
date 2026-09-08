import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EventPresentationBadge } from "@/components/events/event-presentation-badge";
import type { EventOccurrenceStat } from "@/domain/events/event-occurrence-stats";

/**
 * One Event occurrence's compact participation summary (see docs/updates,
 * "FDRAFT UPDATE 1 — EVENT STATS/HISTORY/PERSISTENCE AUDIT" §9's own
 * example format) — deliberately small and data-dense, a handful of these
 * sit in a grid alongside each other rather than each one claiming a full
 * `StatCard`'s worth of space, so a profile with several years of
 * participation doesn't swamp the main Stats page.
 */
export function EventStatsCard({
  stat,
  eventVisualsEnabled,
}: {
  stat: EventOccurrenceStat;
  eventVisualsEnabled: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-foreground flex items-center gap-2 text-sm font-semibold">
          <EventPresentationBadge
            sourceEventId={stat.eventId}
            eventVisualsEnabled={eventVisualsEnabled}
          />
          {!eventVisualsEnabled ? <span>{stat.eventName}</span> : null}
          <span className="text-muted-foreground font-normal">
            {stat.occurrenceYear}
          </span>
        </CardTitle>
        <Badge
          variant={
            stat.status === "Completed"
              ? "secondary"
              : stat.status === "In Progress"
                ? "default"
                : "outline"
          }
          className="shrink-0"
        >
          {stat.status}
        </Badge>
      </CardHeader>
      <CardContent className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span className="tabular-nums">
          Films watched{" "}
          <span className="text-foreground font-medium">
            {stat.watchedFilms}/{stat.totalFilms}
          </span>
        </span>
        <span className="tabular-nums">
          {stat.currencyLabel} earned{" "}
          <span className="text-foreground font-medium">
            {stat.currencyEarned}
          </span>
        </span>
      </CardContent>
    </Card>
  );
}
