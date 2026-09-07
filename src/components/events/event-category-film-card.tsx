"use client";

import { Check, Film } from "lucide-react";
import { FilmMetadataLine } from "@/components/film-metadata-line";
import { cn } from "@/lib/utils";

/**
 * A "Choose My Own" candidate for a category-based Event (see docs/updates,
 * "FDRAFT UPDATE 1 — EVENT ONE AT A TIME DRAFTING" §6/§7) — `filmId`-keyed,
 * unlike `DiySelectableFilmView` (`watchlistEntryId`-keyed), since a
 * curated Event category film routinely has no watchlist entry at all
 * (see `DraftItemRecord.watchlistEntryId`'s own doc comment on Halloween's
 * existing Horror/Kitsch convention).
 */
export interface EventCategorySelectableFilmView {
  filmId: string;
  title: string;
  releaseYear: number | null;
  runtimeMinutes: number | null;
  posterUrl: string | null;
  averageRating: number | null;
  /** Also on the profile's active watchlist — see §12, "Watchlist films highlighted/first." */
  onWatchlist: boolean;
}

/**
 * A selectable film card for the Event category picker — mirrors
 * `DiyFilmCard`'s exact poster/title/metadata layout (so this reads as "a
 * selectable version of the Watchlist," the same established convention),
 * keyed by `filmId` instead of `entryId`, with an added "On your watchlist"
 * badge for the watchlist-first highlighting §12 asks for.
 */
export function EventCategoryFilmCard({
  film,
  selected,
  onToggle,
}: {
  film: EventCategorySelectableFilmView;
  selected: boolean;
  onToggle: (filmId: string) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onToggle(film.filmId)}
      className={cn(
        "group focus-visible:outline-ring relative flex h-full w-full flex-col overflow-hidden rounded-lg border text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2",
        selected
          ? "border-primary bg-secondary"
          : "border-border bg-card hover:border-primary/50",
      )}
    >
      {selected ? (
        <div
          className="bg-primary text-primary-foreground absolute top-2 left-2 z-10 flex items-center gap-1 rounded-full px-2 py-1 text-[0.65rem] font-semibold"
          aria-hidden="true"
        >
          <Check className="size-3" />
          Selected
        </div>
      ) : null}
      {film.onWatchlist ? (
        <div
          className="bg-card/90 text-foreground absolute top-2 right-2 z-10 rounded-full border px-2 py-1 text-[0.65rem] font-semibold"
          aria-hidden="true"
        >
          On your watchlist
        </div>
      ) : null}
      <div className="bg-muted aspect-2/3 w-full shrink-0 overflow-hidden">
        {film.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- posters are external, remote URLs from third-party providers
          <img
            src={film.posterUrl}
            alt=""
            className={cn(
              "h-full w-full object-cover transition-transform group-hover:scale-105",
              selected && "opacity-90",
            )}
          />
        ) : (
          <div className="text-muted-foreground flex h-full w-full items-center justify-center">
            <Film aria-hidden="true" className="size-8" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col space-y-1 p-2.5">
        <p className="text-foreground truncate text-sm font-semibold">
          {film.title}
        </p>
        <FilmMetadataLine
          releaseYear={film.releaseYear}
          runtimeMinutes={film.runtimeMinutes}
          averageRating={film.averageRating}
        />
      </div>
    </button>
  );
}
