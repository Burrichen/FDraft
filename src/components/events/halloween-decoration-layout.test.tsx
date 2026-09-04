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
  HALLOWEEN_ACTIVE_PAGE_DECORATION_LAYOUT,
  HALLOWEEN_HEADER_DECORATION_LAYOUT,
  HALLOWEEN_MODAL_DECORATION_LAYOUT,
  HALLOWEEN_PAGE_DECORATION_LAYOUT,
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

  it("every asset id the page's interactive (Candy Bowl / ghost-02) layout references is actually registered", () => {
    for (const assetId of declaredAssetIds(
      HALLOWEEN_ACTIVE_PAGE_DECORATION_LAYOUT,
    )) {
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
});
