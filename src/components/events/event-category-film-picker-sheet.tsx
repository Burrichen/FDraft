"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EventCategoryFilmBrowser } from "./event-category-film-browser";
import type { EventCategorySelectableFilmView } from "./event-category-film-card";

/**
 * "Choose My Own" for a category-based Event, one category at a time (see
 * docs/updates, "FDRAFT UPDATE 1 — EVENT ONE AT A TIME DRAFTING" §6/§7) —
 * the `filmId`-keyed sibling of `DiyFilmPickerSheet` (same Sheet chrome,
 * same single-select "nothing applied until Confirm" contract), since a
 * curated category candidate routinely has no watchlist entry to key by.
 * Confirms exactly ONE film (§6: "confirm exactly one candidate"), never a
 * difficulty-sized count.
 */
export function EventCategoryFilmPickerSheet({
  open,
  onOpenChange,
  categoryLabel,
  films,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** e.g. "Horror" / "Kitsch" / "Classic" / "Adjacent" — shown in the sheet title/description. */
  categoryLabel: string;
  films: readonly EventCategorySelectableFilmView[];
  onConfirm: (filmId: string) => void;
}) {
  const [pendingFilmId, setPendingFilmId] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPendingFilmId(null);
    }
  }

  function handleToggle(filmId: string) {
    setPendingFilmId((current) => (current === filmId ? null : filmId));
  }

  function handleConfirm() {
    if (!pendingFilmId) return;
    onConfirm(pendingFilmId);
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-5xl"
        aria-label={`Choose My Own — ${categoryLabel}`}
      >
        <SheetHeader>
          <SheetTitle>{categoryLabel}</SheetTitle>
          <SheetDescription>
            Choose exactly one film from {categoryLabel}.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <EventCategoryFilmBrowser
            films={films}
            selectedFilmIds={new Set(pendingFilmId ? [pendingFilmId] : [])}
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
            disabled={!pendingFilmId}
            onClick={handleConfirm}
          >
            Confirm
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
