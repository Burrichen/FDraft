import { describe, expect, it } from "vitest";
import {
  anchorEdgeStyle,
  placementWrapperStyle,
} from "./fdraft-theme-placement-css";
import type { FDraftThemeResolvedPlacement } from "@/domain/event-themes/fdraft-theme-resolve";

function placement(
  overrides: Partial<FDraftThemeResolvedPlacement> = {},
): FDraftThemeResolvedPlacement {
  return {
    placementId: "p1",
    coordinateSpace: "page",
    anchor: "top-left",
    offsetX: 0,
    offsetY: 0,
    width: null,
    height: null,
    aspectRatio: null,
    rotation: 0,
    opacity: 1,
    flipX: false,
    flipY: false,
    layer: "mid",
    crop: null,
    interactionId: null,
    assetPath: "/events/halloween/interactives/pumpkin-lit.png",
    ...overrides,
  };
}

describe("anchorEdgeStyle", () => {
  it("pins to the correct edges for each corner anchor", () => {
    expect(anchorEdgeStyle("top-left")).toEqual({ top: 0, left: 0 });
    expect(anchorEdgeStyle("bottom-right")).toEqual({ bottom: 0, right: 0 });
  });

  it("uses 50% for the centered axis", () => {
    expect(anchorEdgeStyle("center")).toEqual({ top: "50%", left: "50%" });
  });
});

describe("placementWrapperStyle", () => {
  it("uses position: fixed for viewport coordinate space, absolute for page", () => {
    expect(
      placementWrapperStyle(placement({ coordinateSpace: "page" })).position,
    ).toBe("absolute");
    expect(
      placementWrapperStyle(placement({ coordinateSpace: "viewport" }))
        .position,
    ).toBe("fixed");
  });

  it("derives height from width/aspectRatio when height is null", () => {
    const style = placementWrapperStyle(
      placement({ width: 10, height: null, aspectRatio: 2 }),
    );
    expect(style.width).toBe("10rem");
    expect(style.height).toBe("5rem");
  });

  it("includes the rotation and flip scale in the transform", () => {
    const style = placementWrapperStyle(
      placement({ rotation: 45, flipX: true, flipY: false }),
    );
    expect(style.transform).toContain("rotate(45deg)");
    expect(style.transform).toContain("scale(-1, 1)");
  });

  it("maps layer to the expected z-index tiers", () => {
    expect(
      placementWrapperStyle(placement({ layer: "background" })).zIndex,
    ).toBe(0);
    expect(placementWrapperStyle(placement({ layer: "mid" })).zIndex).toBe(10);
    expect(
      placementWrapperStyle(placement({ layer: "foreground" })).zIndex,
    ).toBe(20);
  });
});
