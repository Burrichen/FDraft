"use client";

import { Check, ListPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { addManualFilmToLocalDraft } from "@/application/drafts/local-draft-service";
import { useProfileContext } from "@/components/profiles/profile-provider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MAX_DRAFT_FILMS } from "@/domain/drafts/living-draft";
import { cn } from "@/lib/utils";

/**
 * The Event counterpart of `AddToDraftButton` (see docs/updates, "FDRAFT
 * v1.2.1 — LIVING DRAFTS" Part 3 §4/§5/§10) — adds a Watchlist film to
 * the profile's currently active EVENT Draft, which is a completely
 * separate Draft from their normal one (see docs/updates, "PROMPT B2.1 —
 * DUAL DRAFT ARCHITECTURE").
 *
 * The SAME icon as the normal action, deliberately, distinguished only by
 * the Event's own accent colour (§4) — one visual vocabulary, one extra
 * dimension of meaning, rather than a second icon to learn.
 *
 * Rendered only for a film the Event genuinely accepts: the page resolves
 * that through `resolveEventDraftFilmAddition`, which reads the Event's own
 * eligibility rules, so this component knows nothing about any particular
 * Event and no eligibility logic lives here. A film outside the Event's
 * boundary simply has no Event action (§4), and January — which declines
 * additions entirely — never produces one at all (§8).
 *
 * Its confirmation names the Event, so "add to my draft" and "add to my
 * Halloween draft" can never be confused for one another (§5); the dialog
 * itself is the app's ordinary `AlertDialog`, with the accent applied only
 * to the confirming action.
 */
export function AddToEventDraftButton({
  entryId,
  title,
  eventDraftId,
  eventName,
  accentClassName,
  isInEventDraft,
  eventDraftIsFull = false,
  onAdded,
}: {
  entryId: string;
  title: string;
  eventDraftId: string;
  /** The Event's display name, for copy — "Add to Halloween Draft?". */
  eventName: string;
  /** This Event's accent classes for an icon button (see `getEventAccent`). Empty for an Event with no palette of its own, which then uses FDraft's default button styling. */
  accentClassName?: string;
  isInEventDraft: boolean;
  /** Whether the EVENT Draft is already at `MAX_DRAFT_FILMS` — the maximum applies to Event Drafts exactly as it does to normal ones (§10). */
  eventDraftIsFull?: boolean;
  onAdded: (entryId: string) => void;
}) {
  const { activeProfile, repositories } = useProfileContext();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  if (isInEventDraft) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              className={cn(
                "flex size-7 items-center justify-center rounded-md",
                accentClassName,
              )}
              aria-label={`${title} is already in your ${eventName} draft`}
            />
          }
        >
          <Check aria-hidden="true" className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent>{`Already in your ${eventName} draft`}</TooltipContent>
      </Tooltip>
    );
  }

  async function handleConfirmAdd() {
    if (!activeProfile) return;
    setIsAdding(true);
    try {
      const outcome = await addManualFilmToLocalDraft(repositories, {
        profileId: activeProfile.id,
        draftId: eventDraftId,
        watchlistEntryId: entryId,
      });
      if (!outcome.ok) {
        toast.error(outcome.message);
        return;
      }
      setIsConfirming(false);
      toast.success(`Added "${title}" to your ${eventName} draft`);
      onAdded(entryId);
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : `Could not add this film to your ${eventName} draft.`,
      );
    } finally {
      setIsAdding(false);
    }
  }

  if (eventDraftIsFull) {
    const reason = `Your ${eventName} draft has reached its maximum of ${MAX_DRAFT_FILMS} films.`;
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              aria-disabled={true}
              aria-label={`Can't add "${title}" to your ${eventName} draft: ${reason}`}
              // Tapping is the only route to this explanation on a touch
              // device, where there is no hover.
              onClick={() => toast.error(reason)}
              className="bg-background/50 text-muted-foreground opacity-60 backdrop-blur-sm"
            >
              <ListPlus aria-hidden="true" />
            </Button>
          }
        />
        <TooltipContent>{reason}</TooltipContent>
      </Tooltip>
    );
  }

  const label = `Add "${title}" to your ${eventName} draft`;

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              size="icon-sm"
              aria-label={label}
              onClick={() => setIsConfirming(true)}
              className={cn("backdrop-blur-sm", accentClassName)}
            >
              <ListPlus aria-hidden="true" />
            </Button>
          }
        />
        <TooltipContent>{`Add to ${eventName} Draft`}</TooltipContent>
      </Tooltip>
      <AlertDialog open={isConfirming} onOpenChange={setIsConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Add to ${eventName} Draft?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {`Add "${title}" to your ${eventName} draft? It'll count toward that draft, not your normal one.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isAdding}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleConfirmAdd()}
              disabled={isAdding}
              className={accentClassName}
            >
              {isAdding ? "Adding…" : "Add to Draft"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
