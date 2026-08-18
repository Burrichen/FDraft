"use client";

import { Check, Film } from "lucide-react";
import { FilmMetadataLine } from "@/components/film-metadata-line";
import { cn } from "@/lib/utils";

export interface DiySelectableFilmView {
  entryId: string;
  title: string;
  releaseYear: number | null;
  runtimeMinutes: number | null;
  posterUrl: string | null;
  averageRating: number | null;
  /** ISO calendar date (YYYY-MM-DD) the film was added to the watchlist — see `domain/watchlist/sort-filter.ts`'s `SortableWatchlistFilm`, reused as-is by the recommendation questions' "longest on watchlist" sort. */
  dateAdded: string;
}

/**
 * A selectable film card for the DIY Draft selection screen (see
 * docs/updates, v1.1.0, "NEW DRAFTING MODE — DIY DRAFT") — deliberately
 * mirrors `components/watchlist/film-card.tsx`'s exact poster/title/
 * metadata layout so this screen reads as "a selectable version of the
 * Watchlist", not an unrelated new interface, but a SEPARATE component
 * rather than a new mode bolted onto `FilmCard`: the whole card toggles
 * selection here (there's nowhere to browse away to, unlike the
 * Watchlist's Letterboxd link), which is a different enough interaction
 * to earn its own small component instead of a third/fourth branch
 * inside an already-multi-purpose one.
 */
export function DiyFilmCard({
  film,
  selected,
  onToggle,
}: {
  film: DiySelectableFilmView;
  selected: boolean;
  onToggle: (entryId: string) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onToggle(film.entryId)}
      className={cn(
        "group focus-visible:outline-ring relative flex h-full flex-col overflow-hidden rounded-lg border text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2",
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
