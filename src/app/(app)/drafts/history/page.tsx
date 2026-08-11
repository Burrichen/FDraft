"use client";

import { History } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Badge } from "@/components/ui/badge";
import { challengeRegistry } from "@/domain/challenges/catalogue";
import { DIFFICULTIES } from "@/domain/drafts/difficulty";
import { FREEFORM_RANK_LABELS } from "@/domain/drafts/freeform";
import { useAsyncData } from "@/hooks/use-async-data";
import type { DraftTimeMode, PostmortemResponseType } from "@/repositories";

const TIME_MODE_LABELS: Record<DraftTimeMode, string> = {
  calendar: "Calendar mode",
  timer: "Timer mode",
};

const POSTMORTEM_LABELS: Record<PostmortemResponseType, string> = {
  wanted_more_time: "Wanted more time",
  not_interested: "Not interested",
  no_reason: "No reason given",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
}

export default function DraftHistoryPage() {
  const { activeProfile, repositories } = useProfileContext();

  const { data, isLoading } = useAsyncData(async () => {
    if (!activeProfile) return null;
    const drafts = await repositories.drafts.listArchived(activeProfile.id);

    return Promise.all(
      drafts.map(async (draft) => {
        const items = (
          await repositories.drafts.listItemsForDraft(draft.id)
        ).sort((a, b) => a.orderIndex - b.orderIndex);
        const films = await Promise.all(
          items.map((item) => repositories.films.getById(item.filmId)),
        );
        const responses =
          await repositories.history.listPostmortemResponsesForDraft(draft.id);
        const responseByItemId = new Map(
          responses.map((response) => [
            response.draftItemId,
            response.response,
          ]),
        );

        return {
          draft,
          items: items.map((item, index) => ({
            item,
            film: films[index],
            postmortemResponse: responseByItemId.get(item.id) ?? null,
          })),
        };
      }),
    );
  }, [activeProfile?.id, repositories]);

  if (!activeProfile || isLoading || !data) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-heading">Draft history</h1>
        <p className="page-subtitle">Your past Monthly Watchlist Drafts.</p>
      </div>

      {data.length === 0 ? (
        <EmptyState
          icon={History}
          title="No past drafts yet"
          description="Completed and expired drafts will show up here once you've run one."
        />
      ) : (
        <ul className="space-y-4">
          {data.map(({ draft, items }) => {
            const completedCount = items.filter(
              ({ item }) => item.isCompleted,
            ).length;
            const completionPercent =
              items.length > 0
                ? Math.round((completedCount / items.length) * 100)
                : 0;

            return (
              <li
                key={draft.id}
                className="border-border bg-card rounded-lg border p-4"
              >
                <details className="group">
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 select-none">
                    <div>
                      <p className="text-foreground font-semibold">
                        {DIFFICULTIES[draft.difficulty].label} draft
                        {draft.freeformAchievedRank ? (
                          <Badge
                            variant="secondary"
                            className="ml-2 align-middle"
                          >
                            Achieved:{" "}
                            {FREEFORM_RANK_LABELS[draft.freeformAchievedRank]}
                          </Badge>
                        ) : null}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {TIME_MODE_LABELS[draft.timeMode]} ·{" "}
                        {formatDate(draft.startedAt)} –{" "}
                        {formatDate(draft.deadlineAt)}
                      </p>
                    </div>
                    <p className="text-muted-foreground text-sm tabular-nums">
                      {completedCount}/{items.length} completed ·{" "}
                      {completionPercent}%
                    </p>
                  </summary>

                  <ul className="mt-4 space-y-1.5 border-t pt-4">
                    {items.map(({ item, film, postmortemResponse }) => {
                      const challengeDefinition = item.challengeId
                        ? challengeRegistry.getById(item.challengeId)
                        : undefined;

                      return (
                        <li
                          key={item.id}
                          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm"
                        >
                          <span className="text-foreground">
                            {film?.title ?? "Untitled"}
                            {film?.releaseYear ? (
                              <span className="text-muted-foreground">
                                {" "}
                                ({film.releaseYear})
                              </span>
                            ) : null}
                          </span>
                          <span className="flex items-center gap-2">
                            {item.source === "challenge" ? (
                              <Badge
                                variant="secondary"
                                className="text-[0.65rem]"
                              >
                                Challenge:{" "}
                                {challengeDefinition?.name ?? item.challengeId}
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[0.65rem]"
                              >
                                Random
                              </Badge>
                            )}
                            {item.isCompleted ? (
                              <span className="text-watchlist-green text-xs font-medium">
                                Watched
                              </span>
                            ) : postmortemResponse ? (
                              <span className="text-muted-foreground text-xs">
                                {POSTMORTEM_LABELS[postmortemResponse]}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">
                                Unwatched
                              </span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
