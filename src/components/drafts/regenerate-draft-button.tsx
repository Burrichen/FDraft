"use client";

import { useState } from "react";
import { toast } from "sonner";
import { abandonLocalDraft } from "@/application/drafts/local-draft-service";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/**
 * Admin Mode's "Regenerate Draft" (see docs/updates, v1.0.4 "God Mode") —
 * only ever rendered by the Draft page when Admin Mode is on AND there is
 * a genuinely active draft (never for an expired/archived one, and never
 * when there's nothing to regenerate). Requires a second, explicit,
 * clearly-labeled destructive confirmation before doing anything — the
 * same "a single click can never delete anything" rule
 * `settings/profile-row.tsx`'s delete-profile flow already established.
 * All the actual logic (delete the draft, revert exactly the watches it
 * caused, award nothing) lives in `abandonLocalDraft`; this component is
 * only the confirmation + wiring.
 */
export function RegenerateDraftButton({
  draftId,
  onRegenerated,
}: {
  draftId: string;
  onRegenerated: (revertedWatchlistEntryIds: string[]) => void;
}) {
  const { activeProfile, repositories } = useProfileContext();
  const [open, setOpen] = useState(false);
  const [isWorking, setIsWorking] = useState(false);

  async function handleConfirm() {
    if (!activeProfile) return;
    setIsWorking(true);
    try {
      const outcome = await abandonLocalDraft(repositories, {
        profileId: activeProfile.id,
        draftId,
      });
      if (!outcome.ok) {
        toast.error(outcome.message);
        return;
      }
      setOpen(false);
      onRegenerated(outcome.result.revertedWatchlistEntryIds);
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Could not regenerate this draft.",
      );
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
          />
        }
      >
        Regenerate Draft
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Regenerate this draft?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes your current draft. No Lifetime, event, or
            other points will be awarded for it, and any film you marked watched
            to complete it will be returned to your active watchlist. The Draft
            page will return to its normal state, as if no draft existed, and
            you can start a fresh one afterward. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isWorking}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={isWorking}>
            {isWorking ? "Regenerating…" : "Regenerate draft permanently"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
