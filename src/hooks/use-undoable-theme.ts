"use client";

import { useCallback, useMemo, useState } from "react";
import {
  commitHistory,
  createHistory,
  redoHistory,
  undoHistory,
  type HistoryState,
} from "@/domain/event-studio/placement-history";
import type { FDraftThemeFile } from "@/domain/event-themes/fdraft-theme-schema";

export interface UndoableThemeState {
  /** `null` while nothing is loaded (no preset selected/loaded yet). */
  theme: FDraftThemeFile | null;
  /** Records `next` as one new, independently-undoable edit — call this exactly once per completed gesture/control-commit (see `placement-history.ts`'s own doc comment on coalescing). */
  commit: (next: FDraftThemeFile) => void;
  /** Replaces the current theme AND wipes undo/redo history entirely — for a genuinely new document (Load/Reset/switching preset), never for an edit within the SAME document. */
  reset: (next: FDraftThemeFile | null) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * The Studio editor's one undo/redo-aware theme value (see docs/updates,
 * "EVENT STUDIO — PHASE 4" §11) — thin React state wrapper around the
 * pure `placement-history.ts` stack. `reset()` is what `StudioPageClient`
 * calls from its existing Load/Save/Reset-preset flow (Phase 3); every
 * actual EDIT (move/resize/rotate/crop/opacity/flip/delete/duplicate/
 * reorder) goes through `commit()` instead, each call becoming exactly
 * one `Ctrl/Cmd+Z` step.
 */
export function useUndoableTheme(): UndoableThemeState {
  const [history, setHistory] = useState<HistoryState<FDraftThemeFile | null>>(
    () => createHistory<FDraftThemeFile | null>(null),
  );

  const commit = useCallback((next: FDraftThemeFile) => {
    setHistory((current) => commitHistory(current, next));
  }, []);

  const reset = useCallback((next: FDraftThemeFile | null) => {
    setHistory(createHistory(next));
  }, []);

  const undo = useCallback(() => {
    setHistory((current) => undoHistory(current));
  }, []);

  const redo = useCallback(() => {
    setHistory((current) => redoHistory(current));
  }, []);

  return useMemo(
    () => ({
      theme: history.present,
      commit,
      reset,
      undo,
      redo,
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
    }),
    [history, commit, reset, undo, redo],
  );
}
