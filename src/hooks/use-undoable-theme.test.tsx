import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useUndoableTheme } from "./use-undoable-theme";
import { fdraftThemeSchema } from "@/domain/event-themes/fdraft-theme-schema";

function theme(themeId: string) {
  return fdraftThemeSchema.parse({
    schemaVersion: 1,
    themeId,
    eventId: themeId,
    scope: "event",
    assets: {},
    layouts: {},
  });
}

describe("useUndoableTheme", () => {
  afterEach(() => {
    cleanup();
  });

  it("starts with theme: null, nothing to undo/redo", () => {
    const { result } = renderHook(() => useUndoableTheme());
    expect(result.current.theme).toBeNull();
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it("reset() replaces the theme and clears history — not itself undoable", () => {
    const { result } = renderHook(() => useUndoableTheme());
    act(() => result.current.reset(theme("a")));
    expect(result.current.theme?.themeId).toBe("a");
    expect(result.current.canUndo).toBe(false);

    act(() => result.current.reset(theme("b")));
    expect(result.current.theme?.themeId).toBe("b");
    // Reset never leaves an undo step behind — undoing after a reset must
    // not bring back the PREVIOUS document.
    expect(result.current.canUndo).toBe(false);
  });

  it("commit() records one undo step; undo/redo move through it", () => {
    const { result } = renderHook(() => useUndoableTheme());
    act(() => result.current.reset(theme("a")));
    act(() => result.current.commit(theme("b")));

    expect(result.current.theme?.themeId).toBe("b");
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);

    act(() => result.current.undo());
    expect(result.current.theme?.themeId).toBe("a");
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.redo());
    expect(result.current.theme?.themeId).toBe("b");
  });

  it("multiple commits produce multiple independent undo steps", () => {
    const { result } = renderHook(() => useUndoableTheme());
    act(() => result.current.reset(theme("a")));
    act(() => result.current.commit(theme("b")));
    act(() => result.current.commit(theme("c")));

    act(() => result.current.undo());
    expect(result.current.theme?.themeId).toBe("b");
    act(() => result.current.undo());
    expect(result.current.theme?.themeId).toBe("a");
    expect(result.current.canUndo).toBe(false);
  });
});
