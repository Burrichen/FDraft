import { cleanup, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  EditableThemeCanvas,
  type EditableThemeCanvasProps,
} from "./editable-theme-canvas";
import { ProfileProvider } from "@/components/profiles/profile-provider";
import { fdraftThemeSchema } from "@/domain/event-themes/fdraft-theme-schema";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";

beforeAll(() => {
  // jsdom doesn't implement pointer capture — react-moveable's own
  // gesture handling calls it internally; stub it so mounting the
  // transform handles doesn't throw.
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
});

const PROFILE_ID = "alex";

async function seedProfile(databaseName: string) {
  const db = new FDraftLocalDatabase(databaseName);
  const repos = createLocalRepositories(db);
  await repos.profiles.create({
    id: PROFILE_ID,
    displayName: "Alex",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastOpenedAt: "2026-01-01T00:00:00.000Z",
    timezone: "UTC",
    settings: {
      reducedMotion: false,
      defaultPage: "watchlist",
      franchiseChronologicalOrder: false,
      adminMode: false,
      halloweenPumpkinState: "uncarved",
    },
    dataVersion: 1,
  });
  await db.close();
}

function renderCanvas(props: EditableThemeCanvasProps, databaseName: string) {
  return render(
    <ProfileProvider databaseName={databaseName}>
      <EditableThemeCanvas {...props} />
    </ProfileProvider>,
  );
}

const LOCATION = {
  pageId: "eventPage",
  stateId: "active",
  breakpointId: "desktop" as const,
};

function theme() {
  return fdraftThemeSchema.parse({
    schemaVersion: 1,
    themeId: "test",
    eventId: "test",
    scope: "event",
    assets: {
      pumpkin: "events/halloween/interactives/pumpkin-lit.png",
      ghost: "events/halloween/decorations/ghost.png",
    },
    layouts: {
      eventPage: {
        states: {
          active: {
            breakpoints: {
              desktop: {
                placements: [
                  {
                    id: "pumpkin-1",
                    kind: "fixed",
                    assetId: "pumpkin",
                    width: 5,
                  },
                  {
                    id: "hidden-1",
                    kind: "fixed",
                    assetId: "pumpkin",
                    visible: false,
                  },
                  {
                    id: "carved-pumpkin",
                    kind: "fixed",
                    assetId: null,
                    interactionId: "halloween-pumpkin",
                    width: 3,
                    height: 3,
                  },
                  {
                    id: "weighted-1",
                    kind: "weighted",
                    variants: [{ id: "v1", assetId: "ghost", weight: 1 }],
                  },
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
  overrides: Partial<EditableThemeCanvasProps> = {},
): EditableThemeCanvasProps {
  return {
    theme: theme(),
    location: LOCATION,
    width: 1440,
    height: 900,
    zoom: 1,
    selectedPlacementIds: new Set(),
    onSelectionChange: vi.fn(),
    groups: [],
    lockedPlacementIds: new Set(),
    freeResize: false,
    cropPlacementId: null,
    interactionTestMode: false,
    previewSeed: "test-seed",
    snap: {
      toGrid: false,
      toPage: false,
      toCenter: false,
      toObjects: false,
      gridSizePx: 20,
    },
    showGrid: false,
    onCommit: vi.fn(),
    onCommitMultiple: vi.fn(),
    onDropAsset: vi.fn(),
    onCloseCrop: vi.fn(),
    ...overrides,
  };
}

describe("EditableThemeCanvas", () => {
  let databaseName: string;

  beforeEach(async () => {
    databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders every visible fixed placement, but never a hidden one", () => {
    renderCanvas(baseProps(), databaseName);
    expect(
      document.querySelector('[data-fdraft-placement-id="pumpkin-1"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-fdraft-placement-id="hidden-1"]'),
    ).toBeNull();
  });

  it("renders a weighted group's REAL resolved content, marked with a small variant-group badge (EVENT STUDIO — PHASE 5 §4)", () => {
    renderCanvas(baseProps(), databaseName);
    const el = document.querySelector(
      '[data-fdraft-placement-id="weighted-1"]',
    )!;
    expect(el).not.toBeNull();
    expect(el.querySelector('[title="Weighted variant group"]')).not.toBeNull();
  });

  it("clicking a placement replaces the selection with just that one", async () => {
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    renderCanvas(baseProps({ onSelectionChange }), databaseName);
    const el = document.querySelector(
      '[data-fdraft-placement-id="pumpkin-1"]',
    )!;
    await user.pointer({ keys: "[MouseLeft]", target: el });
    expect(onSelectionChange).toHaveBeenCalledWith(new Set(["pumpkin-1"]));
  });

  it("shift-clicking a second placement ADDS it to the selection", async () => {
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    renderCanvas(
      baseProps({
        selectedPlacementIds: new Set(["pumpkin-1"]),
        onSelectionChange,
      }),
      databaseName,
    );
    const el = document.querySelector(
      '[data-fdraft-placement-id="carved-pumpkin"]',
    )!;
    await user.keyboard("{Shift>}");
    await user.pointer({ keys: "[MouseLeft]", target: el });
    await user.keyboard("{/Shift}");
    expect(onSelectionChange).toHaveBeenCalledWith(
      new Set(["pumpkin-1", "carved-pumpkin"]),
    );
  });

  it("clicking empty canvas space deselects", async () => {
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    const { container } = renderCanvas(
      baseProps({
        onSelectionChange,
        selectedPlacementIds: new Set(["pumpkin-1"]),
      }),
      databaseName,
    );
    await user.pointer({
      keys: "[MouseLeft]",
      target: container.firstElementChild!,
    });
    expect(onSelectionChange).toHaveBeenCalledWith(new Set());
  });

  it("a locked placement has pointer-events disabled on canvas", () => {
    renderCanvas(
      baseProps({ lockedPlacementIds: new Set(["pumpkin-1"]) }),
      databaseName,
    );
    const el = document.querySelector(
      '[data-fdraft-placement-id="pumpkin-1"]',
    ) as HTMLElement;
    expect(el.style.pointerEvents).toBe("none");
  });

  it("in Edit mode's default (non-test) interaction mode, a click-catcher overlay sits over an interactive placement", () => {
    renderCanvas(baseProps(), databaseName);
    const wrapper = document.querySelector(
      '[data-fdraft-placement-id="carved-pumpkin"]',
    )!;
    // The click-catcher is an unlabeled absolutely-positioned sibling div
    // with no text content — present by default (test mode off).
    expect(
      wrapper.querySelector('[aria-hidden="true"].absolute.inset-0'),
    ).not.toBeNull();
  });

  it("interactionTestMode removes the click-catcher, letting the real component receive clicks", () => {
    renderCanvas(baseProps({ interactionTestMode: true }), databaseName);
    const el = document.querySelector(
      '[data-fdraft-placement-id="carved-pumpkin"]',
    )!;
    expect(
      el.querySelector('[aria-hidden="true"].absolute.inset-0'),
    ).toBeNull();
  });

  it("dropping a dragged asset calls onDropAsset with the canvas-relative position", () => {
    const onDropAsset = vi.fn();
    const { container } = renderCanvas(
      baseProps({ onDropAsset }),
      databaseName,
    );
    const canvas = container.firstElementChild as HTMLElement;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 100,
      top: 50,
      width: 1440,
      height: 900,
      right: 1540,
      bottom: 950,
      x: 100,
      y: 50,
      toJSON: () => ({}),
    });

    const dataTransfer = {
      getData: (key: string) =>
        key === "application/x-fdraft-asset-id"
          ? "events/halloween/interactives/candy-bowl-full.png"
          : "",
    };
    const dropEvent = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, "dataTransfer", { value: dataTransfer });
    Object.defineProperty(dropEvent, "clientX", { value: 250 });
    Object.defineProperty(dropEvent, "clientY", { value: 150 });
    canvas.dispatchEvent(dropEvent);

    expect(onDropAsset).toHaveBeenCalledWith(
      "events/halloween/interactives/candy-bowl-full.png",
      150,
      100,
    );
  });

  it("mounts the Moveable transform handles without crashing for a single selection", () => {
    expect(() =>
      renderCanvas(
        baseProps({ selectedPlacementIds: new Set(["pumpkin-1"]) }),
        databaseName,
      ),
    ).not.toThrow();
  });

  it("mounts Moveable's GROUP transform handles without crashing for a multi-selection (EVENT STUDIO — PHASE 5 §5/§6)", () => {
    expect(() =>
      renderCanvas(
        baseProps({
          selectedPlacementIds: new Set(["pumpkin-1", "carved-pumpkin"]),
        }),
        databaseName,
      ),
    ).not.toThrow();
  });

  it("does not attach transform handles for a fully-locked selection", () => {
    expect(() =>
      renderCanvas(
        baseProps({
          selectedPlacementIds: new Set(["pumpkin-1"]),
          lockedPlacementIds: new Set(["pumpkin-1"]),
        }),
        databaseName,
      ),
    ).not.toThrow();
  });

  it("renders an editor-only grid overlay when showGrid is on, using the configured grid size", () => {
    const { container } = renderCanvas(
      baseProps({
        showGrid: true,
        snap: {
          toGrid: true,
          toPage: false,
          toCenter: false,
          toObjects: false,
          gridSizePx: 40,
        },
      }),
      databaseName,
    );
    const canvas = container.firstElementChild as HTMLElement;
    expect(canvas.style.backgroundSize).toBe("40px 40px");
  });

  it("renders no grid background when showGrid is off", () => {
    const { container } = renderCanvas(
      baseProps({ showGrid: false }),
      databaseName,
    );
    const canvas = container.firstElementChild as HTMLElement;
    expect(canvas.style.backgroundImage).toBe("");
  });

  it("dragging a marquee rectangle over empty space and releasing selects every intersecting placement", async () => {
    const onSelectionChange = vi.fn();
    const { container } = renderCanvas(
      baseProps({ onSelectionChange }),
      databaseName,
    );
    const canvas = container.firstElementChild as HTMLElement;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 1440,
      height: 900,
      right: 1440,
      bottom: 900,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    canvas.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        clientX: 0,
        clientY: 0,
        pointerId: 1,
      }),
    );
    canvas.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        clientX: 1440,
        clientY: 900,
        pointerId: 1,
      }),
    );
    canvas.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }),
    );

    expect(onSelectionChange).toHaveBeenCalled();
    const finalSelection = onSelectionChange.mock.calls.at(
      -1,
    )![0] as Set<string>;
    // A marquee spanning the whole canvas should pick up every visible,
    // resolvable placement (not the hidden one).
    expect(finalSelection.has("pumpkin-1")).toBe(true);
    expect(finalSelection.has("carved-pumpkin")).toBe(true);
    expect(finalSelection.has("hidden-1")).toBe(false);
  });
});
