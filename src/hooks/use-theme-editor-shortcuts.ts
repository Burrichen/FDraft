"use client";

import { useEffect } from "react";
import {
  NUDGE_STEP_LARGE_REM,
  NUDGE_STEP_REM,
} from "@/domain/event-studio/placement-geometry";

export interface ThemeEditorShortcutHandlers {
  enabled: boolean;
  /** The full current selection (see docs/updates, "EVENT STUDIO — PHASE 5" §6) — Delete, nudge, Copy, and Duplicate all act on every selected id at once, never just one, so a multiselect's keyboard behaviour matches its on-canvas behaviour. */
  selectedPlacementIds: ReadonlySet<string>;
  onDelete: (placementIds: string[]) => void;
  onCopy: (placementIds: string[]) => void;
  onPaste: () => void;
  onDuplicate: (placementIds: string[]) => void;
  onUndo: () => void;
  onRedo: () => void;
  onNudge: (placementIds: string[], dxRem: number, dyRem: number) => void;
  onGroup: (placementIds: string[]) => void;
  onUngroup: (placementIds: string[]) => void;
}

/** Exported for reuse by other window-level shortcut listeners (e.g. Studio's own Fullscreen Edit toggle) that need the identical "ignore keys typed into a form field" guard. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

/**
 * The Studio canvas editor's keyboard shortcuts (see docs/updates,
 * "EVENT STUDIO — PHASE 4" §10/§11/§12, "EVENT STUDIO — PHASE 5" §6) — a
 * single window-level listener, active only while the editor is actually
 * showing its chrome (§14: never attached in Preview mode, where the
 * canvas is just the real app).
 *
 * Two deliberate exclusions keep this from ever fighting a normal page
 * control: (1) any key that lands while focus is inside an editable form
 * element (an Inspector number field, the Asset Browser's search box,
 * etc.) is ignored outright, so typing "d" in a text field never
 * duplicates the selection; (2) Delete/Backspace and the arrow-key
 * nudges (§12: "Do not interfere with normal page controls when no
 * decoration is selected") only ever call `preventDefault()`/fire at all
 * when something IS selected — with nothing selected, those keys pass
 * straight through untouched.
 */
export function useThemeEditorShortcuts(
  handlers: ThemeEditorShortcutHandlers,
): void {
  useEffect(() => {
    if (!handlers.enabled) return;

    function onKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) return;
      const meta = event.metaKey || event.ctrlKey;
      const ids = Array.from(handlers.selectedPlacementIds);

      if (meta && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          handlers.onRedo();
        } else {
          handlers.onUndo();
        }
        return;
      }

      if (meta && event.key.toLowerCase() === "g") {
        if (event.shiftKey) {
          if (ids.length === 0) return;
          event.preventDefault();
          handlers.onUngroup(ids);
          return;
        }
        if (ids.length < 2) return;
        event.preventDefault();
        handlers.onGroup(ids);
        return;
      }

      if (meta && event.key.toLowerCase() === "c") {
        if (ids.length === 0) return;
        event.preventDefault();
        handlers.onCopy(ids);
        return;
      }

      if (meta && event.key.toLowerCase() === "v") {
        event.preventDefault();
        handlers.onPaste();
        return;
      }

      if (meta && event.key.toLowerCase() === "d") {
        if (ids.length === 0) return;
        event.preventDefault();
        handlers.onDuplicate(ids);
        return;
      }

      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        ids.length > 0
      ) {
        event.preventDefault();
        handlers.onDelete(ids);
        return;
      }

      if (ids.length > 0 && event.key.startsWith("Arrow")) {
        const step = event.shiftKey ? NUDGE_STEP_LARGE_REM : NUDGE_STEP_REM;
        const dx =
          event.key === "ArrowLeft"
            ? -step
            : event.key === "ArrowRight"
              ? step
              : 0;
        const dy =
          event.key === "ArrowUp"
            ? -step
            : event.key === "ArrowDown"
              ? step
              : 0;
        if (dx !== 0 || dy !== 0) {
          event.preventDefault();
          handlers.onNudge(ids, dx, dy);
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });
}
