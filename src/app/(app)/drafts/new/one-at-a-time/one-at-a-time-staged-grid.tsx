import { Film, X } from "lucide-react";
import type { ChallengeAvailability } from "@/components/drafts/challenge-browser";
import { Badge } from "@/components/ui/badge";
import type { OneAtATimeStagedItem } from "@/domain/drafts/one-at-a-time";

/**
 * "Your Draft So Far" (see docs/updates, "ONE AT A TIME DRAFTING —
 * COMPLETE UX" §8/§13) — a real, responsive poster grid, not a plain
 * text list, so this reads like the film cards everywhere else in this
 * app rather than a generic itemised summary. Each card's own source
 * badge is deliberately specific: "Random", "Chosen" (Choose My Own), or
 * "Challenge: <name>" — never a bare "Challenge" that leaves out which
 * one actually produced this film.
 */
export function OneAtATimeStagedGrid({
  items,
  challenges,
  onRemove,
}: {
  items: readonly OneAtATimeStagedItem[];
  challenges: readonly ChallengeAvailability[];
  onRemove: (localId: string) => void;
}) {
  function sourceLabel(item: OneAtATimeStagedItem): string {
    if (item.source === "random") return "Random";
    if (item.source === "manual") return "Chosen";
    const challenge = challenges.find((c) => c.id === item.challengeId);
    return `Challenge: ${challenge?.name ?? item.challengeId}`;
  }

  return (
    // Same column breakpoints as `WatchlistGrid`/the Active Draft film grid
    // (see docs/product-spec.md, "Desktop Layout Width") — this was
    // previously capped at `xl:grid-cols-5`, one step short of its
    // siblings' `2xl:grid-cols-7`, so it scaled visibly worse than every
    // other poster grid in the app on the same wide viewports.
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
      {items.map((item) => (
        <li key={item.localId} className="group relative">
          <div className="border-border bg-card flex h-full flex-col overflow-hidden rounded-lg border">
            <div className="bg-muted aspect-2/3 w-full shrink-0 overflow-hidden">
              {item.posterUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- posters are external, remote URLs from third-party providers
                <img
                  src={item.posterUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="text-muted-foreground flex h-full w-full items-center justify-center">
                  <Film aria-hidden="true" className="size-8" />
                </div>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-1.5 p-2.5">
              <p className="text-foreground truncate text-sm font-semibold">
                {item.title}
                {item.releaseYear ? ` (${item.releaseYear})` : ""}
              </p>
              <Badge variant="secondary" className="w-fit">
                {sourceLabel(item)}
              </Badge>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onRemove(item.localId)}
            aria-label={`Remove ${item.title} from this draft`}
            className="bg-background/90 text-foreground hover:bg-destructive hover:text-destructive-foreground focus-visible:outline-ring absolute top-1.5 right-1.5 rounded-full p-1 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1"
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}
