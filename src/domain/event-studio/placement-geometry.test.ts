import { describe, expect, it } from "vitest";
import {
  anchorCentering,
  offsetForDesiredBoxPositionPx,
  resolvePlacementBoxPx,
  scaleOffsetAndSizeForBreakpoint,
} from "./placement-geometry";

describe("anchorCentering", () => {
  it("only 'center' and the two -center anchors center on their respective axis", () => {
    expect(anchorCentering("center")).toEqual({ centerX: true, centerY: true });
    expect(anchorCentering("top-center")).toEqual({
      centerX: true,
      centerY: false,
    });
    expect(anchorCentering("left-center")).toEqual({
      centerX: false,
      centerY: true,
    });
    expect(anchorCentering("top-left")).toEqual({
      centerX: false,
      centerY: false,
    });
  });
});

describe("resolvePlacementBoxPx", () => {
  const CANVAS_W = 1440;
  const CANVAS_H = 900;

  it("top-left with zero offset sits at the canvas origin", () => {
    const box = resolvePlacementBoxPx(
      "top-left",
      0,
      0,
      10,
      5,
      CANVAS_W,
      CANVAS_H,
    );
    expect(box).toEqual({ left: 0, top: 0, width: 160, height: 80 });
  });

  it("top-right anchors its own right edge to the canvas's right edge", () => {
    const box = resolvePlacementBoxPx(
      "top-right",
      0,
      0,
      10,
      5,
      CANVAS_W,
      CANVAS_H,
    );
    expect(box.left).toBe(CANVAS_W - 160);
    expect(box.top).toBe(0);
  });

  it("bottom-right anchors both edges", () => {
    const box = resolvePlacementBoxPx(
      "bottom-right",
      0,
      0,
      10,
      5,
      CANVAS_W,
      CANVAS_H,
    );
    expect(box.left).toBe(CANVAS_W - 160);
    expect(box.top).toBe(CANVAS_H - 80);
  });

  it("center anchors to the exact midpoint, minus half its own size", () => {
    const box = resolvePlacementBoxPx(
      "center",
      0,
      0,
      10,
      5,
      CANVAS_W,
      CANVAS_H,
    );
    expect(box.left).toBe((CANVAS_W - 160) / 2);
    expect(box.top).toBe((CANVAS_H - 80) / 2);
  });

  it("offset is applied on top of the anchor's base position, in px (rem * 16)", () => {
    const box = resolvePlacementBoxPx(
      "top-left",
      2,
      3,
      10,
      5,
      CANVAS_W,
      CANVAS_H,
    );
    expect(box.left).toBe(32);
    expect(box.top).toBe(48);
  });

  it("top-center centers horizontally but pins to the top edge vertically", () => {
    const box = resolvePlacementBoxPx(
      "top-center",
      0,
      0,
      10,
      5,
      CANVAS_W,
      CANVAS_H,
    );
    expect(box.left).toBe((CANVAS_W - 160) / 2);
    expect(box.top).toBe(0);
  });
});

describe("offsetForDesiredBoxPositionPx — the exact inverse of resolvePlacementBoxPx", () => {
  it("round-trips for every anchor", () => {
    const anchors = [
      "top-left",
      "top-center",
      "top-right",
      "left-center",
      "center",
      "right-center",
      "bottom-left",
      "bottom-center",
      "bottom-right",
    ] as const;
    for (const anchor of anchors) {
      const original = { offsetX: 3.25, offsetY: -1.5 };
      const box = resolvePlacementBoxPx(
        anchor,
        original.offsetX,
        original.offsetY,
        8,
        4,
        1440,
        900,
      );
      const recovered = offsetForDesiredBoxPositionPx(
        anchor,
        box.left,
        box.top,
        8,
        4,
        1440,
        900,
      );
      expect(recovered.offsetX).toBeCloseTo(original.offsetX, 5);
      expect(recovered.offsetY).toBeCloseTo(original.offsetY, 5);
    }
  });
});

describe("scaleOffsetAndSizeForBreakpoint", () => {
  it("scales offset and size proportionally to the destination canvas width", () => {
    // Desktop (1440) -> Mobile (375): ratio ~0.26.
    const result = scaleOffsetAndSizeForBreakpoint(10, 20, 8, 4, 1440, 375);
    const ratio = 375 / 1440;
    expect(result.offsetX).toBeCloseTo(10 * ratio);
    expect(result.offsetY).toBeCloseTo(20 * ratio);
    expect(result.width).toBeCloseTo(8 * ratio);
    expect(result.height).toBeCloseTo(4 * ratio);
  });

  it("passes null width/height through unchanged", () => {
    const result = scaleOffsetAndSizeForBreakpoint(
      10,
      20,
      null,
      null,
      1440,
      375,
    );
    expect(result.width).toBeNull();
    expect(result.height).toBeNull();
  });

  it("copying to a WIDER breakpoint scales up, not down", () => {
    const result = scaleOffsetAndSizeForBreakpoint(10, 10, 5, 5, 375, 1440);
    expect(result.width!).toBeGreaterThan(5);
  });

  it("same-width copy (ratio 1) is a pure no-op", () => {
    const result = scaleOffsetAndSizeForBreakpoint(10, 10, 5, 5, 768, 768);
    expect(result).toEqual({ offsetX: 10, offsetY: 10, width: 5, height: 5 });
  });
});
