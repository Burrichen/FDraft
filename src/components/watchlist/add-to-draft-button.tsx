"use client";

import { Check, ListPlus } from "lucide-react";
import { useRouter } from "next/navigation";
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

/** Why an otherwise-available "Add to Draft" is refused — see the component's own doc comment. */
export type AddToDraftRefusal = "draft_full" | "entry_not_eligible";

/**
 * The Watchlist page's manual "Add to Draft" action (see docs/updates,
 * "MANUAL 'ADD TO DRAFT' ACTION", extended by "FDRAFT v1.2.1 — LIVING
 * DRAFTS" Part 2 §1/§2/§4) — a self-contained sibling of the card's own
 * `<a>`, the same "never nest a real button inside the link" convention
 * `WatchToggle` already established, positioned in the opposite corner so
 * the two controls never collide.
 *
 * Nothing changes on a single click: the action always asks first, through
 * the same `AlertDialog` every other confirm in the app uses, and the
 * question names the film so a mis-clicked card is obvious. Which question
 * depends on what exists:
 *  - with an active draft, it offers to add the film to it;
 *  - with NO active draft, it offers to start one built around this film,
 *    handing off to the ordinary `/drafts/new` flow (difficulty, split,
 *    deadline) rather than inventing a parallel wizard.
 *
 * Once a film IS in the draft, this becomes a plain status badge instead of
 * a button — a normal supported state, not a warning.
 *
 * When the add would be refused — the draft is at its Living Drafts
 * maximum, or this film isn't one the app can draft — the control stays
 * visible but reads as unavailable (`aria-disabled`, muted), explaining
 * itself on hover AND on tap. Deliberately not a native `disabled` button:
 * that suppresses the pointer events the tooltip needs, leaving a dead
 * control with no explanation, which is the one outcome worse than either
 * showing or hiding it.
 *
 * There is deliberately no "remove from draft" counterpart here (Part 2
 * §10) — Undo, on the Draft page, is how a recent addition is reversed.
 */
export function AddToDraftButton({
  entryId,
  title,
  activeDraftId,
  isInDraft,
  draftIsFull = false,
  isEligible = true,
  onAdded,
}: {
  entryId: string;
  title: string;
  /** The active NORMAL draft to add to, or `null` when the profile has none — which switches this control to the "start a draft with this film" flow rather than hiding it. */
  activeDraftId: string | null;
  isInDraft: boolean;
  /** Whether the target draft already holds `MAX_DRAFT_FILMS` films — resolved by the page through `resolveDraftCapacity`, the same helper the mutation enforces with, so the two can never disagree. */
  draftIsFull?: boolean;
  /** Whether this entry is in the canonical manual-selection pool (`getDiyEligibleFilms`) that `addManualFilmToLocalDraft` validates against. */
  isEligible?: boolean;
  onAdded: (entryId: string) => void;
}) {
  const router = useRouter();
  const { activeProfile, repositories } = useProfileContext();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  if (isInDraft) {
    return (
      <div
        className="bg-watchlist-blue text-watchlist-blue-foreground flex items-center gap-1 rounded-full px-2 py-1 text-[0.65rem] font-semibold"
        aria-label={`${title} is already in your active draft`}
      >
        <Check aria-hidden="true" className="size-3" />
        In draft
      </div>
    );
  }

  const hasDraft = activeDraftId !== null;
  // Checked in the same order the mutation checks them, so the reason
  // shown is the reason the add would actually fail with. Capacity is
  // meaningless with no draft — nothing is full — but eligibility still
  // applies: a film the app can't draft can't be the film a new draft is
  // built around either (`createLocalDraft` rejects it as
  // `start_film_not_eligible`), and offering that would be a dead end.
  const refusal: AddToDraftRefusal | null =
    hasDraft && draftIsFull
      ? "draft_full"
      : !isEligible
        ? "entry_not_eligible"
        : null;

  async function handleConfirmAdd() {
    if (!activeProfile || !activeDraftId) return;
    setIsAdding(true);
    try {
      const outcome = await addManualFilmToLocalDraft(repositories, {
        profileId: activeProfile.id,
        draftId: activeDraftId,
        watchlistEntryId: entryId,
      });
      if (!outcome.ok) {
        toast.error(outcome.message);
        return;
      }
      setIsConfirming(false);
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

  function handleConfirmStartDraft() {
    setIsConfirming(false);
    // The chosen film travels as an entry id; `/drafts/new` resolves it
    // and guarantees its inclusion (see `createLocalDraft`'s
    // `startWithWatchlistEntryId`).
    router.push(`/drafts/new?startWith=${encodeURIComponent(entryId)}`);
  }

  if (refusal) {
    const reason =
      refusal === "draft_full"
        ? `Your draft has reached its maximum of ${MAX_DRAFT_FILMS} films.`
        : `"${title}" isn't available to draft right now.`;
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              aria-disabled={true}
              aria-label={
                hasDraft
                  ? `Can't add "${title}" to your draft: ${reason}`
                  : `Can't start a new draft with "${title}": ${reason}`
              }
              // Tapping is the only way to reach this explanation on a
              // touch device, where there is no hover.
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

  const label = hasDraft
    ? `Add "${title}" to your active draft`
    : // Deliberately "a new draft", not "a draft": the Drafts page's own
      // empty-state button is named "Start a draft", and an accessible-name
      // lookup for that button matches by SUBSTRING — so the shorter wording
      // here would make every Watchlist card a match for it whenever both
      // are mounted at once (mid-navigation), which is ambiguous for
      // assistive tech and for tests alike.
      `Start a new draft with "${title}"`;

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              aria-label={label}
              onClick={() => setIsConfirming(true)}
              className="bg-background/70 hover:bg-background/90 backdrop-blur-sm"
            >
              <ListPlus aria-hidden="true" />
            </Button>
          }
        />
        <TooltipContent>{hasDraft ? "Add to Draft" : label}</TooltipContent>
      </Tooltip>
      <AlertDialog open={isConfirming} onOpenChange={setIsConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {hasDraft ? "Add to Draft?" : "Start a draft with this film?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {hasDraft
                ? `Add "${title}" to your current draft? It'll count toward this draft's progress, and your difficulty won't change.`
                : `You don't have an active draft. Start one with "${title}" already included — you'll choose the difficulty and deadline next.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isAdding}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={
                hasDraft
                  ? () => void handleConfirmAdd()
                  : handleConfirmStartDraft
              }
              disabled={isAdding}
            >
              {hasDraft
                ? isAdding
                  ? "Adding…"
                  : "Add to Draft"
                : "Start a draft"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
