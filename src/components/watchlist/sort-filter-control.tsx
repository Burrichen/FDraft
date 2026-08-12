"use client";

import { Check, SlidersHorizontal } from "lucide-react";
import {
  DEFAULT_WATCHLIST_FILTERS,
  DEFAULT_WATCHLIST_SORT,
  isDefaultWatchlistFilterState,
  WATCHLIST_RUNTIME_RANGE_OPTIONS,
  WATCHLIST_SORT_OPTIONS,
  type WatchlistFilterState,
  type WatchlistMetadataAvailability,
  type WatchlistRuntimeRange,
  type WatchlistSortOption,
} from "@/domain/watchlist/sort-filter";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface SortFilterControlProps {
  sort: WatchlistSortOption;
  filters: WatchlistFilterState;
  /** Every genre present in the current watchlist, for the Genre filter's option list — see docs/product-spec.md, "SMALL FILTERS". */
  availableGenres: string[];
  availableDecades: string[];
  onSortChange: (sort: WatchlistSortOption) => void;
  onFiltersChange: (filters: WatchlistFilterState) => void;
}

const METADATA_AVAILABILITY_OPTIONS: {
  value: WatchlistMetadataAvailability;
  label: string;
}[] = [
  { value: "available", label: "Available" },
  { value: "missing", label: "Missing" },
];

/**
 * The Watchlist page's "Sort & Filter" control (see docs/product-spec.md,
 * "WATCHLIST SORT / FILTER CONTROL"). A `Popover`, not a `Menu` —
 * adjusting a filter select shouldn't close the whole control the way
 * picking a menu item normally does, since a user is likely to change
 * several filters in one sitting.
 *
 * Purely a controlled view: every choice is reported upward via
 * `onSortChange`/`onFiltersChange` rather than owned here, so
 * `WatchlistView` stays the single place that persists the sort
 * preference and recomputes the visible film list.
 */
export function SortFilterControl({
  sort,
  filters,
  availableGenres,
  availableDecades,
  onSortChange,
  onFiltersChange,
}: SortFilterControlProps) {
  const isSortActive = sort !== DEFAULT_WATCHLIST_SORT;
  const isFilterActive = !isDefaultWatchlistFilterState(filters);
  const isActive = isSortActive || isFilterActive;

  function handleReset() {
    onSortChange(DEFAULT_WATCHLIST_SORT);
    onFiltersChange(DEFAULT_WATCHLIST_FILTERS);
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" className="relative">
            <SlidersHorizontal aria-hidden="true" />
            Sort &amp; Filter
            {isActive ? (
              <span
                aria-hidden="true"
                className="bg-watchlist-green ring-background absolute -top-1 -right-1 size-2.5 rounded-full ring-2"
              />
            ) : null}
          </Button>
        }
      />
      <PopoverContent align="end" aria-label="Sort and filter the watchlist">
        <div role="radiogroup" aria-label="Sort by" className="space-y-0.5">
          <p className="text-muted-foreground px-1.5 pb-1 text-xs font-semibold tracking-wide uppercase">
            Sort by
          </p>
          {WATCHLIST_SORT_OPTIONS.map((option) => {
            const isSelected = sort === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => onSortChange(option.value)}
                className={cn(
                  "hover:bg-accent focus-visible:outline-ring flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-1",
                  isSelected
                    ? "text-foreground font-medium"
                    : "text-muted-foreground",
                )}
              >
                <Check
                  aria-hidden="true"
                  className={cn(
                    "text-watchlist-green size-3.5 shrink-0",
                    !isSelected && "invisible",
                  )}
                />
                {option.label}
              </button>
            );
          })}
        </div>

        <div className="bg-border my-3 h-px" />

        <div className="space-y-2">
          <p className="text-muted-foreground px-1.5 text-xs font-semibold tracking-wide uppercase">
            Filter
          </p>

          <FilterSelect
            label="Genre"
            value={filters.genre ?? ""}
            onChange={(value) =>
              onFiltersChange({
                ...filters,
                genre: value === "" ? null : value,
              })
            }
            options={availableGenres.map((genre) => ({
              value: genre,
              label: genre,
            }))}
          />
          <FilterSelect
            label="Decade"
            value={filters.decade ?? ""}
            onChange={(value) =>
              onFiltersChange({
                ...filters,
                decade: value === "" ? null : value,
              })
            }
            options={availableDecades.map((decade) => ({
              value: decade,
              label: decade,
            }))}
          />
          <FilterSelect
            label="Runtime"
            value={filters.runtimeRange ?? ""}
            onChange={(value) =>
              onFiltersChange({
                ...filters,
                runtimeRange:
                  value === "" ? null : (value as WatchlistRuntimeRange),
              })
            }
            options={WATCHLIST_RUNTIME_RANGE_OPTIONS}
          />
          <FilterSelect
            label="Metadata"
            value={
              filters.metadataAvailability === "any"
                ? ""
                : filters.metadataAvailability
            }
            onChange={(value) =>
              onFiltersChange({
                ...filters,
                metadataAvailability:
                  value === ""
                    ? "any"
                    : (value as WatchlistMetadataAvailability),
              })
            }
            options={METADATA_AVAILABILITY_OPTIONS}
          />
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-3 w-full"
          onClick={handleReset}
          disabled={!isActive}
        >
          Reset
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  const id = `watchlist-filter-${label.toLowerCase()}`;
  const disabled = options.length === 0;
  return (
    <div className="flex items-center justify-between gap-3 px-1.5">
      <label htmlFor={id} className="text-foreground text-sm">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="border-border bg-background text-foreground focus-visible:outline-ring rounded-md border px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 disabled:opacity-50"
      >
        <option value="">Any</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
