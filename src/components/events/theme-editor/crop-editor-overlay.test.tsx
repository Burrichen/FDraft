import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CropEditorOverlay } from "./crop-editor-overlay";
import {
  fdraftThemeSchema,
  type FDraftThemePlacement,
} from "@/domain/event-themes/fdraft-theme-schema";

beforeAll(() => {
  // jsdom doesn't implement pointer capture — stub it so the crop
  // handles' `setPointerCapture` call doesn't throw.
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
});

function fixedPlacement(
  overrides: Record<string, unknown> = {},
): Extract<FDraftThemePlacement, { kind: "fixed" }> {
  const theme = fdraftThemeSchema.parse({
    schemaVersion: 1,
    themeId: "test",
    eventId: "test",
    scope: "event",
    assets: {},
    layouts: {
      eventPage: {
        states: {
          active: {
            breakpoints: {
              desktop: {
                placements: [
                  { id: "p1", kind: "fixed", assetId: null, ...overrides },
                ],
              },
            },
          },
        },
      },
    },
  });
  const placement =
    theme.layouts.eventPage!.states.active!.breakpoints.desktop!.placements[0]!;
  return placement as Extract<FDraftThemePlacement, { kind: "fixed" }>;
}

describe("CropEditorOverlay", () => {
  afterEach(() => {
    cleanup();
  });

  it("Reset Crop is disabled when the crop is already the full frame", () => {
    render(
      <CropEditorOverlay
        targetElement={document.createElement("div")}
        placement={fixedPlacement()}
        assetPath="/events/halloween/interactives/pumpkin.png"
        onCommitCrop={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Reset Crop" })).toBeDisabled();
  });

  it("Reset Crop becomes enabled once a crop is already set, and resetting it enables Apply to commit null", async () => {
    const onCommitCrop = vi.fn();
    const user = userEvent.setup();
    render(
      <CropEditorOverlay
        targetElement={document.createElement("div")}
        placement={fixedPlacement({
          crop: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
        })}
        assetPath="/events/halloween/interactives/pumpkin.png"
        onCommitCrop={onCommitCrop}
        onClose={vi.fn()}
      />,
    );
    const resetButton = screen.getByRole("button", { name: "Reset Crop" });
    expect(resetButton).not.toBeDisabled();
    await user.click(resetButton);
    await user.click(screen.getByRole("button", { name: "Apply Crop" }));
    expect(onCommitCrop).toHaveBeenCalledWith(null);
  });

  it("Apply Crop with an untouched (already full-frame) crop commits null, not a redundant {0,0,1,1}", async () => {
    const onCommitCrop = vi.fn();
    const user = userEvent.setup();
    render(
      <CropEditorOverlay
        targetElement={document.createElement("div")}
        placement={fixedPlacement()}
        assetPath="/events/halloween/interactives/pumpkin.png"
        onCommitCrop={onCommitCrop}
        onClose={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Apply Crop" }));
    expect(onCommitCrop).toHaveBeenCalledWith(null);
  });

  it("Cancel closes without committing anything", async () => {
    const onCommitCrop = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <CropEditorOverlay
        targetElement={document.createElement("div")}
        placement={fixedPlacement()}
        assetPath="/events/halloween/interactives/pumpkin.png"
        onCommitCrop={onCommitCrop}
        onClose={onClose}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCommitCrop).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("dragging a corner handle and applying commits a real, normalized crop rect", async () => {
    const onCommitCrop = vi.fn();
    render(
      <CropEditorOverlay
        targetElement={document.createElement("div")}
        placement={fixedPlacement()}
        assetPath="/events/halloween/interactives/pumpkin.png"
        onCommitCrop={onCommitCrop}
        onClose={vi.fn()}
      />,
    );
    const stage = screen.getByRole("group", { name: "Crop region" })
      .parentElement as HTMLElement;
    vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 420,
      height: 320,
      right: 420,
      bottom: 320,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    const handle = screen.getByRole("button", {
      name: /resize crop.*bottom right/i,
    });
    handle.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        clientX: 420,
        clientY: 320,
        pointerId: 1,
      }),
    );
    stage.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        clientX: 210,
        clientY: 160,
        pointerId: 1,
      }),
    );
    stage.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Apply Crop" }));
    expect(onCommitCrop).toHaveBeenCalledTimes(1);
    const committed = onCommitCrop.mock.calls[0][0];
    expect(committed).not.toBeNull();
    expect(committed.width).toBeCloseTo(0.5, 1);
    expect(committed.height).toBeCloseTo(0.5, 1);
  });
});
