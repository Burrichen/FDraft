import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EventDecorationLayer } from "./event-decoration-layer";
import { CHRISTMAS_DECORATION_REGISTRY } from "./christmas-decoration-registry";
import {
  CHRISTMAS_PAGE_DECORATION_LAYOUT,
  CHRISTMAS_PAGE_SLOT_POSITIONS,
} from "./christmas-decoration-layout";

afterEach(cleanup);

describe("Christmas Designed Slot configuration (reuse proof)", () => {
  it("every asset id the example layout references is actually registered", () => {
    const assetIds = Object.values(CHRISTMAS_PAGE_DECORATION_LAYOUT).flatMap(
      (slot) =>
        slot?.variants
          .map((variant) => variant.assetId)
          .filter((assetId): assetId is string => assetId !== null) ?? [],
    );
    expect(assetIds.length).toBeGreaterThan(0);
    for (const assetId of assetIds) {
      expect(CHRISTMAS_DECORATION_REGISTRY).toHaveProperty(assetId);
    }
  });

  it("renders through the exact same generic EventDecorationLayer Halloween uses, with zero Christmas-specific code in that component", () => {
    const { container } = render(
      <EventDecorationLayer
        layout={CHRISTMAS_PAGE_DECORATION_LAYOUT}
        registry={CHRISTMAS_DECORATION_REGISTRY}
        positions={CHRISTMAS_PAGE_SLOT_POSITIONS}
        seedInputs={{ eventId: "christmas", layoutKey: "christmas-page" }}
      />,
    );
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});
