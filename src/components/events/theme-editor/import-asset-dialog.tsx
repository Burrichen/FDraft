"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { normalizeAssetFilename } from "@/domain/event-studio/filename-normalization";
import {
  EVENT_ASSET_CATEGORIES,
  WORKSPACE_ASSET_COMMON_EVENT_ID,
  type EventAssetCategory,
} from "@/domain/event-studio/workspace-asset";
import {
  checkEventArtWorkspaceAssetPaths,
  copyEventArtAsset,
} from "@/infrastructure/tauri/event-art-workspace";

export interface ImportAssetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspacePath: string;
  sourcePath: string;
  /** Every destination Event this file could be filed under — Common plus every currently-registered Event (see docs/updates, "EVENT STUDIO — PHASE 9" §3: "Common / January / Halloween / Christmas / future registered Event" — never a hand-maintained list, whatever's registered right now). */
  eventOptions: readonly { id: string; label: string }[];
  /** Pre-selected when the currently-open preset IS a real destination Event (e.g. importing while Halloween is the active preset defaults the picker to Halloween) — otherwise falls back to Common. */
  defaultEventId?: string;
  onImported: (relativePath: string) => void;
}

const CATEGORY_LABELS: Record<EventAssetCategory, string> = {
  decorations: "Decorations",
  interactives: "Interactives",
  modal: "Modal",
  icons: "Icons",
  backgrounds: "Backgrounds",
};

/**
 * "IMPORT ARTWORK" (see docs/updates, "EVENT STUDIO — PHASE 9" §3/§4/§5)
 * — the source file is already chosen by the time this opens (a native
 * file-picker dialog, driven by the caller); this is the "friendly
 * destination UI" step: choose the Event/Folder, see the exact
 * destination path BEFORE confirming, and resolve a filename collision
 * explicitly (Replace Existing / Import With New Name / Cancel) rather
 * than ever silently overwriting.
 */
export function ImportAssetDialog({
  open,
  onOpenChange,
  workspacePath,
  sourcePath,
  eventOptions,
  defaultEventId,
  onImported,
}: ImportAssetDialogProps) {
  const sourceFileName = sourcePath.split(/[/\\]/).pop() ?? sourcePath;
  const [eventId, setEventId] = useState(
    defaultEventId ?? WORKSPACE_ASSET_COMMON_EVENT_ID,
  );
  const [category, setCategory] = useState<EventAssetCategory>("decorations");
  const [fileName, setFileName] = useState(() =>
    normalizeAssetFilename(sourceFileName),
  );
  const [collisionChecked, setCollisionChecked] = useState(false);
  const [collides, setCollides] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const destination = `events/${eventId}/${category}/${fileName}`;

  // Re-check for a collision every time the computed destination changes
  // — editing the filename to resolve one is itself how "Import With New
  // Name" works, so this needs to re-verify on every edit, not just once
  // on open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a changed destination means the previous collision check is now stale/loading, same accepted pattern as `useAsyncData`.
    setCollisionChecked(false);
    void checkEventArtWorkspaceAssetPaths(workspacePath, [destination]).then(
      (result) => {
        if (cancelled) return;
        setCollides(Boolean(result[destination]));
        setCollisionChecked(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open, workspacePath, destination]);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a freshly-opened dialog (or a newly-chosen source file) starts from a clean, predictable state, same accepted pattern as `useAsyncData`'s own reset.
    setEventId(defaultEventId ?? WORKSPACE_ASSET_COMMON_EVENT_ID);
    setCategory("decorations");
    setFileName(normalizeAssetFilename(sourceFileName));
    setError(null);
  }, [open, sourcePath, defaultEventId, sourceFileName]);

  async function performImport() {
    setImporting(true);
    setError(null);
    try {
      const result = await copyEventArtAsset(
        workspacePath,
        sourcePath,
        eventId,
        category,
        fileName,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onImported(result.relativePath);
      onOpenChange(false);
    } finally {
      setImporting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>Import Artwork</SheetTitle>
          <SheetDescription>
            Copies the image into this FDraft project — it becomes a normal
            tracked file, ready to commit.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4">
          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">File</Label>
            <p className="text-foreground truncate text-sm">{sourceFileName}</p>
          </div>

          <div className="space-y-1">
            <Label
              htmlFor="import-event"
              className="text-muted-foreground text-xs"
            >
              Event
            </Label>
            <select
              id="import-event"
              value={eventId}
              onChange={(event) => setEventId(event.target.value)}
              className="border-border bg-background text-foreground w-full rounded border px-2 py-1.5 text-sm"
            >
              {eventOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label
              htmlFor="import-category"
              className="text-muted-foreground text-xs"
            >
              Folder
            </Label>
            <select
              id="import-category"
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as EventAssetCategory)
              }
              className="border-border bg-background text-foreground w-full rounded border px-2 py-1.5 text-sm"
            >
              {EVENT_ASSET_CATEGORIES.map((option) => (
                <option key={option} value={option}>
                  {CATEGORY_LABELS[option]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label
              htmlFor="import-filename"
              className="text-muted-foreground text-xs"
            >
              Filename
            </Label>
            <Input
              id="import-filename"
              value={fileName}
              onChange={(event) =>
                setFileName(normalizeAssetFilename(event.target.value))
              }
              className="text-sm"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">Destination</Label>
            <p className="border-border bg-muted/30 rounded border px-2 py-1.5 font-mono text-xs break-all">
              public/{destination}
            </p>
          </div>

          {error ? (
            <p className="text-destructive text-xs" role="alert">
              {error}
            </p>
          ) : null}

          {collisionChecked && collides ? (
            <div className="space-y-2 rounded border border-amber-500/50 bg-amber-500/10 p-2">
              <p className="text-xs">
                A file already exists at this destination.
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  variant="destructive"
                  size="xs"
                  disabled={importing}
                  onClick={() => void performImport()}
                >
                  Replace Existing
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() =>
                    document.getElementById("import-filename")?.focus()
                  }
                >
                  Import With New Name
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              disabled={importing || !collisionChecked}
              onClick={() => void performImport()}
            >
              {importing ? "Importing…" : "Import"}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
