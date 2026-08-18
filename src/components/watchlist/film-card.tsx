import { Check, Film } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AddToDraftButton } from "./add-to-draft-button";
import { FilmMetadataLine } from "@/components/film-metadata-line";
import { cn } from "@/lib/utils";
import { useIsWatchedThisSession, WatchToggle } from "./watch-toggle";
import type { WatchlistFilmCardView } from "./types";

interface FilmCardProps {
  film: WatchlistFilmCardView;
  /** Fires after this film is freshly marked watched — the Random Film picker uses it to move on to its next pick. Not needed just to render the faded/undo state, which reads live from `useWatchUndo()` instead. */
  onWatched?: (entryId: string) => void;
  /** "large" is used by the standalone random-film picker, which shows one film at a time. */
  size?: "default" | "large";
  /**
   * The Watchlist page's manual "Add to Draft" action (see docs/updates)
   * — all three omitted entirely (rather than `null`) by any caller that
   * doesn't offer it at all, e.g. the Random Film picker, which never
   * renders `AddToDraftButton` in that case.
   */
  activeDraftId?: string | null;
  isInActiveDraft?: boolean;
  onAddedToDraft?: (entryId: string) => void;
}

/**
 * A poster-focused watchlist card (see docs/product-spec.md, "Normal
 * Watchlist Page", "WATCHED FILM UNDO"). The whole poster/title/metadata
 * block is one link to the film's Letterboxd page; the watch control is a
 * sibling positioned on top of it, so the two clickable regions never
 * conflict.
 *
 * Once marked watched this session, the card stays mounted right where it
 * was — never removed or hidden — just visually faded (reduced opacity,
 * desaturated poster, a "Watched" label swapped in for genres) so it reads
 * as "marked watched, but you can still undo it" rather than looking
 * unreadable or broken. `useIsWatchedThisSession` reads this live from the
 * shared session context, so the fade appears/disappears immediately as the
 * user marks watched or undoes, with no parent-managed hidden/visible list
 * to keep in sync.
 */
export function FilmCard({
  film,
  onWatched,
  size = "default",
  activeDraftId,
  isInActiveDraft = false,
  onAddedToDraft,
}: FilmCardProps) {
  const isWatchedThisSession = useIsWatchedThisSession(film.entryId);
  const genresToShow = size === "large" ? 4 : 2;

  return (
    <div className="group relative h-full">
      <WatchToggle
        entryId={film.entryId}
        title={film.title}
        onMarkedWatched={() => onWatched?.(film.entryId)}
      />
      {activeDraftId !== undefined && onAddedToDraft ? (
        <AddToDraftButton
          entryId={film.entryId}
          title={film.title}
          activeDraftId={activeDraftId}
          isInDraft={isInActiveDraft}
          onAdded={onAddedToDraft}
        />
      ) : null}
      <a
        href={film.letterboxdUri ?? undefined}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open ${film.title}${film.releaseYear ? ` (${film.releaseYear})` : ""} on Letterboxd`}
        className="group border-border bg-card hover:border-primary/50 focus-visible:outline-ring flex h-full flex-col overflow-hidden rounded-lg border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <div className="bg-muted aspect-2/3 w-full shrink-0 overflow-hidden">
          {film.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- posters are external, remote URLs from third-party providers
            <img
              src={film.posterUrl}
              alt=""
              className={cn(
                "h-full w-full object-cover transition-transform group-hover:scale-105",
                isWatchedThisSession && "opacity-50 grayscale-[50%]",
              )}
            />
          ) : (
            <div className="text-muted-foreground flex h-full w-full items-center justify-center">
              <Film
                aria-hidden="true"
                className={size === "large" ? "size-16" : "size-8"}
              />
            </div>
          )}
        </div>
        <div
          className={cn(
            "flex flex-1 flex-col space-y-1",
            size === "large" ? "p-4" : "p-2.5",
            isWatchedThisSession && "opacity-60",
          )}
        >
          <p
            className={cn(
              "text-foreground truncate font-semibold",
              size === "large" ? "text-lg" : "text-sm",
            )}
          >
            {film.title}
          </p>
          <FilmMetadataLine
            releaseYear={film.releaseYear}
            runtimeMinutes={film.runtimeMinutes}
            averageRating={film.averageRating}
          />
          {isWatchedThisSession ? (
            <p className="text-watchlist-green flex items-center gap-1 text-xs font-medium">
              <Check aria-hidden="true" className="size-3.5" />
              Watched
            </p>
          ) : film.genres?.length ? (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {film.genres.slice(0, genresToShow).map((genre) => (
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
        </div>
      </a>
    </div>
  );
}
