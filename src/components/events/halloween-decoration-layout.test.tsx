import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HalloweenDecorativeLayer } from "./halloween-decorative-layer";
import { HalloweenDialogDecoration } from "./halloween-dialog-decoration";
import { HALLOWEEN_DECORATION_REGISTRY } from "./halloween-decoration-registry";
import {
  HALLOWEEN_MODAL_DECORATION_LAYOUT,
  HALLOWEEN_PAGE_DECORATION_LAYOUT,
} from "./halloween-decoration-layout";

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

  it("HalloweenDecorativeLayer (the Event page's layer) renders without crashing", () => {
    const { container } = render(<HalloweenDecorativeLayer />);
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it("HalloweenDialogDecoration (the join modal's decoration) renders without crashing", () => {
    const { container } = render(<HalloweenDialogDecoration />);
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});
