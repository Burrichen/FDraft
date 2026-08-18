"use client";

import { Film, SlidersHorizontal, Upload } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { FilmCard } from "@/components/watchlist/film-card";
import type { WatchlistFilmCardView } from "@/components/watchlist/types";

/**
 * The main Watchlist poster grid (see docs/product-spec.md, "Normal
 * Watchlist Page", "WATCHED FILM UNDO", "WATCHLIST SORT / FILTER
 * CONTROL"). Films marked watched this session stay right here — faded,
 * with an Undo control — rather than disappearing the instant the eye
 * button is clicked; `FilmCard` reads that fade state live from
 * `useWatchUndo()`, so this component doesn't need to track any
 * hidden/visible set of its own.
 */
export function WatchlistGrid({
  films,
  hasImportedBefore,
  hasActiveFilters,
  onResetFilters,
  activeDraftId,
  entryIdsInDraft,
  onAddedToDraft,
}: {
  films: WatchlistFilmCardView[];
  /** Distinguishes "never imported anything" from "imported, and every film is already watched" — both leave `films` empty, but deserve different empty-state copy. */
  hasImportedBefore: boolean;
  /** Whether a non-default filter is currently narrowing `films` — an empty result because of THIS gets its own distinct empty state, never confused with "watchlist is empty"/"all caught up" (see docs/product-spec.md, "WATCHLIST SORT / FILTER CONTROL"). */
  hasActiveFilters: boolean;
  onResetFilters: () => void;
  /** The manual "Add to Draft" action (see docs/updates) — `null` when there's no usable active draft to add to, in which case `FilmCard` never renders the action at all. */
  activeDraftId: string | null;
  entryIdsInDraft: ReadonlySet<string>;
  onAddedToDraft: (entryId: string) => void;
}) {
  if (films.length === 0 && hasActiveFilters) {
    return (
      <EmptyState
        icon={SlidersHorizontal}
        title="No films match"
        description="Try a different search, or loosen/reset the filters above."
        action={
          <Button variant="outline" onClick={onResetFilters}>
            Clear search &amp; filters
          </Button>
        }
      />
    );
  }

  if (films.length === 0) {
    return (
      <EmptyState
        icon={Film}
        title={hasImportedBefore ? "All caught up!" : "Your watchlist is empty"}
        description={
          hasImportedBefore
            ? "You've marked every film here as watched."
            : "Import your Letterboxd watchlist.csv, or a full export .zip, to get started."
        }
        action={
          hasImportedBefore ? undefined : (
            <Button
              nativeButton={false}
              render={<Link href="/watchlist/import" />}
            >
              <Upload aria-hidden="true" />
              Import watchlist
            </Button>
          )
        }
      />
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {films.map((film) => (
        <li key={film.entryId}>
          <FilmCard
            film={film}
            activeDraftId={activeDraftId}
            isInActiveDraft={entryIdsInDraft.has(film.entryId)}
            onAddedToDraft={onAddedToDraft}
          />
        </li>
      ))}
    </ul>
  );
}
