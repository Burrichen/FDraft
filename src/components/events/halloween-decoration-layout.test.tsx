import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getEventArtRegistration } from "./event-art-registry";
import {
  HalloweenDecorativeLayer,
  HalloweenGhostPeekLayer,
} from "./halloween-decorative-layer";
import { HalloweenDialogDecoration } from "./halloween-dialog-decoration";
import { HALLOWEEN_DECORATION_REGISTRY } from "./halloween-decoration-registry";
import {
  HALLOWEEN_HEADER_DECORATION_LAYOUT,
  HALLOWEEN_MODAL_DECORATION_LAYOUT,
  HALLOWEEN_PAGE_DECORATION_LAYOUT,
  HALLOWEEN_PAGE_SLOT_POSITIONS,
} from "./halloween-decoration-layout";
import { HalloweenEndingDecoration } from "./halloween-ending-decoration";
import { HALLOWEEN_ENDING_DECORATION_LAYOUT } from "./halloween-ending-decoration-layout";
import "./halloween-art-registration";

vi.mock("@/components/profiles/profile-provider", () => ({
  useProfileContext: () => ({
    activeProfile: { id: "profile-1", displayName: "Alex", settings: {} },
  }),
}));

afterEach(cleanup);

function declaredAssetIds(
  layout: typeof HALLOWEEN_PAGE_DECORATION_LAYOUT,
): string[] {
  return Object.values(layout).flatMap(
    (slot) =>
      slot?.variants
        .map((variant) => variant.assetId)
        .filter((assetId): assetId is string => assetId !== null) ?? [],
  );
}

describe("Halloween Designed Slot configuration", () => {
  it("every asset id the page layout references is actually registered", () => {
    for (const assetId of declaredAssetIds(HALLOWEEN_PAGE_DECORATION_LAYOUT)) {
      expect(HALLOWEEN_DECORATION_REGISTRY).toHaveProperty(assetId);
    }
  });

  it("every asset id the modal layout references is actually registered", () => {
    for (const assetId of declaredAssetIds(HALLOWEEN_MODAL_DECORATION_LAYOUT)) {
      expect(HALLOWEEN_DECORATION_REGISTRY).toHaveProperty(assetId);
    }
  });

  it("every asset id the header (ghost-01 peek) layout references is actually registered", () => {
    for (const assetId of declaredAssetIds(
      HALLOWEEN_HEADER_DECORATION_LAYOUT,
    )) {
      expect(HALLOWEEN_DECORATION_REGISTRY).toHaveProperty(assetId);
    }
  });

  it("HalloweenDecorativeLayer (the Event page's layer) renders without crashing", () => {
    const { container } = render(<HalloweenDecorativeLayer />);
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it("HalloweenGhostPeekLayer (the header-scoped ghost-01 peek) renders without crashing", () => {
    const { container } = render(<HalloweenGhostPeekLayer />);
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it("HalloweenDialogDecoration (the join modal's decoration) renders without crashing", () => {
    const { container } = render(<HalloweenDialogDecoration />);
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it("every asset id the Event-ending layout references is actually registered", () => {
    for (const assetId of declaredAssetIds(
      HALLOWEEN_ENDING_DECORATION_LAYOUT,
    )) {
      expect(HALLOWEEN_DECORATION_REGISTRY).toHaveProperty(assetId);
    }
  });

  it("HalloweenEndingDecoration (the ending dialog's decoration) renders without crashing", () => {
    const { container } = render(<HalloweenEndingDecoration />);
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it("Halloween's ending artwork is loaded through the shared Event Art registry, alongside its page/modal/ambient surfaces", () => {
    const registration = getEventArtRegistration("halloween");
    expect(registration).toBeDefined();
    expect(registration?.surfaces?.ending).toBeDefined();
    expect(registration?.surfaces?.ending?.layout).toBe(
      HALLOWEEN_ENDING_DECORATION_LAYOUT,
    );
  });

  describe("Candy Bowl removal (see docs/updates, 'HALLOWEEN UI CLEANUP' §1)", () => {
    it("no longer declares a lower-right slot on the page layout, or a position for one", () => {
      expect(HALLOWEEN_PAGE_DECORATION_LAYOUT).not.toHaveProperty(
        "lower-right",
      );
      expect(HALLOWEEN_PAGE_SLOT_POSITIONS).not.toHaveProperty("lower-right");
    });

    it("declares neither candy-bowl nor ghost-02 as an asset id anywhere in the live page/header layouts", () => {
      const liveAssetIds = new Set([
        ...declaredAssetIds(HALLOWEEN_PAGE_DECORATION_LAYOUT),
        ...declaredAssetIds(HALLOWEEN_HEADER_DECORATION_LAYOUT),
      ]);
      expect(liveAssetIds.has("candy-bowl")).toBe(false);
      expect(liveAssetIds.has("ghost-02")).toBe(false);
    });

    it("still keeps the candy-bowl and ghost-02 renderers registered (artwork/code preserved, just unused)", () => {
      expect(HALLOWEEN_DECORATION_REGISTRY).toHaveProperty("candy-bowl");
      expect(HALLOWEEN_DECORATION_REGISTRY).toHaveProperty("ghost-02");
    });
  });
});
