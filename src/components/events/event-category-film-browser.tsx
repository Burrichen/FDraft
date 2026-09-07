"use client";

import { Film } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchWatchlistFilms } from "@/domain/watchlist/sort-filter";
import {
  EventCategoryFilmCard,
  type EventCategorySelectableFilmView,
} from "./event-category-film-card";

/**
 * The "Choose My Own" browsing UI for a category-based Event (see
 * docs/updates, "FDRAFT UPDATE 1 — EVENT ONE AT A TIME DRAFTING" §6/§7) —
 * mirrors `DiyFilmBrowser`'s search-plus-poster-grid shell (reusing the
 * exact same `searchWatchlistFilms` title-search function — search is
 * search regardless of source), but with a simpler, honest default
 * ordering instead of the full Watchlist sort/filter set: watchlist-first
 * (§12's "highlighted/first"), then alphabetical. A curated category is a
 * short, small, editorially-fixed list — it has no real `dateAdded`/
 * `runtime` distribution worth a sort control, and fabricating a
 * placeholder `dateAdded` for a "Date Added" sort option would be
 * meaningless, dishonest data.
 */
export function EventCategoryFilmBrowser({
  films,
  selectedFilmIds,
  onToggle,
}: {
  films: readonly EventCategorySelectableFilmView[];
  selectedFilmIds: ReadonlySet<string>;
  onToggle: (filmId: string) => void;
}) {
  const [search, setSearch] = useState("");

  const visibleFilms = useMemo(() => {
    const searched = searchWatchlistFilms(films, search);
    return [...searched].sort((a, b) => {
      if (a.onWatchlist !== b.onWatchlist) {
        return a.onWatchlist ? -1 : 1;
      }
      return a.title.localeCompare(b.title);
    });
  }, [films, search]);

  return (
    <div className="space-y-4">
      <div className="relative min-w-48 flex-1 sm:max-w-xs">
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by title…"
          aria-label="Search this category by title"
        />
      </div>

      {visibleFilms.length === 0 ? (
        <EmptyState
          icon={Film}
          title="No films match"
          description={
            search.trim().length > 0
              ? "Try a different search."
              : "This category has no eligible films right now."
          }
          action={
            search.trim().length > 0 ? (
              <Button variant="outline" onClick={() => setSearch("")}>
                Clear search
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul
          aria-label="Eligible films"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5"
        >
          {visibleFilms.map((film) => (
            <li key={film.filmId} className="min-w-0">
              <EventCategoryFilmCard
                film={film}
                selected={selectedFilmIds.has(film.filmId)}
                onToggle={onToggle}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
