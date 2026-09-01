import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useThemeEditorShortcuts } from "./use-theme-editor-shortcuts";

function Harness(props: Parameters<typeof useThemeEditorShortcuts>[0]) {
  useThemeEditorShortcuts(props);
  return createElement("input", { "data-testid": "field", type: "text" });
}

function fireKey(init: KeyboardEventInit, target: EventTarget = window): void {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, ...init }),
  );
}

function baseHandlers(
  overrides: Partial<Parameters<typeof useThemeEditorShortcuts>[0]> = {},
): Parameters<typeof useThemeEditorShortcuts>[0] {
  return {
    enabled: true,
    selectedPlacementIds: new Set(),
    onDelete: vi.fn(),
    onCopy: vi.fn(),
    onPaste: vi.fn(),
    onDuplicate: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onNudge: vi.fn(),
    onGroup: vi.fn(),
    onUngroup: vi.fn(),
    ...overrides,
  };
}

describe("useThemeEditorShortcuts", () => {
  afterEach(() => {
    cleanup();
  });

  it("Delete fires onDelete with the whole selection", () => {
    const onDelete = vi.fn();
    render(
      createElement(
        Harness,
        baseHandlers({ selectedPlacementIds: new Set(["p1", "p2"]), onDelete }),
      ),
    );
    fireKey({ key: "Delete" });
    expect(onDelete).toHaveBeenCalledWith(["p1", "p2"]);
  });

  it("Delete does nothing when nothing is selected (no interference with normal controls)", () => {
    const onDelete = vi.fn();
    render(createElement(Harness, baseHandlers({ onDelete })));
    fireKey({ key: "Delete" });
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("ArrowLeft/Right/Up/Down nudge the whole selection, with Shift for a larger step", () => {
    const onNudge = vi.fn();
    render(
      createElement(
        Harness,
        baseHandlers({ selectedPlacementIds: new Set(["p1"]), onNudge }),
      ),
    );
    fireKey({ key: "ArrowRight" });
    fireKey({ key: "ArrowDown", shiftKey: true });
    expect(onNudge).toHaveBeenCalledTimes(2);
    const [, dx1] = onNudge.mock.calls[0];
    const [, , dy2] = onNudge.mock.calls[1];
    expect(dx1).toBeGreaterThan(0);
    // The shift-nudge is a larger step than the plain one.
    expect(Math.abs(dy2)).toBeGreaterThan(Math.abs(dx1));
  });

  it("arrow keys do nothing when nothing is selected", () => {
    const onNudge = vi.fn();
    render(createElement(Harness, baseHandlers({ onNudge })));
    fireKey({ key: "ArrowRight" });
    expect(onNudge).not.toHaveBeenCalled();
  });

  it("Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z redoes, regardless of selection", () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    render(createElement(Harness, baseHandlers({ onUndo, onRedo })));
    fireKey({ key: "z", metaKey: true });
    fireKey({ key: "z", metaKey: true, shiftKey: true });
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRedo).toHaveBeenCalledTimes(1);
  });

  it("Ctrl/Cmd+C copies and Ctrl/Cmd+D duplicates the whole selection", () => {
    const onCopy = vi.fn();
    const onDuplicate = vi.fn();
    render(
      createElement(
        Harness,
        baseHandlers({
          selectedPlacementIds: new Set(["p1", "p2"]),
          onCopy,
          onDuplicate,
        }),
      ),
    );
    fireKey({ key: "c", metaKey: true });
    fireKey({ key: "d", metaKey: true });
    expect(onCopy).toHaveBeenCalledWith(["p1", "p2"]);
    expect(onDuplicate).toHaveBeenCalledWith(["p1", "p2"]);
  });

  it("Ctrl/Cmd+V pastes even with nothing selected", () => {
    const onPaste = vi.fn();
    render(createElement(Harness, baseHandlers({ onPaste })));
    fireKey({ key: "v", metaKey: true });
    expect(onPaste).toHaveBeenCalled();
  });

  it("Ctrl/Cmd+G groups the current selection when 2+ are selected", () => {
    const onGroup = vi.fn();
    render(
      createElement(
        Harness,
        baseHandlers({ selectedPlacementIds: new Set(["p1", "p2"]), onGroup }),
      ),
    );
    fireKey({ key: "g", metaKey: true });
    expect(onGroup).toHaveBeenCalledWith(["p1", "p2"]);
  });

  it("Ctrl/Cmd+G does nothing with fewer than 2 selected", () => {
    const onGroup = vi.fn();
    render(
      createElement(
        Harness,
        baseHandlers({ selectedPlacementIds: new Set(["p1"]), onGroup }),
      ),
    );
    fireKey({ key: "g", metaKey: true });
    expect(onGroup).not.toHaveBeenCalled();
  });

  it("Ctrl/Cmd+Shift+G ungroups the current selection", () => {
    const onUngroup = vi.fn();
    render(
      createElement(
        Harness,
        baseHandlers({
          selectedPlacementIds: new Set(["p1", "p2"]),
          onUngroup,
        }),
      ),
    );
    fireKey({ key: "g", metaKey: true, shiftKey: true });
    expect(onUngroup).toHaveBeenCalledWith(["p1", "p2"]);
  });

  it("Ctrl/Cmd+Shift+G does nothing with nothing selected", () => {
    const onUngroup = vi.fn();
    render(createElement(Harness, baseHandlers({ onUngroup })));
    fireKey({ key: "g", metaKey: true, shiftKey: true });
    expect(onUngroup).not.toHaveBeenCalled();
  });

  it("ignores every shortcut while focus is inside an editable field", () => {
    const onDelete = vi.fn();
    const { getByTestId } = render(
      createElement(
        Harness,
        baseHandlers({ selectedPlacementIds: new Set(["p1"]), onDelete }),
      ),
    );
    fireKey({ key: "Delete" }, getByTestId("field"));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("does nothing at all when disabled (e.g. Preview mode)", () => {
    const onDelete = vi.fn();
    render(
      createElement(
        Harness,
        baseHandlers({
          enabled: false,
          selectedPlacementIds: new Set(["p1"]),
          onDelete,
        }),
      ),
    );
    fireKey({ key: "Delete" });
    expect(onDelete).not.toHaveBeenCalled();
  });
});
