import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Stat } from "@/domain/stats/types";
import { parseCalendarDate } from "@/domain/time/calendar-date";
import type { DateAddedEntry } from "@/domain/stats/watchlist-stats";

interface AdditionsCardProps {
  title: string;
  stat: Stat<DateAddedEntry[]>;
}

export function AdditionsCard({ title, stat }: AdditionsCardProps) {
  if (!stat.available) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-2 text-sm">
          {stat.value.map((entry, index) => (
            <li
              key={`${entry.title}-${entry.dateAdded}`}
              className="flex items-baseline gap-2"
            >
              <span className="text-muted-foreground w-4 shrink-0 tabular-nums">
                {index + 1}.
              </span>
              <span className="text-foreground flex-1 truncate">
                {entry.title}
              </span>
              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                {parseCalendarDate(entry.dateAdded).toLocaleDateString(
                  undefined,
                  { year: "numeric", month: "short", day: "numeric" },
                )}
              </span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
