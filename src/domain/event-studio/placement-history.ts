/**
 * A generic, pure undo/redo stack (see docs/updates, "EVENT STUDIO —
 * PHASE 4" §11: "ESSENTIAL"). No React here — `useUndoableTheme`
 * (`src/hooks/use-undoable-theme.ts`) is the thin stateful wrapper a
 * component actually uses; this module is just the plain data structure
 * and its three pure transitions, independently testable with no
 * rendering involved at all.
 *
 * Coalescing "hundreds of undo entries during every pixel of a drag"
 * (§11) is NOT this stack's job — a stack has no way to know whether two
 * `commit()` calls belong to the same gesture. Instead, callers are
 * responsible for only calling `commit()` once per completed gesture
 * (e.g. a Moveable `onDragEnd`, not `onDrag`) or once a continuous
 * control's value is COMMITTED (e.g. a Slider's `onValueCommitted`, not
 * every intermediate `onValueChange`) — see `studio-page-client.tsx` for
 * where every one of those boundaries actually lives.
 */
export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

/** Caps memory growth in a long editing session — old entries beyond this simply age out, the same trade-off every bounded undo stack (Photoshop, Figma) makes. */
const MAX_HISTORY_ENTRIES = 100;

export function createHistory<T>(initial: T): HistoryState<T> {
  return { past: [], present: initial, future: [] };
}

/** Records `next` as a new, independently-undoable state — clears `future` (the standard "a new edit invalidates any redo stack" rule every undo/redo system uses). A no-op (returns the same reference) when `next` is reference-equal to the current `present`, so a control that fires `onValueCommitted` with an unchanged value never pollutes history. */
export function commitHistory<T>(
  history: HistoryState<T>,
  next: T,
): HistoryState<T> {
  if (next === history.present) {
    return history;
  }
  const past = [...history.past, history.present].slice(-MAX_HISTORY_ENTRIES);
  return { past, present: next, future: [] };
}

export function undoHistory<T>(history: HistoryState<T>): HistoryState<T> {
  if (history.past.length === 0) {
    return history;
  }
  const previous = history.past[history.past.length - 1]!;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redoHistory<T>(history: HistoryState<T>): HistoryState<T> {
  if (history.future.length === 0) {
    return history;
  }
  const [next, ...rest] = history.future;
  return {
    past: [...history.past, history.present],
    present: next!,
    future: rest,
  };
}
