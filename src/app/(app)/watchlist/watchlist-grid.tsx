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
  activeDraftIsFull,
  eligibleEntryIds,
  eventDraft,
  eventDraftEntryIds,
  eventDraftIsFull,
  eventEligibleEntryIds,
  onAddedToEventDraft,
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
  /** Whether the target draft is already at the Living Drafts maximum (§3) — resolved once by the page, not per card. */
  activeDraftIsFull: boolean;
  /** Entries in the canonical manual-selection pool the add validates against; every other card's action explains itself instead of failing on click. */
  eligibleEntryIds: ReadonlySet<string>;
  /**
   * The profile's active EVENT Draft's action target (see docs/updates,
   * "FDRAFT v1.2.1 — LIVING DRAFTS" Part 3 §4), or `null` when there is
   * none accepting additions. The three sets/flags beside it are resolved
   * once by the page — this grid derives only which of them apply to each
   * card, and no Event rule is evaluated here.
   */
  eventDraft: {
    draftId: string;
    eventName: string;
    accentClassName?: string;
  } | null;
  eventDraftEntryIds: ReadonlySet<string>;
  eventDraftIsFull: boolean;
  eventEligibleEntryIds: ReadonlySet<string>;
  onAddedToEventDraft: (entryId: string) => void;
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
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
      {films.map((film) => {
        const isInEventDraft = eventDraftEntryIds.has(film.entryId);
        return (
          <li key={film.entryId}>
            <FilmCard
              film={film}
              activeDraftId={activeDraftId}
              isInActiveDraft={entryIdsInDraft.has(film.entryId)}
              activeDraftIsFull={activeDraftIsFull}
              isEligibleForDraft={eligibleEntryIds.has(film.entryId)}
              onAddedToDraft={onAddedToDraft}
              // The Event action appears only for a film that Event
              // actually accepts — or one already in its Draft, which
              // shows as such rather than silently losing its badge.
              eventDraft={
                eventDraft &&
                (isInEventDraft || eventEligibleEntryIds.has(film.entryId))
                  ? {
                      ...eventDraft,
                      isInEventDraft,
                      isFull: eventDraftIsFull,
                    }
                  : null
              }
              onAddedToEventDraft={onAddedToEventDraft}
            />
          </li>
        );
      })}
    </ul>
  );
}
