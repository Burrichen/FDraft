import { Progress } from "@/components/ui/progress";
import type { DraftTimeProgress as DraftTimeProgressValue } from "@/domain/drafts/progress";

/** The Active Draft page's DAYS progress bar (see docs/product-spec.md, "ACTIVE DRAFT PAGE"). Server-rendered — deadlines don't need client-side ticking. */
export function DraftTimeProgress({
  progress,
}: {
  progress: DraftTimeProgressValue;
}) {
  const daysLabel =
    progress.daysRemaining === 0 && !progress.isExpired
      ? "Ends today"
      : `${progress.daysRemaining} day${progress.daysRemaining === 1 ? "" : "s"} left`;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-foreground font-medium">
          Days
          {progress.isExpired ? (
            <span className="text-destructive ml-1.5 font-normal">Expired</span>
          ) : progress.isFinalDay ? (
            <span className="text-watchlist-orange ml-1.5 font-normal">
              Final day
            </span>
          ) : null}
        </span>
        <span className="text-muted-foreground tabular-nums">
          {daysLabel} · {progress.percentElapsed}% elapsed
        </span>
      </div>
      <Progress value={progress.percentElapsed} aria-label="Time elapsed" />
    </div>
  );
}
