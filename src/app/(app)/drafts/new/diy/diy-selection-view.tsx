"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { createLocalDraftFromSelection } from "@/application/drafts/local-draft-service";
import { getDiyEligibleFilms } from "@/application/drafts/local-diy-candidates";
import { AsyncDataError } from "@/components/async-data-error";
import { DiyFilmCard } from "@/components/drafts/diy/diy-film-card";
import { RecommendationSidebar } from "@/components/drafts/diy/recommendation-sidebar";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/ui/input";
import { SortFilterControl } from "@/components/watchlist/sort-filter-control";
import {
  getDifficulty,
  isDraftDifficulty,
  isFreeform,
} from "@/domain/drafts/difficulty";
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
import { useAsyncData } from "@/hooks/use-async-data";
import { Film } from "lucide-react";

/**
 * The DIY Draft selection screen (see docs/updates, v1.1.0, "NEW
 * DRAFTING MODE — DIY DRAFT") — a "selectable version of the Watchlist"
 * reached from `/drafts/new` once a difficulty and deadline are chosen
 * there. Loads the ONE canonical eligible-candidate set every DIY surface
 * shares (`getDiyEligibleFilms`, itself built on the same eligibility
 * every draft-generation path uses) so a film that couldn't be randomly
 * drafted (unreleased, already watched, an unstarted later series entry,
 * a metadata identity mismatch) can't be manually selected or
 * recommended either — see docs/updates, v1.1.1, "Centralise DIY
 * recommendation eligibility". Search/sort/filter are the exact same
 * functions and control the Watchlist page itself uses
 * (`domain/watchlist/sort-filter.ts`,
 * `components/watchlist/sort-filter-control.tsx`), not a reimplementation.
 */
export function DiySelectionView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeProfile, repositories } = useProfileContext();

  const rawDifficulty = searchParams.get("difficulty");
  const rawTimeMode = searchParams.get("timeMode");
  const difficulty = isDraftDifficulty(rawDifficulty) ? rawDifficulty : null;
  const timeMode =
    rawTimeMode === "calendar" || rawTimeMode === "timer" ? rawTimeMode : null;

  const { data, isLoading, error, reload } = useAsyncData(async () => {
    if (!activeProfile) return null;
    const eligibleFilms = await getDiyEligibleFilms(
      repositories,
      activeProfile.id,
    );
    return { eligibleFilms, now: new Date() };
  }, [activeProfile?.id, repositories]);

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<WatchlistFilterState>(
    DEFAULT_WATCHLIST_FILTERS,
  );
  const [sort, setSort] =
    useState<Parameters<typeof sortWatchlistFilms>[1]>("date_added_desc");
  const [selectedEntryIds, setSelectedEntryIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [isCreating, setIsCreating] = useState(false);

  const films = useMemo(() => data?.eligibleFilms ?? [], [data]);
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

  function handleToggle(entryId: string) {
    setSelectedEntryIds((current) => {
      const next = new Set(current);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }
      return next;
    });
  }

  if (!activeProfile) {
    return null;
  }
  if (!difficulty || !timeMode) {
    return (
      <div className="max-w-2xl space-y-6">
        <AsyncDataError
          error={new Error("Missing or invalid draft configuration.")}
          onRetry={() => router.replace("/drafts/new")}
        />
      </div>
    );
  }
  if (error) {
    return <AsyncDataError error={error} onRetry={reload} />;
  }
  if (isLoading || !data) {
    return null;
  }

  const freeform = isFreeform(difficulty);
  const requiredCount = freeform ? null : getDifficulty(difficulty).filmCount!;
  const isValidSelection = freeform
    ? selectedEntryIds.size > 0
    : selectedEntryIds.size === requiredCount;

  async function handleCreate() {
    if (!activeProfile || !difficulty || !timeMode) return;
    setIsCreating(true);
    try {
      const outcome = await createLocalDraftFromSelection(repositories, {
        profileId: activeProfile.id,
        timezone: activeProfile.timezone,
        difficulty,
        timeMode,
        watchlistEntryIds: [...selectedEntryIds],
      });
      if (!outcome.ok) {
        toast.error(outcome.message);
        return;
      }
      router.push("/drafts");
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not create this draft.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-heading">Build your own draft</h1>
        <p className="page-subtitle">
          {freeform
            ? "Select the films you want in your Freeform draft."
            : `Select exactly ${requiredCount} films for your ${getDifficulty(difficulty).label} draft.`}
        </p>
      </div>

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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_260px]">
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
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
          >
            {/* `min-w-0` on each grid item overrides its automatic
                minimum size — without it, a long `truncate`d title's
                full, unwrapped (`white-space: nowrap`) width becomes
                that item's floor, breaking out of its `minmax(0,1fr)`
                track and forcing the whole page to scroll horizontally. */}
            {visibleFilms.map((film) => (
              <li key={film.entryId} className="min-w-0">
                <DiyFilmCard
                  film={film}
                  selected={selectedEntryIds.has(film.entryId)}
                  onToggle={handleToggle}
                />
              </li>
            ))}
          </ul>
        )}

        <RecommendationSidebar
          films={films}
          selectedEntryIds={selectedEntryIds}
          onToggle={handleToggle}
          now={data.now}
        />
      </div>

      <div className="border-border bg-card sticky bottom-4 flex items-center justify-between gap-3 rounded-lg border p-4">
        <p className="text-foreground text-sm font-medium">
          {`${selectedEntryIds.size}${requiredCount !== null ? ` / ${requiredCount}` : ""} selected`}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/drafts/new" />}
          >
            Back
          </Button>
          <Button
            type="button"
            disabled={!isValidSelection || isCreating}
            onClick={() => void handleCreate()}
          >
            {isCreating ? "Creating draft…" : "Create draft"}
          </Button>
        </div>
      </div>
    </div>
  );
}
