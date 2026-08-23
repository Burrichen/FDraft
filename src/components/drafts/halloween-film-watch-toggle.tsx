"use client";

import { Eye, Loader2, Undo2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { archiveLocalDraftIfResolved } from "@/application/drafts/local-draft-service";
import {
  markLocalDraftItemWatchedWithoutEntry,
  undoLocalFilmWatched,
} from "@/application/watchlist/local-watchlist-service";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useWatchUndo } from "@/components/watch-undo/watch-undo-provider";

interface HalloweenFilmWatchToggleProps {
  draftItemId: string;
  title: string;
  onMarkedWatched?: () => void;
}

/**
 * The `WatchToggle` sibling for a Halloween Horror/Kitsch draft item that
 * has no watchlist entry at all (see docs/updates, "PROMPT 19 — HALLOWEEN
 * DRAFT MECHANICS" §11) — `WatchToggle` requires a real, non-null
 * `entryId` and calls `markLocalFilmWatched`/`undoLocalFilmWatched`
 * keyed on it, neither of which this item has. Same visual/interaction
 * shape (Eye ⇄ Undo, session-only), keyed by `draftItemId` instead via
 * `useWatchUndo().getRecordForItem`/`clearUndoForItem`, and calling
 * `markLocalDraftItemWatchedWithoutEntry` instead of
 * `markLocalFilmWatched`. Undo still goes through the same
 * `undoLocalFilmWatched` — it already handles a `null` `watchlistEntryId`
 * correctly.
 */
export function HalloweenFilmWatchToggle({
  draftItemId,
  title,
  onMarkedWatched,
}: HalloweenFilmWatchToggleProps) {
  const { activeProfile, repositories } = useProfileContext();
  const watchUndo = useWatchUndo();
  const [isPending, startTransition] = useTransition();
  const record = watchUndo.getRecordForItem(null, draftItemId);

  function handleMarkWatched() {
    if (!activeProfile) return;
    startTransition(async () => {
      const outcome = await markLocalDraftItemWatchedWithoutEntry(
        repositories,
        {
          profileId: activeProfile.id,
          draftItemId,
          profileTimezone: activeProfile.timezone,
        },
        { archiveIfResolved: archiveLocalDraftIfResolved },
      );
      if (outcome.ok) {
        watchUndo.registerWatched({
          watchlistEntryId: outcome.watchlistEntryId,
          filmId: outcome.filmId,
          watchedHistoryId: outcome.watchedHistoryId,
          draftItemId: outcome.draftItemId,
          draftId: outcome.draftId,
          draftArchivedByThisAction: outcome.draftArchivedByThisAction,
        });
        toast.success(`Marked "${title}" as watched`);
        onMarkedWatched?.();
      } else {
        const message =
          outcome.error === "not_active"
            ? "This film was already marked watched."
            : "Could not mark this film as watched. Please try again.";
        toast.error(message);
      }
    });
  }

  function handleUndo() {
    if (!activeProfile || !record) return;
    startTransition(async () => {
      const outcome = await undoLocalFilmWatched(repositories, {
        profileId: activeProfile.id,
        record,
      });
      if (outcome.ok) {
        watchUndo.clearUndoForItem(null, draftItemId);
        toast.success(`Undid marking "${title}" as watched`);
      } else {
        toast.error("Could not undo — please try again.");
      }
    });
  }

  if (record) {
    const label = `Undo marking "${title}" as watched`;
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              aria-label={label}
              disabled={isPending}
              onClick={handleUndo}
              className="bg-background/70 hover:bg-background/90 absolute top-2 right-2 z-10 gap-1 backdrop-blur-sm"
            >
              {isPending ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : (
                <Undo2 aria-hidden="true" />
              )}
              Undo
            </Button>
          }
        />
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    );
  }

  const label = `Mark "${title}" as watched`;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            aria-label={label}
            disabled={isPending}
            onClick={handleMarkWatched}
            className="bg-background/70 hover:bg-background/90 absolute top-2 right-2 z-10 backdrop-blur-sm"
          >
            {isPending ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : (
              <Eye aria-hidden="true" />
            )}
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** True while a Halloween off-watchlist draft item's watched action was performed this session and can still be undone — the `draftItemId`-keyed equivalent of `useIsWatchedThisSession`. */
export function useIsWatchedThisSessionForItem(
  draftItemId: string | null,
): boolean {
  const watchUndo = useWatchUndo();
  return (
    draftItemId !== null &&
    watchUndo.getRecordForItem(null, draftItemId) !== undefined
  );
}
