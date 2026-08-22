"use client";

import { Check, ListPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { addManualFilmToLocalDraft } from "@/application/drafts/local-draft-service";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * The Watchlist page's manual "Add to Draft" action (see docs/updates,
 * "MANUAL 'ADD TO DRAFT' ACTION") — a self-contained sibling of the
 * card's own `<a>`, the same "never nest a real button inside the link"
 * convention `WatchToggle` already established, positioned in the
 * opposite corner so the two controls never collide.
 *
 * Renders nothing at all when there's no active draft to add to — this
 * is deliberate: the action must never imply it could start one (see
 * "do not create one implicitly"). Once a film IS in the draft, this
 * becomes a plain status badge instead of a button — a normal supported
 * state, not a warning.
 */
export function AddToDraftButton({
  entryId,
  title,
  activeDraftId,
  isInDraft,
  onAdded,
}: {
  entryId: string;
  title: string;
  activeDraftId: string | null;
  isInDraft: boolean;
  onAdded: (entryId: string) => void;
}) {
  const { activeProfile, repositories } = useProfileContext();
  const [isAdding, setIsAdding] = useState(false);

  if (!activeDraftId) {
    return null;
  }
  const draftId = activeDraftId;

  if (isInDraft) {
    return (
      <div
        className="bg-watchlist-blue text-watchlist-blue-foreground absolute top-2 left-2 z-10 flex items-center gap-1 rounded-full px-2 py-1 text-[0.65rem] font-semibold"
        aria-label={`${title} is already in your active draft`}
      >
        <Check aria-hidden="true" className="size-3" />
        In draft
      </div>
    );
  }

  async function handleAdd() {
    if (!activeProfile) return;
    setIsAdding(true);
    try {
      const outcome = await addManualFilmToLocalDraft(repositories, {
        profileId: activeProfile.id,
        draftId,
        watchlistEntryId: entryId,
      });
      if (!outcome.ok) {
        toast.error(outcome.message);
        return;
      }
      toast.success(`Added "${title}" to your active draft`);
      onAdded(entryId);
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Could not add this film to your draft.",
      );
    } finally {
      setIsAdding(false);
    }
  }

  const label = `Add "${title}" to your active draft`;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            aria-label={label}
            disabled={isAdding}
            onClick={() => void handleAdd()}
            className="bg-background/70 hover:bg-background/90 absolute top-2 left-2 z-10 backdrop-blur-sm"
          >
            <ListPlus aria-hidden="true" />
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
