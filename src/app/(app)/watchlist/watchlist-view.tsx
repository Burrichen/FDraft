"use client";

import { Search, Shuffle, Upload } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  getWatchlistSortPreference,
  setWatchlistSortPreference,
} from "@/application/watchlist/watchlist-sort-preference";
import { getDiyEligibleFilms } from "@/application/drafts/local-diy-candidates";
import { resolveEventDraftFilmAddition } from "@/application/events/event-draft-additions";
import { getEventAccent } from "@/components/events/event-accents";
import { resolveEventDraftAdditionPolicy } from "@/domain/events/event-draft-additions";
import { getEventDefinition } from "@/domain/events/event-registry";
import { mergeLocalFilmMetadata } from "@/application/watchlist/merge-local-film-metadata";
import { AsyncDataError } from "@/components/async-data-error";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWatchUndo } from "@/components/watch-undo/watch-undo-provider";
import { SortFilterControl } from "@/components/watchlist/sort-filter-control";
import type { WatchlistFilmCardView } from "@/components/watchlist/types";
import {
  resolveCurrentDraftFilmCount,
  resolveDraftCapacity,
} from "@/domain/drafts/living-draft";
import { createDefaultRng } from "@/domain/shared/rng";
import { isWatchlistStale } from "@/domain/watchlist/stale-import";
import {
  collectAvailableDecades,
  collectAvailableGenres,
  DEFAULT_WATCHLIST_FILTERS,
  filterWatchlistFilms,
  isDefaultWatchlistFilterState,
  searchWatchlistFilms,
  sortWatchlistFilms,
  type WatchlistFilterState,
  type WatchlistSortOption,
} from "@/domain/watchlist/sort-filter";
import { useAsyncData } from "@/hooks/use-async-data";
import type { Repositories } from "@/repositories";
import type { WatchlistEntryRecord } from "@/repositories/records";
import { StaleImportWarning } from "./stale-import-warning";
import { WatchlistGrid } from "./watchlist-grid";

export function WatchlistView() {
  const { activeProfile, repositories } = useProfileContext();
  const watchUndo = useWatchUndo();

  const { data, isLoading, error, reload } = useAsyncData(async () => {
    if (!activeProfile) return null;
    const activeEntries = await repositories.watchlist.listActiveEntries(
      activeProfile.id,
    );

    // A film watched earlier THIS session, then navigated away from and
    // back to, is no longer active in the database — correctly so — but the
    // undo opportunity must still be here (see docs/product-spec.md,
    // "WATCHED FILM UNDO", "UNDO WINDOW": "Navigate between FDraft pages ->
    // Undo still available. Return to page -> Undo still available."). Fetch
    // those specific entries even though a plain active-only query would no
    // longer include them.
    const activeIds = new Set(activeEntries.map((entry) => entry.id));
    const pendingGhostEntries = (
      await Promise.all(
        watchUndo
          .listPendingEntryIds()
          .filter((id) => !activeIds.has(id))
          .map((id) =>
            repositories.watchlist.getEntryById(activeProfile.id, id),
          ),
      )
    ).filter((entry): entry is WatchlistEntryRecord => entry !== null);
    const entries = [...activeEntries, ...pendingGhostEntries];

    const filmIds = entries.map((entry) => entry.filmId);
    const [filmsById, metadataByFilmId] = await Promise.all([
      repositories.films.getByIds(filmIds),
      repositories.films.getMetadataForFilms(filmIds),
    ]);
    const lastImport = await repositories.watchlist.getLatestCompletedImport(
      activeProfile.id,
    );
    const initialSort = await getWatchlistSortPreference(
      repositories,
      activeProfile.id,
    );

    // The manual "Add to Draft" action (see docs/updates) only ever
    // targets a genuinely active NORMAL draft — never expired/archived,
    // and never an event's own draft, which is an entirely separate slot
    // (see docs/updates, "PROMPT B2.1 — DUAL DRAFT ARCHITECTURE") with its
    // own action below.
    const draftRecord = await repositories.drafts.getActiveOrExpiredDraft(
      activeProfile.id,
      null,
    );
    const activeDraft = draftRecord?.status === "active" ? draftRecord : null;
    const draftItems = activeDraft
      ? await repositories.drafts.listItemsForDraft(activeDraft.id)
      : [];
    const entryIdsInDraft = new Set(
      draftItems
        .map((item) => item.watchlistEntryId)
        .filter((id): id is string => id !== null),
    );
    // The two things the Add action needs beyond "is there a draft?" (see
    // docs/updates, "FDRAFT v1.2.1 — LIVING DRAFTS" §3/§7): how full that
    // draft already is, and which entries the action would actually
    // accept. Both resolved HERE, once, from the same sources the
    // mutations themselves use — `resolveCurrentDraftFilmCount` over the
    // draft's real items, and the canonical manual-selection pool — so a
    // card can explain itself instead of only failing on click.
    //
    // Loaded whether or not a draft exists: with one, it gates adding to
    // it; without one, it gates STARTING a draft from that film (Part 2
    // §4), which `createLocalDraft` validates against this exact pool.
    const eligibleFilms = await getDiyEligibleFilms(
      repositories,
      activeProfile.id,
    );
    const eligibleEntryIds = new Set(eligibleFilms.map((film) => film.entryId));

    // The EVENT half of the action (see docs/updates, "FDRAFT v1.2.1 —
    // LIVING DRAFTS" Part 3 §4/§8/§9/§10). An Event Draft is a separate,
    // independently active slot, so this is a second lookup rather than a
    // variant of the one above.
    //
    // Chosen by asking each active Event Draft's own Event whether it
    // accepts manual additions at all — `resolveEventDraftAdditionPolicy`,
    // read off the `EventDefinition` — so January's single-film mechanic
    // excludes itself here by what it declares, with no event id in this
    // page (§8/§9), and a future Event opts in or out purely through its
    // own definition.
    const activeEventDraft =
      (await repositories.drafts.listActiveDrafts(activeProfile.id)).find(
        (draft) =>
          draft.sourceEventId !== null &&
          resolveEventDraftAdditionPolicy(draft.sourceEventId).addEnabled,
      ) ?? null;
    const eventDraftEntryIds = new Set<string>();
    let eventDraftFilmCount = 0;
    if (activeEventDraft) {
      const eventItems = await repositories.drafts.listItemsForDraft(
        activeEventDraft.id,
      );
      eventDraftFilmCount = resolveCurrentDraftFilmCount(eventItems);
      for (const item of eventItems) {
        if (item.watchlistEntryId)
          eventDraftEntryIds.add(item.watchlistEntryId);
      }
    }
    // Which of THIS profile's eligible films the Event itself accepts —
    // resolved through the shared `resolveEventDraftFilmAddition`, which
    // evaluates the Event's own eligibility rules. No Event eligibility
    // logic lives in this page or in the card (§4).
    const eventEligibleEntryIds = new Set(
      activeEventDraft
        ? eligibleFilms
            .filter(
              (film) =>
                resolveEventDraftFilmAddition({
                  draft: activeEventDraft,
                  film: {
                    watchlistEntryId: film.entryId,
                    filmId: film.filmId,
                    genres: film.genres,
                    averageRating: film.averageRating,
                  },
                }).allowed,
            )
            .map((film) => film.entryId)
        : [],
    );
    const eventDraftView =
      activeEventDraft && activeEventDraft.sourceEventId
        ? {
            draftId: activeEventDraft.id,
            eventName:
              getEventDefinition(activeEventDraft.sourceEventId)?.name ??
              "Event",
            accentClassName: getEventAccent(activeEventDraft.sourceEventId)
              ?.actionClassName,
          }
        : null;

    const cards: WatchlistFilmCardView[] = entries.map((entry) => {
      const film = filmsById.get(entry.filmId) ?? null;
      const metadata = mergeLocalFilmMetadata(
        metadataByFilmId.get(entry.filmId) ?? [],
      );
      return {
        entryId: entry.id,
        filmId: entry.filmId,
        title: film?.title ?? "Untitled",
        dateAdded: entry.dateAdded,
        releaseYear: film?.releaseYear ?? null,
        runtimeMinutes: metadata.runtimeMinutes,
        letterboxdUri: film?.letterboxdUri ?? null,
        posterUrl: metadata.posterUrl,
        averageRating: metadata.averageRating,
        genres: metadata.genres,
        hasMetadata:
          metadata.posterUrl !== null ||
          metadata.genres !== null ||
          metadata.averageRating !== null ||
          metadata.runtimeMinutes !== null,
      };
    });

    const stale = isWatchlistStale({
      lastImportCompletedAt: lastImport?.completedAt
        ? new Date(lastImport.completedAt)
        : null,
      now: new Date(),
      timezone: activeProfile.timezone,
    });

    return {
      films: cards,
      stale,
      lastImportCompletedAt: lastImport?.completedAt ?? null,
      initialSort,
      activeDraftId: activeDraft?.id ?? null,
      entryIdsInDraft,
      eventDraftView,
      eventDraftEntryIds,
      eventDraftFilmCount,
      eventEligibleEntryIds,
      draftFilmCount: resolveCurrentDraftFilmCount(draftItems),
      eligibleEntryIds,
    };
  }, [activeProfile?.id, repositories]);

  if (!activeProfile) {
    return null;
  }
  if (error) {
    return <AsyncDataError error={error} onRetry={reload} />;
  }
  if (isLoading || !data) {
    return null;
  }

  // Recomputed on every render straight from the live session context —
  // not part of the (deliberately non-reactive) fetch above — so marking a
  // film watched or undoing that updates this count immediately, the same
  // way it already fades/unfades that film's own card, without needing a
  // full page refetch (see docs/product-spec.md, "WATCHED FILM UNDO"). A
  // film with a pending undo is visually still here but already
  // conceptually off the watchlist, so it doesn't count.
  const activeFilmCount = data.films.filter(
    (film) => !watchUndo.getRecord(film.entryId),
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-heading">Watchlist</h1>
          <p className="page-subtitle">
            {activeFilmCount} {activeFilmCount === 1 ? "film" : "films"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/watchlist/random" />}
          >
            <Shuffle aria-hidden="true" />
            Random film
          </Button>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/watchlist/import" />}
          >
            <Upload aria-hidden="true" />
            Import
          </Button>
        </div>
      </div>

      {data.lastImportCompletedAt ? (
        <StaleImportWarning
          stale={data.stale}
          lastImportCompletedAt={data.lastImportCompletedAt}
        />
      ) : null}

      <WatchlistBody
        films={data.films}
        initialSort={data.initialSort}
        hasImportedBefore={data.lastImportCompletedAt !== null}
        profileId={activeProfile.id}
        repositories={repositories}
        activeDraftId={data.activeDraftId}
        initialEntryIdsInDraft={data.entryIdsInDraft}
        initialDraftFilmCount={data.draftFilmCount}
        eligibleEntryIds={data.eligibleEntryIds}
        eventDraft={data.eventDraftView}
        initialEventDraftEntryIds={data.eventDraftEntryIds}
        initialEventDraftFilmCount={data.eventDraftFilmCount}
        eventEligibleEntryIds={data.eventEligibleEntryIds}
      />
    </div>
  );
}

/**
 * Owns the Watchlist page's sort/filter state (see docs/product-spec.md,
 * "WATCHLIST SORT / FILTER CONTROL") and renders the "Sort & Filter"
 * control plus the resulting grid. Split out from `WatchlistView` so
 * `initialSort` — read from the profile's persisted preference inside that
 * component's async loader — can seed `useState` directly on first render
 * here, with no flash of the wrong default while `WatchlistView` is still
 * loading (that component doesn't render this one at all until its data,
 * including `initialSort`, is ready).
 */
function WatchlistBody({
  films,
  initialSort,
  hasImportedBefore,
  profileId,
  repositories,
  activeDraftId,
  initialEntryIdsInDraft,
  initialDraftFilmCount,
  eligibleEntryIds,
  eventDraft,
  initialEventDraftEntryIds,
  initialEventDraftFilmCount,
  eventEligibleEntryIds,
}: {
  films: WatchlistFilmCardView[];
  initialSort: WatchlistSortOption;
  hasImportedBefore: boolean;
  profileId: string;
  repositories: Repositories;
  /** The manual "Add to Draft" action's target (see docs/updates) — `null` when there's no usable active draft. */
  activeDraftId: string | null;
  initialEntryIdsInDraft: ReadonlySet<string>;
  /** How many films that draft holds right now — tracked as state below, since each add grows it (see docs/updates, "FDRAFT v1.2.1 — LIVING DRAFTS" §3). */
  initialDraftFilmCount: number;
  eligibleEntryIds: ReadonlySet<string>;
  /** The profile's active EVENT Draft's action target, or `null` when there is none that accepts additions (see docs/updates, "FDRAFT v1.2.1 — LIVING DRAFTS" Part 3 §4). */
  eventDraft: {
    draftId: string;
    eventName: string;
    accentClassName?: string;
  } | null;
  initialEventDraftEntryIds: ReadonlySet<string>;
  initialEventDraftFilmCount: number;
  /** Entries that Event's OWN eligibility rules accept — resolved by the loader through the shared Event service. */
  eventEligibleEntryIds: ReadonlySet<string>;
}) {
  const [sort, setSort] = useState<WatchlistSortOption>(initialSort);
  const [filters, setFilters] = useState<WatchlistFilterState>(
    DEFAULT_WATCHLIST_FILTERS,
  );
  const [search, setSearch] = useState("");
  // Seeded from the initial fetch, then updated immediately on a
  // successful manual add — see "Reflect immediately when a film is
  // already in the draft" — without waiting for a full page refetch.
  const [entryIdsInDraft, setEntryIdsInDraft] = useState(
    initialEntryIdsInDraft,
  );
  // Grown alongside `entryIdsInDraft` for the same reason — so the 30-film
  // ceiling is reflected the moment the draft reaches it, rather than only
  // after a refetch. Counted, not derived from that set's size: an entry-
  // less item (a curated Event pool film) still occupies a slot.
  const [draftFilmCount, setDraftFilmCount] = useState(initialDraftFilmCount);
  // Bumped every time "Shuffle" is deliberately (re-)chosen — the `rng`
  // below is only recreated when this changes, which is what makes a
  // shuffle's resulting order stable across unrelated re-renders (marking
  // a film watched, an unrelated context update, ...) but freshly random
  // every time the user actually asks for a new one. See
  // docs/product-spec.md, "SORT PERSISTENCE": "Do not persist a one-time
  // Shuffle result as the permanent order. Shuffle should create a new
  // random ordering when deliberately invoked."
  const [shuffleNonce, setShuffleNonce] = useState(0);
  // `shuffleNonce` isn't read inside the factory — it's a deliberate
  // cache-buster, the only thing that should force a fresh `Rng` (and thus
  // a fresh shuffle) to be created.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rng = useMemo(() => createDefaultRng(), [shuffleNonce]);

  function handleSortChange(next: WatchlistSortOption) {
    setSort(next);
    if (next === "shuffle") {
      setShuffleNonce((n) => n + 1);
    }
    // Only the chosen MODE is persisted, never a resulting order — see the
    // module doc comment on `setWatchlistSortPreference`.
    void setWatchlistSortPreference(repositories, profileId, next);
  }

  const availableGenres = useMemo(() => collectAvailableGenres(films), [films]);
  const availableDecades = useMemo(
    () => collectAvailableDecades(films),
    [films],
  );

  const visibleFilms = useMemo(() => {
    const searched = searchWatchlistFilms(films, search);
    const filtered = filterWatchlistFilms(searched, filters);
    return sortWatchlistFilms(
      filtered,
      sort,
      sort === "shuffle" ? rng : undefined,
    );
  }, [films, search, filters, sort, rng]);

  const hasActiveNarrowing =
    !isDefaultWatchlistFilterState(filters) || search.trim().length > 0;

  // The Event Draft is a separate slot, so its own membership and size are
  // tracked separately — an Event addition must never make a film read as
  // "in draft" for the normal Draft, or count toward its capacity.
  const [eventDraftEntryIds, setEventDraftEntryIds] = useState(
    initialEventDraftEntryIds,
  );
  const [eventDraftFilmCount, setEventDraftFilmCount] = useState(
    initialEventDraftFilmCount,
  );
  const eventDraftCapacity = resolveDraftCapacity(eventDraftFilmCount);

  function handleAddedToEventDraft(entryId: string) {
    setEventDraftEntryIds((prev) => new Set(prev).add(entryId));
    setEventDraftFilmCount((count) => count + 1);
  }

  function handleAddedToDraft(entryId: string) {
    setEntryIdsInDraft((prev) => new Set(prev).add(entryId));
    setDraftFilmCount((count) => count + 1);
  }

  // THE shared answer to "can another film be added?" — the same helper
  // `addManualFilmToLocalDraft` enforces with, so the control's state and
  // the mutation's verdict can never disagree.
  const draftCapacity = resolveDraftCapacity(draftFilmCount);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <Search
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
          />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by title…"
            aria-label="Search watchlist by title"
            className="pl-8"
          />
        </div>
        <SortFilterControl
          sort={sort}
          filters={filters}
          availableGenres={availableGenres}
          availableDecades={availableDecades}
          onSortChange={handleSortChange}
          onFiltersChange={setFilters}
        />
      </div>

      <WatchlistGrid
        films={visibleFilms}
        hasImportedBefore={hasImportedBefore}
        hasActiveFilters={hasActiveNarrowing}
        onResetFilters={() => {
          setFilters(DEFAULT_WATCHLIST_FILTERS);
          setSearch("");
        }}
        activeDraftId={activeDraftId}
        entryIdsInDraft={entryIdsInDraft}
        activeDraftIsFull={!draftCapacity.canAddFilm}
        eligibleEntryIds={eligibleEntryIds}
        eventDraft={eventDraft}
        eventDraftEntryIds={eventDraftEntryIds}
        eventDraftIsFull={!eventDraftCapacity.canAddFilm}
        eventEligibleEntryIds={eventEligibleEntryIds}
        onAddedToEventDraft={handleAddedToEventDraft}
        onAddedToDraft={handleAddedToDraft}
      />
    </>
  );
}
