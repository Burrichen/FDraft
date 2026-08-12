"use client";

import { ArrowUpDown, Check } from "lucide-react";
import {
  DEFAULT_HISTORICAL_DRAFT_SORT,
  HISTORICAL_DRAFT_SORT_OPTIONS,
  type HistoricalDraftSortOption,
} from "@/domain/drafts/history-sort";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * The same general sort control as the Watchlist page's "Sort & Filter"
 * (see docs/product-spec.md, "SORTING FOR FINALISED / HISTORICAL
 * DRAFTS"), scaled down for a single finalised draft's item list: sort
 * only, no filters — a historical draft's small, fixed film list doesn't
 * need narrowing the way an open-ended watchlist does. Purely a
 * controlled view, same as `SortFilterControl`: the choice is reported
 * upward via `onSortChange` rather than owned here.
 */
export function HistoricalDraftSortControl({
  sort,
  onSortChange,
}: {
  sort: HistoricalDraftSortOption;
  onSortChange: (sort: HistoricalDraftSortOption) => void;
}) {
  const isActive = sort !== DEFAULT_HISTORICAL_DRAFT_SORT;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="relative">
            <ArrowUpDown aria-hidden="true" />
            Sort
            {isActive ? (
              <span
                aria-hidden="true"
                className="bg-watchlist-green ring-background absolute -top-1 -right-1 size-2.5 rounded-full ring-2"
              />
            ) : null}
          </Button>
        }
      />
      <PopoverContent
        align="end"
        className="w-64"
        aria-label="Sort this draft's films"
      >
        <div role="radiogroup" aria-label="Sort by" className="space-y-0.5">
          {HISTORICAL_DRAFT_SORT_OPTIONS.map((option) => {
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
      </PopoverContent>
    </Popover>
  );
}
