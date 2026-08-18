"use client";

import { Check, Circle, History } from "lucide-react";
import { useState } from "react";
import { listRecentlyWatchedFilms } from "@/application/history/recently-watched";
import { mergeLocalFilmMetadata } from "@/application/watchlist/merge-local-film-metadata";
import { AsyncDataError } from "@/components/async-data-error";
import { EmptyState } from "@/components/empty-state";
import { HistoricalDraftSortControl } from "@/components/drafts/historical-draft-sort-control";
import { RecentlyWatchedSection } from "@/components/drafts/recently-watched-section";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Badge } from "@/components/ui/badge";
import { challengeRegistry } from "@/domain/challenges/catalogue";
import { getDraftDisplayName } from "@/domain/drafts/draft-name";
import { FREEFORM_RANK_LABELS } from "@/domain/drafts/freeform";
import {
  DEFAULT_HISTORICAL_DRAFT_SORT,
  sortHistoricalDraftItems,
  type HistoricalDraftSortOption,
} from "@/domain/drafts/history-sort";
import { formatReadableCalendarDate, formatReadableDate } from "@/lib/utils";
import { useAsyncData } from "@/hooks/use-async-data";
import type {
  DraftItemRecord,
  DraftRecord,
  DraftTimeMode,
  FilmRecord,
  PostmortemResponseType,
} from "@/repositories";

const TIME_MODE_LABELS: Record<DraftTimeMode, string> = {
  calendar: "Calendar mode",
  timer: "Timer mode",
};

const POSTMORTEM_LABELS: Record<PostmortemResponseType, string> = {
  wanted_more_time: "Wanted more time",
  not_interested: "Not interested",
  no_reason: "No reason given",
};

interface HistoricalDraftItemView {
  item: DraftItemRecord;
  film: FilmRecord | null;
  postmortemResponse: PostmortemResponseType | null;
  runtimeMinutes: number | null;
  averageRating: number | null;
  /** ISO calendar date this item was actually watched, or `null` if it never was. */
  watchedDate: string | null;
}

/**
 * The History page (see docs/product-spec.md, "HISTORY PAGE REDESIGN") —
 * two clearly separated sections, never one undifferentiated feed:
 * "Recently Watched" (the 5 most recent watched-history records,
 * profile-wide) and "Previous Drafts" (every archived draft, each
 * expandable to its full film list). Both are built entirely from
 * persisted draft/history/film records, never the current watchlist — see
 * "HISTORY DATA INTEGRITY" — so a film later removed from, re-imported
 * into, or metadata-refreshed on the watchlist can never silently rewrite
 * what these report about the past.
 */
export default function DraftHistoryPage() {
  const { activeProfile, repositories } = useProfileContext();

  const { data, isLoading, error, reload } = useAsyncData(async () => {
    if (!activeProfile) return null;
    const recentlyWatched = await listRecentlyWatchedFilms(
      repositories,
      activeProfile.id,
    );

    const drafts = await repositories.drafts.listArchived(activeProfile.id);
    // One lookup for the whole profile's watched history, reused across
    // every draft below — cheap (a single indexed query) next to N draft
    // detail fetches, and this is the only way to recover "Watched Date"
    // for an item: `DraftItemRecord` only stores the id of the
    // `WatchedHistoryRecord` its completion created, not the date itself.
    const watchedHistory = await repositories.history.listWatchedHistory(
      activeProfile.id,
    );
    const watchedDateById = new Map(
      watchedHistory.map((entry) => [entry.id, entry.watchedDate]),
    );

    const previousDrafts = await Promise.all(
      drafts.map(async (draft) => {
        const items = (
          await repositories.drafts.listItemsForDraft(draft.id)
        ).sort((a, b) => a.orderIndex - b.orderIndex);
        const films = await Promise.all(
          items.map((item) => repositories.films.getById(item.filmId)),
        );
        const metadataByFilmId = await repositories.films.getMetadataForFilms(
          items.map((item) => item.filmId),
        );
        const responses =
          await repositories.history.listPostmortemResponsesForDraft(draft.id);
        const responseByItemId = new Map(
          responses.map((response) => [
            response.draftItemId,
            response.response,
          ]),
        );

        const itemViews: HistoricalDraftItemView[] = items.map(
          (item, index) => {
            const metadata = mergeLocalFilmMetadata(
              metadataByFilmId.get(item.filmId) ?? [],
            );
            return {
              item,
              film: films[index],
              postmortemResponse: responseByItemId.get(item.id) ?? null,
              runtimeMinutes: metadata.runtimeMinutes,
              averageRating: metadata.averageRating,
              watchedDate: item.watchedHistoryId
                ? (watchedDateById.get(item.watchedHistoryId) ?? null)
                : null,
            };
          },
        );

        return { draft, items: itemViews };
      }),
    );

    return { recentlyWatched, previousDrafts };
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-heading">Draft history</h1>
        <p className="page-subtitle">
          Films you&apos;ve actually watched, and your past Monthly Watchlist
          Drafts.
        </p>
      </div>

      <RecentlyWatchedSection films={data.recentlyWatched} />

      <section className="space-y-3">
        <h2 className="text-foreground text-lg font-bold">Previous Drafts</h2>
        {data.previousDrafts.length === 0 ? (
          <EmptyState
            icon={History}
            title="No past drafts yet"
            description="Completed and expired drafts will show up here once you've run one."
          />
        ) : (
          <ul className="space-y-4">
            {data.previousDrafts.map(({ draft, items }) => (
              <HistoricalDraftEntry
                key={draft.id}
                draft={draft}
                items={items}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * One finalised draft's collapsible entry, including its own sort control
 * (see docs/product-spec.md, "SORTING FOR FINALISED / HISTORICAL
 * DRAFTS"). Sort state is local to this component and always starts at
 * `DEFAULT_HISTORICAL_DRAFT_SORT` ("Original Draft Order") — never
 * persisted, and applied only to a copy of `items` at render time.
 * `items` (and, within it, every `item.orderIndex`) is exactly what was
 * fetched from the database and never reassigned here, so the original
 * generated draft position is always intact underneath whatever sort is
 * currently showing.
 *
 * Films are always split into "WATCHED"/"NOT WATCHED" groups (see
 * docs/product-spec.md, "HISTORICAL DRAFT FILMS": "Clearly distinguish:
 * Watched and Not Watched") — the chosen sort still controls ordering,
 * applied once up front and then partitioned by status, which preserves
 * each group's relative order exactly as that sort produced it.
 */
function HistoricalDraftEntry({
  draft,
  items,
}: {
  draft: DraftRecord;
  items: HistoricalDraftItemView[];
}) {
  const [sort, setSort] = useState<HistoricalDraftSortOption>(
    DEFAULT_HISTORICAL_DRAFT_SORT,
  );

  const completedCount = items.filter(({ item }) => item.isCompleted).length;
  const completionPercent =
    items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0;

  const sortedItems = sortHistoricalDraftItems(
    items.map((entry) => ({
      ...entry,
      orderIndex: entry.item.orderIndex,
      isCompleted: entry.item.isCompleted,
      title: entry.film?.title ?? "Untitled",
      releaseYear: entry.film?.releaseYear ?? null,
      source: entry.item.source,
    })),
    sort,
  );
  const watchedItems = sortedItems.filter((entry) => entry.item.isCompleted);
  const notWatchedItems = sortedItems.filter(
    (entry) => !entry.item.isCompleted,
  );

  return (
    <li className="border-border bg-card rounded-lg border p-4">
      <details className="group">
        <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 select-none">
          <div>
            <p className="text-foreground font-semibold">
              {getDraftDisplayName(draft)}
              {draft.freeformAchievedRank ? (
                <Badge variant="secondary" className="ml-2 align-middle">
                  Achieved: {FREEFORM_RANK_LABELS[draft.freeformAchievedRank]}
                </Badge>
              ) : null}
            </p>
            <p className="text-muted-foreground text-xs">
              {TIME_MODE_LABELS[draft.timeMode]} ·{" "}
              {formatReadableDate(draft.startedAt, "medium")} –{" "}
              {formatReadableDate(draft.deadlineAt, "medium")}
            </p>
          </div>
          <p className="text-muted-foreground text-sm tabular-nums">
            {completedCount}/{items.length} completed · {completionPercent}%
          </p>
        </summary>

        <div className="mt-4 flex items-center justify-between gap-2 border-t pt-4">
          <p className="text-muted-foreground text-xs font-medium">Films</p>
          <HistoricalDraftSortControl sort={sort} onSortChange={setSort} />
        </div>

        <div className="mt-2 space-y-4">
          <HistoricalDraftFilmGroup
            label="Watched"
            items={watchedItems}
            emptyLabel={null}
          />
          <HistoricalDraftFilmGroup
            label="Not Watched"
            items={notWatchedItems}
            emptyLabel={null}
          />
        </div>
      </details>
    </li>
  );
}

interface SortedHistoricalDraftItem extends HistoricalDraftItemView {
  title: string;
  releaseYear: number | null;
}

function HistoricalDraftFilmGroup({
  label,
  items,
  emptyLabel,
}: {
  label: string;
  items: SortedHistoricalDraftItem[];
  emptyLabel: string | null;
}) {
  if (items.length === 0 && !emptyLabel) {
    return null;
  }

  return (
    <div className="space-y-1.5">
      <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        {label} ({items.length})
      </p>
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{emptyLabel}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((entry) => {
            const challengeDefinition = entry.item.challengeId
              ? challengeRegistry.getById(entry.item.challengeId)
              : undefined;
            const isWatched = entry.item.isCompleted;

            return (
              <li
                key={entry.item.id}
                className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 text-sm"
              >
                <span className="flex min-w-0 items-start gap-1.5">
                  {isWatched ? (
                    <Check
                      aria-hidden="true"
                      className="text-watchlist-green mt-0.5 size-4 shrink-0"
                    />
                  ) : (
                    <Circle
                      aria-hidden="true"
                      className="text-muted-foreground mt-0.5 size-4 shrink-0"
                    />
                  )}
                  <span className="min-w-0">
                    <span className="text-foreground">
                      {entry.title}
                      {entry.releaseYear ? (
                        <span className="text-muted-foreground">
                          {" "}
                          ({entry.releaseYear})
                        </span>
                      ) : null}
                    </span>
                    {isWatched && entry.watchedDate ? (
                      <span className="text-muted-foreground block text-xs">
                        Watched {formatReadableCalendarDate(entry.watchedDate)}
                      </span>
                    ) : null}
                    {!isWatched && entry.postmortemResponse ? (
                      <span className="text-muted-foreground block text-xs">
                        {POSTMORTEM_LABELS[entry.postmortemResponse]}
                      </span>
                    ) : null}
                  </span>
                </span>
                {entry.item.source === "challenge" ? (
                  <Badge
                    variant="secondary"
                    className="shrink-0 text-[0.65rem]"
                  >
                    Challenge:{" "}
                    {challengeDefinition?.name ?? entry.item.challengeId}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="shrink-0 text-[0.65rem]">
                    Random
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
