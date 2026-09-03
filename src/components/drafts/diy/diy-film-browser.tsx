"use client";

import { Film } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SortFilterControl } from "@/components/watchlist/sort-filter-control";
import {
  collectAvailableDecades,
  collectAvailableGenres,
  DEFAULT_WATCHLIST_FILTERS,
  filterWatchlistFilms,
  isDefaultWatchlistFilterState,
  searchWatchlistFilms,
  sortWatchlistFilms,
  type WatchlistFilterState,
} from "@/domain/watchlist/sort-filter";
import { DiyFilmCard, type DiySelectableFilmView } from "./diy-film-card";

/**
 * The shared "browse the DIY-eligible watchlist" UI — search, sort/filter,
 * and the poster grid — factored out of the DIY Draft selection screen
 * (see docs/updates, v1.1.0, "NEW DRAFTING MODE — DIY DRAFT") so the
 * "Pick Your Own" Challenge Film picker can reuse the exact same browsing
 * experience instead of a second, cramped implementation (see
 * docs/updates, v1.1.2, "Redesign Challenge Films — Pick Your Own": "Do
 * not build a separate movie-browser implementation specifically for
 * Challenge Films"). Search/sort/filter are the exact same functions and
 * control the Watchlist page itself uses
 * (`domain/watchlist/sort-filter.ts`, `components/watchlist/
 * sort-filter-control.tsx`), not a reimplementation. Owns its own
 * search/sort/filter state — callers only ever see the resulting
 * `selectedEntryIds`/`onToggle` contract, never this component's
 * transient narrowing state.
 */
export function DiyFilmBrowser({
  films,
  selectedEntryIds,
  onToggle,
}: {
  films: readonly DiySelectableFilmView[];
  selectedEntryIds: ReadonlySet<string>;
  onToggle: (entryId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<WatchlistFilterState>(
    DEFAULT_WATCHLIST_FILTERS,
  );
  const [sort, setSort] =
    useState<Parameters<typeof sortWatchlistFilms>[1]>("date_added_desc");

  const availableGenres = useMemo(() => collectAvailableGenres(films), [films]);
  const availableDecades = useMemo(
    () => collectAvailableDecades(films),
    [films],
  );
  const visibleFilms = useMemo(() => {
    const searched = searchWatchlistFilms(films, search);
    const filtered = filterWatchlistFilms(
      searched.map((film) => ({ ...film, hasMetadata: true })),
      filters,
    );
    return sortWatchlistFilms(filtered, sort);
  }, [films, search, filters, sort]);
  const hasActiveNarrowing =
    !isDefaultWatchlistFilterState(filters) || search.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by title…"
            aria-label="Search your watchlist by title"
          />
        </div>
        <SortFilterControl
          sort={sort}
          filters={filters}
          availableGenres={availableGenres}
          availableDecades={availableDecades}
          onSortChange={setSort}
          onFiltersChange={setFilters}
        />
      </div>

      {visibleFilms.length === 0 ? (
        <EmptyState
          icon={Film}
          title="No films match"
          description={
            hasActiveNarrowing
              ? "Try a different search, or loosen/reset the filters above."
              : "Your watchlist doesn't have any eligible films right now."
          }
          action={
            hasActiveNarrowing ? (
              <Button
                variant="outline"
                onClick={() => {
                  setFilters(DEFAULT_WATCHLIST_FILTERS);
                  setSearch("");
                }}
              >
                Clear search &amp; filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul
          aria-label="Eligible films"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5"
        >
          {/* `min-w-0` on each grid item overrides its automatic minimum
              size — without it, a long `truncate`d title's full,
              unwrapped (`white-space: nowrap`) width becomes that item's
              floor, breaking out of its `minmax(0,1fr)` track and forcing
              the whole page to scroll horizontally (see docs/updates,
              v1.1.1/v1.1.2). */}
          {visibleFilms.map((film) => (
            <li key={film.entryId} className="min-w-0">
              <DiyFilmCard
                film={film}
                selected={selectedEntryIds.has(film.entryId)}
                onToggle={onToggle}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
