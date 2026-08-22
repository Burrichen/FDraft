"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getDiyEligibleFilms } from "@/application/drafts/local-diy-candidates";
import { replaceDraftSlot } from "@/application/drafts/local-draft-service";
import { useProfileContext } from "@/components/profiles/profile-provider";
import type { DiySelectableFilmView } from "./diy/diy-film-card";
import { DiyFilmPickerSheet } from "./diy/diy-film-picker-sheet";

/**
 * The pen-icon "manual replace" flow for an editable random draft slot
 * (see docs/updates, v1.1.3 "Editable random draft slots") — a thin
 * controller around `DiyFilmPickerSheet`, the same large poster-grid
 * picker "Pick Your Own" Challenge Films already use, fed by the same
 * canonical `getDiyEligibleFilms` pool. No new film-browser implementation.
 *
 * `excludedEntryIds` must include the slot's OWN current watchlist entry
 * (unlike the Challenge Film picker's use of this sheet, where the current
 * pick is deliberately kept selectable) — replacing a slot with the film
 * already occupying it isn't a meaningful action here.
 *
 * The eligible pool is only fetched while `open`, refetched every time the
 * sheet opens so a film watched or removed elsewhere since the last open
 * can never be offered stale.
 */
export function ManualReplaceSlotSheet({
  open,
  onOpenChange,
  draftId,
  draftItemId,
  excludedEntryIds,
  adminModeEnabled,
  onReplaced,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draftId: string;
  draftItemId: string;
  excludedEntryIds: ReadonlySet<string>;
  adminModeEnabled: boolean;
  onReplaced: (previousWatchlistEntryId: string | null) => void;
}) {
  const { activeProfile, repositories } = useProfileContext();
  const [films, setFilms] = useState<DiySelectableFilmView[] | null>(null);
  // Resets `films` to null the moment `open` flips true, adjusted during
  // render (React's documented pattern for "resetting state when a prop
  // changes" — see `DiyFilmPickerSheet`'s identical `wasOpen` handling)
  // rather than in a `useEffect`, which would call `setState` synchronously
  // inside an effect and trigger an extra, avoidable render.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setFilms(null);
    }
  }

  useEffect(() => {
    if (!open || !activeProfile) {
      return;
    }
    let cancelled = false;
    void getDiyEligibleFilms(repositories, activeProfile.id).then((result) => {
      if (!cancelled) setFilms(result);
    });
    return () => {
      cancelled = true;
    };
  }, [open, activeProfile, repositories]);

  async function handleConfirm(entryId: string) {
    if (!activeProfile) return;
    const outcome = await replaceDraftSlot(repositories, {
      profileId: activeProfile.id,
      draftId,
      draftItemId,
      adminModeEnabled,
      mode: { kind: "manual", watchlistEntryId: entryId },
    });
    if (!outcome.ok) {
      toast.error(outcome.message);
      return;
    }
    onReplaced(outcome.previousWatchlistEntryId);
  }

  return (
    <DiyFilmPickerSheet
      open={open}
      onOpenChange={onOpenChange}
      films={films ?? []}
      excludedEntryIds={excludedEntryIds}
      selectedEntryId={null}
      slotLabel="this slot"
      size="large"
      onConfirm={(entryId) => void handleConfirm(entryId)}
    />
  );
}
