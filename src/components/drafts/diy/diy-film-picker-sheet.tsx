"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DiyFilmBrowser } from "./diy-film-browser";
import type { DiySelectableFilmView } from "./diy-film-card";

/**
 * The "Pick Your Own" Challenge Film picker (see docs/updates, v1.1.2,
 * "Redesign Challenge Films — Pick Your Own") — a proper popout (a
 * `Sheet`, the same drawer primitive `PatchNotesSheet`/the mobile nav
 * already use) replacing the old cramped inline list. Reuses
 * `DiyFilmBrowser` wholesale — the exact same poster grid, search, and
 * sort/filter the DIY Draft selection screen uses, sourced from the same
 * `getDiyEligibleFilms` pool — rather than a second, parallel
 * movie-browser implementation built just for Challenge Films.
 *
 * Single-select: clicking a card replaces the current selection (or
 * clears it, if clicking the already-selected card again) rather than
 * toggling independently. Nothing is applied to the caller's state until
 * "Confirm" — "Cancel", closing the sheet, or pressing Escape all discard
 * the in-progress pick and leave the caller's actual selection untouched,
 * satisfying "do not mutate the challenge until selection is confirmed."
 */
export function DiyFilmPickerSheet({
  open,
  onOpenChange,
  films,
  excludedEntryIds,
  selectedEntryId,
  slotLabel,
  size = "default",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The full DIY-eligible pool (see `getDiyEligibleFilms`) — no franchise/sequel restriction, same release and metadata-integrity protections every DIY surface shares. */
  films: readonly DiySelectableFilmView[];
  /** Entries already claimed by another challenge slot in this draft — hidden here so the same film can't be picked for two slots at once. */
  excludedEntryIds: ReadonlySet<string>;
  /** This slot's current pick, if it already has one — pre-selected when the sheet opens, so re-opening to change a choice starts from where it left off. */
  selectedEntryId: string | null;
  /** A short label identifying which slot this fills, e.g. "Challenge slot 2 of 3". */
  slotLabel: string;
  /** `"default"` (unchanged, `sm:max-w-2xl`) for the Challenge Film picker; `"large"` widens the sheet to occupy most of the window — see the Active Draft page's manual slot replacement. */
  size?: "default" | "large";
  onConfirm: (entryId: string) => void;
}) {
  const [pendingEntryId, setPendingEntryId] = useState<string | null>(
    selectedEntryId,
  );
  // Re-seeds the in-progress pick from the caller's actual selection every
  // time the sheet transitions to open — otherwise a cancelled previous
  // session's leftover pick could resurface, or the sheet could forget an
  // existing choice when re-opened to change it. Adjusted during render
  // (React's documented pattern for "resetting state when a prop changes")
  // rather than in a `useEffect`, which would call `setState` synchronously
  // inside an effect and trigger an extra, avoidable render.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPendingEntryId(selectedEntryId);
    }
  }

  const availableFilms = useMemo(
    () =>
      films.filter(
        (film) =>
          !excludedEntryIds.has(film.entryId) ||
          film.entryId === selectedEntryId,
      ),
    [films, excludedEntryIds, selectedEntryId],
  );
  const pendingSelectedEntryIds = useMemo(
    () => new Set(pendingEntryId ? [pendingEntryId] : []),
    [pendingEntryId],
  );

  function handleToggle(entryId: string) {
    setPendingEntryId((current) => (current === entryId ? null : entryId));
  }

  function handleConfirm() {
    if (!pendingEntryId) return;
    onConfirm(pendingEntryId);
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "w-full",
          size === "large" ? "sm:max-w-5xl" : "sm:max-w-2xl",
        )}
        aria-label={`Pick Your Own — ${slotLabel}`}
      >
        <SheetHeader>
          <SheetTitle>Pick Your Own</SheetTitle>
          <SheetDescription>
            Choose exactly one film for {slotLabel}.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <DiyFilmBrowser
            films={availableFilms}
            selectedEntryIds={pendingSelectedEntryIds}
            onToggle={handleToggle}
          />
        </div>
        <SheetFooter className="flex-row justify-end gap-2 border-t pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!pendingEntryId}
            onClick={handleConfirm}
          >
            Confirm
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
