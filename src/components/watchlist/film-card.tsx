import { Film } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { EyeButton } from "./eye-button";
import type { WatchlistFilmCardView } from "./types";

interface FilmCardProps {
  film: WatchlistFilmCardView;
  onWatched: (entryId: string) => void;
  /** "large" is used by the standalone random-film picker, which shows one film at a time. */
  size?: "default" | "large";
}

/**
 * A poster-focused watchlist card (see docs/product-spec.md, "Normal
 * Watchlist Page"). The whole poster/title/metadata block is one link to
 * the film's Letterboxd page; the eye control is a sibling positioned on
 * top of it, so the two clickable regions never conflict.
 */
export function FilmCard({ film, onWatched, size = "default" }: FilmCardProps) {
  const genresToShow = size === "large" ? 4 : 2;

  return (
    <div className="group relative">
      <EyeButton
        entryId={film.entryId}
        title={film.title}
        onWatched={() => onWatched(film.entryId)}
      />
      <a
        href={film.letterboxdUri ?? undefined}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open ${film.title}${film.releaseYear ? ` (${film.releaseYear})` : ""} on Letterboxd`}
        className="group border-border bg-card hover:border-primary/50 focus-visible:outline-ring block overflow-hidden rounded-lg border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <div className="bg-muted aspect-2/3 w-full overflow-hidden">
          {film.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- posters are external, remote URLs from third-party providers
            <img
              src={film.posterUrl}
              alt=""
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
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
        <div className={cn("space-y-1", size === "large" ? "p-4" : "p-2.5")}>
          <p
            className={cn(
              "text-foreground truncate font-medium",
              size === "large" ? "text-lg" : "text-sm",
            )}
          >
            {film.title}
          </p>
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
            {film.releaseYear ? <span>{film.releaseYear}</span> : null}
            {film.averageRating !== null ? (
              <span>★ {film.averageRating.toFixed(1)}</span>
            ) : null}
          </div>
          {film.genres?.length ? (
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
