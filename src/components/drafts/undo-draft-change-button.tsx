"use client";

import { Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { undoLastDraftMutation } from "@/application/drafts/living-draft-mutations";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { DraftMutationKind } from "@/repositories/records";

export interface UndoableDraftChange {
  kind: DraftMutationKind;
  /** The film currently occupying the slot this change created or swapped — what the user sees now, so the control can name what it will take away. */
  filmTitle: string;
}

/**
 * The Draft page's single Undo control (see docs/updates, "FDRAFT v1.2.1 —
 * LIVING DRAFTS" Part 2 §5-§7).
 *
 * Deliberately ONE button wired into the generic mutation history, not an
 * undo affordance per action: a manual add, a reroll and a manual
 * replacement are all just the newest entry in that history, and each
 * press steps back exactly one entry, revealing the one before it. The
 * history keeps the last five internally and is never exposed as a panel —
 * "what would this undo?" is answered by this control's own tooltip, which
 * is as much change history as v1.2.1 shows.
 *
 * Rendered only when there is genuinely something reversible: the caller
 * passes `change` as `null` (from `resolveDraftUndoAvailability`, the same
 * helper `undoLastDraftMutation` guards itself with) and this renders
 * nothing at all, rather than a permanently dead button.
 *
 * Single click, no confirmation: undoing is free (Part 2 §6 — no points
 * penalty, no cost) and the film can simply be added again. What it did is
 * reported afterwards, including when it had to clear a watched status.
 */
export function UndoDraftChangeButton({
  draftId,
  change,
  onUndone,
}: {
  draftId: string;
  /** The change this button would reverse, or `null` when nothing is reversible — in which case nothing renders. */
  change: UndoableDraftChange | null;
  /**
   * Fired after a successful undo, with the identifiers of the film that
   * was taken back out — so the page can clear any pending session
   * watch-undo record for it (this undo may have already reversed that
   * watch) and refresh.
   */
  onUndone: (result: {
    watchlistEntryId: string | null;
    draftItemId: string;
  }) => void;
}) {
  const { activeProfile, repositories } = useProfileContext();
  const [isWorking, setIsWorking] = useState(false);

  if (!change) {
    return null;
  }
  const currentChange = change;

  const description =
    currentChange.kind === "add"
      ? `Undo adding "${currentChange.filmTitle}"`
      : `Undo swapping in "${currentChange.filmTitle}"`;

  async function handleUndo() {
    if (!activeProfile) return;
    setIsWorking(true);
    try {
      const outcome = await undoLastDraftMutation(repositories, {
        profileId: activeProfile.id,
        draftId,
      });
      if (!outcome.ok) {
        toast.error(outcome.message);
        return;
      }
      const undone =
        outcome.kind === "add"
          ? `Removed "${currentChange.filmTitle}" from your draft`
          : `Put back the film "${currentChange.filmTitle}" replaced`;
      toast.success(
        outcome.clearedWatchedState
          ? `${undone} — its watched status was cleared too`
          : undone,
      );
      onUndone({
        watchlistEntryId: outcome.watchlistEntryId,
        draftItemId: outcome.draftItemId,
      });
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not undo that change.",
      );
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isWorking}
            aria-label={description}
            onClick={() => void handleUndo()}
          >
            <Undo2 aria-hidden="true" />
            {isWorking ? "Undoing…" : "Undo last change"}
          </Button>
        }
      />
      <TooltipContent>{description}</TooltipContent>
    </Tooltip>
  );
}
