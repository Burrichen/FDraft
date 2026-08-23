"use client";

import { Eye, Loader2, Undo2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { archiveLocalDraftIfResolved } from "@/application/drafts/local-draft-service";
import {
  markLocalFilmWatched,
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

interface WatchToggleProps {
  entryId: string;
  title: string;
  /** Fires after a successful mark-watched only (not after undo) — e.g. the Random Film picker uses this to move on to its next pick. A page that needs to refresh its own fetched data after EITHER a mark-watched or an undo should instead react to `useWatchUndo()` changing (see `WatchlistView`/`drafts/page.tsx`'s `useEffect`) rather than a callback threaded down through every card — the context already changes at exactly the right moment, after React commits it, which a callback fired inline here cannot guarantee (this control lives inside a `startTransition`, so the context update isn't necessarily visible yet the instant this callback runs). */
  onMarkedWatched?: () => void;
}

/**
 * The watched/undo control from docs/product-spec.md, "NORMAL WATCHLIST
 * PAGE" and "WATCHED FILM UNDO". Replaces the old `EyeButton`, which only
 * ever moved forward (mark watched, then the card vanished). Now a single
 * control with two faces, chosen entirely by whether `useWatchUndo()` still
 * has a pending record for this watchlist entry:
 *
 *  - no record -> the plain eye, marks the film watched;
 *  - a pending record -> "Undo", reverses that exact action.
 *
 * Marking watched calls `markLocalFilmWatched` exactly as before and then
 * registers the resulting `WatchSessionUndoRecord` with the shared session
 * context — never persisted, gone the moment the app reloads (see
 * `WatchUndoProvider`'s doc comment). Undo calls the new
 * `undoLocalFilmWatched`, which is the only thing allowed to reverse it.
 *
 * A sibling of the card's `<a>` (not a descendant) for the same reason as
 * before — never nest interactive elements inside a link. Shared by the
 * watchlist grid, the Random Film picker, and the Active Draft film grid.
 */
export function WatchToggle({
  entryId,
  title,
  onMarkedWatched,
}: WatchToggleProps) {
  const { activeProfile, repositories } = useProfileContext();
  const watchUndo = useWatchUndo();
  const [isPending, startTransition] = useTransition();
  const record = watchUndo.getRecord(entryId);

  function handleMarkWatched() {
    if (!activeProfile) return;
    startTransition(async () => {
      const outcome = await markLocalFilmWatched(
        repositories,
        {
          profileId: activeProfile.id,
          watchlistEntryId: entryId,
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
          secondaryDraftCompletion: outcome.secondaryDraftCompletion,
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
        watchUndo.clearUndo(entryId);
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

/** True while a film's watched action was performed this session and can still be undone — drives the faded "Watched" card treatment (see docs/product-spec.md, "WATCHED FILM UNDO", "VISUAL BEHAVIOUR"). */
export function useIsWatchedThisSession(entryId: string | null): boolean {
  const watchUndo = useWatchUndo();
  return entryId !== null && watchUndo.getRecord(entryId) !== undefined;
}
