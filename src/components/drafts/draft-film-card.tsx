import { Check, Film } from "lucide-react";
import { formatChallengeDisplayValue } from "@/domain/challenges/format-display-value";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { EyeButton } from "@/components/watchlist/eye-button";
import { cn } from "@/lib/utils";

export interface DraftFilmChallengeView {
  name: string;
  description: string;
  displayValue: Record<string, unknown> | null;
}

export interface DraftFilmCardView {
  itemId: string;
  /** Null once the underlying watchlist entry no longer exists (very old history) — the eye control is hidden then. */
  entryId: string | null;
  title: string;
  releaseYear: number | null;
  letterboxdUri: string | null;
  posterUrl: string | null;
  averageRating: number | null;
  genres: string[] | null;
  isCompleted: boolean;
  challenge: DraftFilmChallengeView | null;
}

/**
 * A poster card for a draft's film slots (see docs/product-spec.md, "ACTIVE
 * DRAFT PAGE" — poster/title/year/rating/genres/challenge badge/watched eye
 * control). The eye control is a sibling of the card's `<a>`, not a
 * descendant — a `<button>` nested inside an `<a>` is invalid HTML (the
 * same lesson from the watchlist's FilmCard) — so clicking it never
 * triggers the anchor's Letterboxd navigation.
 *
 * The challenge badge and its description live inside the card's `<a>` as
 * a plain `<span>` `TooltipTrigger` (`render`), which is fine there since a
 * `<span>` isn't a competing interactive element. Base UI's Tooltip opens
 * on focus as well as hover, and a tap on a touchscreen focuses the element
 * first, so this satisfies "hover/focus/tap should reveal the description"
 * without a separate mobile-only affordance.
 */
export function DraftFilmCard({
  film,
  onWatched,
}: {
  film: DraftFilmCardView;
  onWatched: (itemId: string) => void;
}) {
  const displayEntries = formatChallengeDisplayValue(
    film.challenge?.displayValue,
  );

  return (
    <div className="group relative">
      {!film.isCompleted && film.entryId ? (
        <EyeButton
          entryId={film.entryId}
          title={film.title}
          onWatched={() => onWatched(film.itemId)}
        />
      ) : null}
      {film.isCompleted ? (
        <div className="bg-watchlist-green text-primary-foreground absolute top-2 right-2 z-10 flex size-6 items-center justify-center rounded-full">
          <Check aria-hidden="true" className="size-4" />
        </div>
      ) : null}
      <a
        href={film.letterboxdUri ?? undefined}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open ${film.title}${film.releaseYear ? ` (${film.releaseYear})` : ""} on Letterboxd`}
        className="border-border bg-card hover:border-primary/50 focus-visible:outline-ring block overflow-hidden rounded-lg border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <div className="bg-muted aspect-2/3 w-full overflow-hidden">
          {film.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- posters are external, remote URLs from third-party providers
            <img
              src={film.posterUrl}
              alt=""
              className={cn(
                "h-full w-full object-cover transition-transform group-hover:scale-105",
                film.isCompleted && "opacity-60",
              )}
            />
          ) : (
            <div className="text-muted-foreground flex h-full w-full items-center justify-center">
              <Film aria-hidden="true" className="size-8" />
            </div>
          )}
        </div>
        <div className="space-y-1 p-2.5">
          <p className="text-foreground truncate text-sm font-medium">
            {film.title}
          </p>
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
            {film.releaseYear ? <span>{film.releaseYear}</span> : null}
            {film.averageRating !== null ? (
              <span>★ {film.averageRating.toFixed(1)}</span>
            ) : null}
          </div>
          {film.genres?.length ? (
            <div className="flex flex-wrap gap-1">
              {film.genres.slice(0, 2).map((genre) => (
                <Badge
                  key={genre}
                  variant="secondary"
                  className="text-[0.65rem]"
                >
                  {genre}
                </Badge>
              ))}
            </div>
          ) : null}
          {film.challenge ? (
            <Tooltip>
              <TooltipTrigger
                render={<span tabIndex={0} />}
                className="bg-watchlist-blue/15 text-watchlist-blue focus-visible:outline-ring inline-block w-full truncate rounded px-1.5 py-0.5 text-[0.65rem] font-semibold tracking-wide uppercase focus-visible:outline-2 focus-visible:outline-offset-1"
              >
                Challenge: {film.challenge.name}
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-56">{film.challenge.description}</p>
                {displayEntries.length > 0 ? (
                  <ul className="mt-1 space-y-0.5">
                    {displayEntries.map((entry) => (
                      <li key={entry.label}>
                        {entry.label}: {entry.value}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </a>
    </div>
  );
}
