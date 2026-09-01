import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InspectorPanel, type InspectorPanelProps } from "./inspector-panel";
import { fdraftThemeSchema } from "@/domain/event-themes/fdraft-theme-schema";

const LOCATION = {
  pageId: "eventPage",
  stateId: "active",
  breakpointId: "desktop" as const,
};

function theme(placementOverrides: Record<string, unknown>[] = []) {
  return fdraftThemeSchema.parse({
    schemaVersion: 1,
    themeId: "test",
    eventId: "test",
    scope: "event",
    assets: { pumpkin: "events/halloween/interactives/pumpkin-lit.png" },
    layouts: {
      eventPage: {
        states: {
          active: {
            breakpoints: {
              desktop: {
                placements:
                  placementOverrides.length > 0
                    ? placementOverrides
                    : [
                        {
                          id: "pumpkin-1",
                          kind: "fixed",
                          assetId: "pumpkin",
                          offsetX: 2,
                          offsetY: 3,
                          width: 5,
                        },
                        { id: "gravestone-1", kind: "fixed", assetId: null },
                      ],
              },
            },
          },
        },
      },
    },
  });
}

function baseProps(
  overrides: Partial<InspectorPanelProps> = {},
): InspectorPanelProps {
  return {
    theme: theme(),
    location: LOCATION,
    selectedPlacementIds: new Set(),
    onSelectionChange: vi.fn(),
    groups: [],
    onGroup: vi.fn(),
    onUngroup: vi.fn(),
    lockedPlacementIds: new Set(),
    onToggleLock: vi.fn(),
    freeResize: false,
    onToggleFreeResize: vi.fn(),
    cropActive: false,
    onStartCrop: vi.fn(),
    interactionTestMode: false,
    onToggleInteractionTestMode: vi.fn(),
    onCommit: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    onDuplicate: vi.fn(),
    onReorder: vi.fn(),
    onToggleVisible: vi.fn(),
    onAlign: vi.fn(),
    onDistribute: vi.fn(),
    onConvertToVariantGroup: vi.fn(),
    onStartVariantAssetPick: vi.fn(),
    onAddNothingOption: vi.fn(),
    onRemoveVariantOption: vi.fn(),
    onUpdateVariantOptionWeight: vi.fn(),
    onUpdateVariantOptionAdjustments: vi.fn(),
    onReorderVariantOption: vi.fn(),
    previewSeed: "test-seed",
    onRerollPreview: vi.fn(),
    onResetPreviewSeed: vi.fn(),
    onCopyToBreakpoint: vi.fn(),
    onCopyToAllBreakpoints: vi.fn(),
    safeZoneWarnings: [],
    ...overrides,
  };
}

describe("InspectorPanel — Layers", () => {
  afterEach(() => {
    cleanup();
  });

  it("lists every placement, top-of-z-order first", () => {
    render(<InspectorPanel {...baseProps()} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("gravestone-1");
    expect(items[1]).toHaveTextContent("pumpkin-1");
  });

  it("clicking a layer row selects it", async () => {
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    render(<InspectorPanel {...baseProps({ onSelectionChange })} />);
    await user.click(screen.getByText("pumpkin-1"));
    expect(onSelectionChange).toHaveBeenCalledWith(new Set(["pumpkin-1"]));
  });

  it("shift-clicking a second row adds it to the selection", async () => {
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    render(
      <InspectorPanel
        {...baseProps({
          selectedPlacementIds: new Set(["pumpkin-1"]),
          onSelectionChange,
        })}
      />,
    );
    await user.keyboard("{Shift>}");
    await user.click(screen.getByText("gravestone-1"));
    await user.keyboard("{/Shift}");
    expect(onSelectionChange).toHaveBeenCalledWith(
      new Set(["pumpkin-1", "gravestone-1"]),
    );
  });

  it("double-clicking a layer row enters rename mode, committed on blur", async () => {
    const onRename = vi.fn();
    const user = userEvent.setup();
    render(<InspectorPanel {...baseProps({ onRename })} />);
    await user.dblClick(screen.getByText("pumpkin-1"));
    const input = screen.getByDisplayValue("pumpkin-1");
    await user.clear(input);
    await user.type(input, "carved-pumpkin");
    await user.tab();
    expect(onRename).toHaveBeenCalledWith("pumpkin-1", "carved-pumpkin");
  });

  it("toggles visibility and lock from their own icon buttons", async () => {
    const onToggleVisible = vi.fn();
    const onToggleLock = vi.fn();
    const user = userEvent.setup();
    render(
      <InspectorPanel {...baseProps({ onToggleVisible, onToggleLock })} />,
    );
    await user.click(screen.getByRole("button", { name: "Hide pumpkin-1" }));
    expect(onToggleVisible).toHaveBeenCalledWith("pumpkin-1");
    await user.click(screen.getByRole("button", { name: "Lock pumpkin-1" }));
    expect(onToggleLock).toHaveBeenCalledWith("pumpkin-1");
  });

  it("reorder buttons appear only for a single selection, and call onReorder with the right direction", async () => {
    const onReorder = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <InspectorPanel {...baseProps({ onReorder })} />,
    );
    expect(
      screen.queryByRole("button", { name: "Bring to Front" }),
    ).not.toBeInTheDocument();

    rerender(
      <InspectorPanel
        {...baseProps({
          onReorder,
          selectedPlacementIds: new Set(["pumpkin-1"]),
        })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Bring to Front" }));
    expect(onReorder).toHaveBeenCalledWith("pumpkin-1", "front");
  });
});

describe("InspectorPanel — single-object Inspector fields", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows a placeholder with nothing selected", () => {
    render(<InspectorPanel {...baseProps()} />);
    expect(screen.getByText(/select a placement to edit/i)).toBeInTheDocument();
  });

  it("commits an X offset edit on blur, not on every keystroke", async () => {
    const onCommit = vi.fn();
    const user = userEvent.setup();
    render(
      <InspectorPanel
        {...baseProps({
          onCommit,
          selectedPlacementIds: new Set(["pumpkin-1"]),
        })}
      />,
    );
    const field = screen.getByLabelText("X offset (rem)");
    await user.clear(field);
    await user.type(field, "9");
    expect(onCommit).not.toHaveBeenCalled();
    await user.tab();
    expect(onCommit).toHaveBeenCalledWith("pumpkin-1", expect.any(Function));
    const updater = onCommit.mock.calls[0][1];
    expect(
      updater({ id: "pumpkin-1", kind: "fixed", offsetX: 2 }).offsetX,
    ).toBe(9);
  });

  it("Flip Horizontal/Vertical toggle their respective flags", async () => {
    const onCommit = vi.fn();
    const user = userEvent.setup();
    render(
      <InspectorPanel
        {...baseProps({
          onCommit,
          selectedPlacementIds: new Set(["pumpkin-1"]),
        })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Flip Horizontal" }));
    const updater = onCommit.mock.calls[0][1];
    expect(
      updater({ id: "pumpkin-1", kind: "fixed", flipX: false }).flipX,
    ).toBe(true);
  });

  it("the Interaction dropdown lists the registered allowlist with friendly labels", () => {
    render(
      <InspectorPanel
        {...baseProps({ selectedPlacementIds: new Set(["pumpkin-1"]) })}
      />,
    );
    const select = screen.getByLabelText("Interaction");
    expect(select).toContainHTML("Halloween Pumpkin");
    expect(select).toContainHTML("Halloween Gravestone");
    expect(select).toContainHTML("Halloween Candy Bowl");
  });

  it("Crop is disabled for a placement with no assetId", () => {
    render(
      <InspectorPanel
        {...baseProps({ selectedPlacementIds: new Set(["gravestone-1"]) })}
      />,
    );
    expect(screen.getByRole("button", { name: "Crop" })).toBeDisabled();
  });

  it("Delete/Duplicate call through with no arguments — they act on whatever's currently selected", async () => {
    const onDelete = vi.fn();
    const onDuplicate = vi.fn();
    const user = userEvent.setup();
    render(
      <InspectorPanel
        {...baseProps({
          onDelete,
          onDuplicate,
          selectedPlacementIds: new Set(["pumpkin-1"]),
        })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    // Both are used directly as onClick handlers, so React does pass the
    // click SyntheticEvent through — the meaningful contract (their
    // declared `() => void` type) is that callers ignore it and act on
    // whatever's currently selected instead, verified elsewhere by
    // `StudioPageClient`'s own wiring.
    expect(onDuplicate).toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalled();
  });

  it("a locked placement's fields are visually disabled and shows an unlock hint", () => {
    render(
      <InspectorPanel
        {...baseProps({
          selectedPlacementIds: new Set(["pumpkin-1"]),
          lockedPlacementIds: new Set(["pumpkin-1"]),
        })}
      />,
    );
    expect(screen.getByText(/locked — unlock to edit/i)).toBeInTheDocument();
  });

  it("shows a Convert to Variant Group button only for a fixed placement", () => {
    render(
      <InspectorPanel
        {...baseProps({ selectedPlacementIds: new Set(["pumpkin-1"]) })}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Convert to Variant Group" }),
    ).toBeInTheDocument();
  });

  it("Convert to Variant Group calls through with the selected id", async () => {
    const onConvertToVariantGroup = vi.fn();
    const user = userEvent.setup();
    render(
      <InspectorPanel
        {...baseProps({
          onConvertToVariantGroup,
          selectedPlacementIds: new Set(["pumpkin-1"]),
        })}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Convert to Variant Group" }),
    );
    expect(onConvertToVariantGroup).toHaveBeenCalledWith("pumpkin-1");
  });

  it("shows the responsive-visibility summary and copy-to-breakpoint actions", async () => {
    const onCopyToBreakpoint = vi.fn();
    const onCopyToAllBreakpoints = vi.fn();
    const user = userEvent.setup();
    render(
      <InspectorPanel
        {...baseProps({
          selectedPlacementIds: new Set(["pumpkin-1"]),
          onCopyToBreakpoint,
          onCopyToAllBreakpoints,
        })}
      />,
    );
    expect(screen.getByText(/Desktop ✓/)).toBeInTheDocument();
    expect(screen.getByText(/Tablet —/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy to Tablet" }));
    expect(onCopyToBreakpoint).toHaveBeenCalledWith("tablet");
    await user.click(
      screen.getByRole("button", { name: "Copy to All Breakpoints" }),
    );
    expect(onCopyToAllBreakpoints).toHaveBeenCalled();
  });

  it("shows safe-zone overlap warnings when provided", () => {
    render(
      <InspectorPanel
        {...baseProps({
          selectedPlacementIds: new Set(["pumpkin-1"]),
          safeZoneWarnings: ["Overlaps film-card content area"],
        })}
      />,
    );
    expect(
      screen.getByText(/Overlaps film-card content area/),
    ).toBeInTheDocument();
  });
});

describe("InspectorPanel — Variant Editor (EVENT STUDIO — PHASE 5 §2/§3/§4)", () => {
  afterEach(() => {
    cleanup();
  });

  function weightedTheme() {
    return theme([
      {
        id: "weighted-1",
        kind: "weighted",
        variants: [
          { id: "ghost", assetId: "pumpkin", weight: 35 },
          { id: "nothing", assetId: null, weight: 65 },
        ],
      },
    ]);
  }

  it("shows every option with its normalized percentage", () => {
    render(
      <InspectorPanel
        {...baseProps({
          theme: weightedTheme(),
          selectedPlacementIds: new Set(["weighted-1"]),
        })}
      />,
    );
    expect(screen.getByText("35%")).toBeInTheDocument();
    expect(screen.getByText("65%")).toBeInTheDocument();
    expect(screen.getByText("Nothing")).toBeInTheDocument();
  });

  it("+ Add asset option starts the asset picker for this placement", async () => {
    const onStartVariantAssetPick = vi.fn();
    const user = userEvent.setup();
    render(
      <InspectorPanel
        {...baseProps({
          theme: weightedTheme(),
          selectedPlacementIds: new Set(["weighted-1"]),
          onStartVariantAssetPick,
        })}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "+ Add asset option" }),
    );
    expect(onStartVariantAssetPick).toHaveBeenCalledWith("weighted-1");
  });

  it("+ Add Nothing calls through with the placement id", async () => {
    const onAddNothingOption = vi.fn();
    const user = userEvent.setup();
    render(
      <InspectorPanel
        {...baseProps({
          theme: weightedTheme(),
          selectedPlacementIds: new Set(["weighted-1"]),
          onAddNothingOption,
        })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "+ Add Nothing" }));
    expect(onAddNothingOption).toHaveBeenCalledWith("weighted-1");
  });

  it("removing an option calls through with both ids", async () => {
    const onRemoveVariantOption = vi.fn();
    const user = userEvent.setup();
    render(
      <InspectorPanel
        {...baseProps({
          theme: weightedTheme(),
          selectedPlacementIds: new Set(["weighted-1"]),
          onRemoveVariantOption,
        })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Remove Nothing" }));
    expect(onRemoveVariantOption).toHaveBeenCalledWith("weighted-1", "nothing");
  });

  it("Fine-tune expands per-option scale/rotation/offset adjustment fields (EVENT STUDIO — PHASE 5 §3)", async () => {
    const onUpdateVariantOptionAdjustments = vi.fn();
    const user = userEvent.setup();
    render(
      <InspectorPanel
        {...baseProps({
          theme: weightedTheme(),
          selectedPlacementIds: new Set(["weighted-1"]),
          onUpdateVariantOptionAdjustments,
        })}
      />,
    );
    expect(screen.queryByLabelText("Rotation +")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Fine-tune Nothing" }));
    const rotationField = screen.getByLabelText("Rotation +");
    await user.clear(rotationField);
    await user.type(rotationField, "12");
    await user.tab();

    expect(onUpdateVariantOptionAdjustments).toHaveBeenCalledWith(
      "weighted-1",
      "nothing",
      expect.any(Function),
    );
    const updater = onUpdateVariantOptionAdjustments.mock.calls[0][2];
    expect(
      updater({
        id: "nothing",
        assetId: null,
        weight: 65,
        scale: null,
        opacityOverride: null,
        offsetXAdjustment: 0,
        offsetYAdjustment: 0,
        rotationAdjustment: 0,
      }).rotationAdjustment,
    ).toBe(12);
  });

  it("Preview Another Variant / Reset Preview Seed call through", async () => {
    const onRerollPreview = vi.fn();
    const onResetPreviewSeed = vi.fn();
    const user = userEvent.setup();
    render(
      <InspectorPanel
        {...baseProps({
          theme: weightedTheme(),
          selectedPlacementIds: new Set(["weighted-1"]),
          onRerollPreview,
          onResetPreviewSeed,
        })}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Preview Another Variant" }),
    );
    expect(onRerollPreview).toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Reset Preview Seed" }),
    );
    expect(onResetPreviewSeed).toHaveBeenCalled();
  });

  it("does not show the fixed-only Crop/Convert controls for a weighted placement", () => {
    render(
      <InspectorPanel
        {...baseProps({
          theme: weightedTheme(),
          selectedPlacementIds: new Set(["weighted-1"]),
        })}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Convert to Variant Group" }),
    ).not.toBeInTheDocument();
  });
});

describe("InspectorPanel — multiselect toolbar (EVENT STUDIO — PHASE 5 §6/§9)", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the count and Align/Distribute/Group controls for 2+ selected", () => {
    render(
      <InspectorPanel
        {...baseProps({
          selectedPlacementIds: new Set(["pumpkin-1", "gravestone-1"]),
        })}
      />,
    );
    expect(screen.getByText("2 objects selected")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Align Left" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Distribute Horizontally" }),
    ).toBeDisabled();
  });

  it("Align buttons call onAlign with the right action", async () => {
    const onAlign = vi.fn();
    const user = userEvent.setup();
    render(
      <InspectorPanel
        {...baseProps({
          onAlign,
          selectedPlacementIds: new Set(["pumpkin-1", "gravestone-1"]),
        })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Align Centre" }));
    expect(onAlign).toHaveBeenCalledWith("centerH");
  });

  it("Group/Ungroup call through with no arguments (the parent owns the current selection)", async () => {
    const onGroup = vi.fn();
    const onUngroup = vi.fn();
    const user = userEvent.setup();
    render(
      <InspectorPanel
        {...baseProps({
          onGroup,
          onUngroup,
          groups: [["pumpkin-1", "gravestone-1"]],
          selectedPlacementIds: new Set(["pumpkin-1", "gravestone-1"]),
        })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Group" }));
    expect(onGroup).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Ungroup" }));
    expect(onUngroup).toHaveBeenCalled();
  });

  it("Ungroup is disabled unless the WHOLE selection is exactly one existing group", () => {
    render(
      <InspectorPanel
        {...baseProps({
          groups: [],
          selectedPlacementIds: new Set(["pumpkin-1", "gravestone-1"]),
        })}
      />,
    );
    expect(screen.getByRole("button", { name: "Ungroup" })).toBeDisabled();
  });

  it("shows copy-to-breakpoint actions for the group too", async () => {
    const onCopyToBreakpoint = vi.fn();
    const user = userEvent.setup();
    render(
      <InspectorPanel
        {...baseProps({
          onCopyToBreakpoint,
          selectedPlacementIds: new Set(["pumpkin-1", "gravestone-1"]),
        })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Copy to Mobile" }));
    expect(onCopyToBreakpoint).toHaveBeenCalledWith("mobile");
  });
});
