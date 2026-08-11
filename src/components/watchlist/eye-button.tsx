"use client";

import { Eye, Loader2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { markLocalFilmWatched } from "@/application/watchlist/local-watchlist-service";
import { archiveLocalDraftIfResolved } from "@/application/drafts/local-draft-service";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface EyeButtonProps {
  entryId: string;
  title: string;
  onWatched: () => void;
}

/**
 * The watched/unwatched control from docs/product-spec.md, "Normal
 * Watchlist Page". A sibling of the card's `<a>` (not a descendant) so it
 * never nests interactive elements inside a link, positioned on top with
 * `absolute` + a higher stacking context — clicks land on the button, never
 * the anchor beneath it, with no stopPropagation/preventDefault needed. This
 * page only ever shows active (unwatched) films, so the eye has a single
 * action: mark watched.
 *
 * Calls `markLocalFilmWatched` directly against the local repositories
 * (see docs/product-spec.md, "FULL OFFLINE CORE FUNCTIONALITY" — Prompt
 * 9.5B) rather than a Server Action — the whole mutation, including
 * completing a matching active-draft item and checking whether that
 * finishes the draft, happens entirely offline. Shared by both the
 * watchlist grid and the Active Draft film grid.
 */
export function EyeButton({ entryId, title, onWatched }: EyeButtonProps) {
  const { activeProfile, repositories } = useProfileContext();
  const [isPending, startTransition] = useTransition();
  const label = `Mark "${title}" as watched`;

  function handleClick() {
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
        toast.success(`Marked "${title}" as watched`);
        onWatched();
      } else {
        const message =
          outcome.error === "not_active"
            ? "This film was already marked watched."
            : "Could not mark this film as watched. Please try again.";
        toast.error(message);
      }
    });
  }

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
            onClick={handleClick}
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
