import { describe, expect, it } from "vitest";
import {
  computeAlignedOffsets,
  computeDistributedOffsets,
  type AlignableBox,
} from "./alignment-ops";
import { resolvePlacementBoxPx } from "./placement-geometry";

const CANVAS_W = 1440;
const CANVAS_H = 900;

function box(
  id: string,
  offsetX: number,
  offsetY: number,
  widthRem = 5,
  heightRem = 5,
): AlignableBox {
  return { id, anchor: "top-left", offsetX, offsetY, widthRem, heightRem };
}

describe("computeAlignedOffsets", () => {
  it("Align Left moves every box's left edge to the leftmost one's", () => {
    const items = [box("a", 0, 0), box("b", 10, 0), box("c", 5, 0)];
    const result = computeAlignedOffsets(items, "left", CANVAS_W, CANVAS_H);
    const lefts = items.map(
      (item) =>
        resolvePlacementBoxPx(
          item.anchor,
          result[item.id].offsetX,
          result[item.id].offsetY,
          item.widthRem,
          item.heightRem,
          CANVAS_W,
          CANVAS_H,
        ).left,
    );
    expect(lefts[0]).toBeCloseTo(lefts[1], 5);
    expect(lefts[1]).toBeCloseTo(lefts[2], 5);
  });

  it("Align Right moves every box's right edge to the rightmost one's", () => {
    const items = [box("a", 0, 0, 3), box("b", 10, 0, 5)];
    const result = computeAlignedOffsets(items, "right", CANVAS_W, CANVAS_H);
    const rights = items.map((item) => {
      const b = resolvePlacementBoxPx(
        item.anchor,
        result[item.id].offsetX,
        result[item.id].offsetY,
        item.widthRem,
        item.heightRem,
        CANVAS_W,
        CANVAS_H,
      );
      return b.left + b.width;
    });
    expect(rights[0]).toBeCloseTo(rights[1], 5);
  });

  it("Align Centre (horizontal) centers every box on the group's shared horizontal midpoint", () => {
    const items = [box("a", 0, 0, 4), box("b", 20, 0, 4)];
    const result = computeAlignedOffsets(items, "centerH", CANVAS_W, CANVAS_H);
    const centers = items.map((item) => {
      const b = resolvePlacementBoxPx(
        item.anchor,
        result[item.id].offsetX,
        result[item.id].offsetY,
        item.widthRem,
        item.heightRem,
        CANVAS_W,
        CANVAS_H,
      );
      return b.left + b.width / 2;
    });
    expect(centers[0]).toBeCloseTo(centers[1], 5);
  });

  it("only touches the axis the action targets — Align Left never moves Y", () => {
    const items = [box("a", 0, 3), box("b", 10, 7)];
    const result = computeAlignedOffsets(items, "left", CANVAS_W, CANVAS_H);
    expect(result["a"].offsetY).toBe(3);
    expect(result["b"].offsetY).toBe(7);
  });

  it("different anchors align to the SAME visual position via each anchor's own offset math", () => {
    const items: AlignableBox[] = [
      {
        id: "a",
        anchor: "top-left",
        offsetX: 0,
        offsetY: 0,
        widthRem: 5,
        heightRem: 5,
      },
      {
        id: "b",
        anchor: "top-right",
        offsetX: 0,
        offsetY: 0,
        widthRem: 5,
        heightRem: 5,
      },
    ];
    const result = computeAlignedOffsets(items, "left", CANVAS_W, CANVAS_H);
    const leftA = resolvePlacementBoxPx(
      "top-left",
      result["a"].offsetX,
      result["a"].offsetY,
      5,
      5,
      CANVAS_W,
      CANVAS_H,
    ).left;
    const leftB = resolvePlacementBoxPx(
      "top-right",
      result["b"].offsetX,
      result["b"].offsetY,
      5,
      5,
      CANVAS_W,
      CANVAS_H,
    ).left;
    expect(leftA).toBeCloseTo(leftB, 5);
    // And their raw offsetX values are NOT equal — proof this isn't a
    // naive "set every offsetX to the same number."
    expect(result["a"].offsetX).not.toBeCloseTo(result["b"].offsetX, 2);
  });
});

describe("computeDistributedOffsets", () => {
  it("leaves the first and last (by position) exactly where they are", () => {
    const items = [box("a", 0, 0, 2), box("b", 50, 0, 2), box("c", 100, 0, 2)];
    const result = computeDistributedOffsets(
      items,
      "horizontal",
      CANVAS_W,
      CANVAS_H,
    );
    expect(result["a"].offsetX).toBeCloseTo(0, 5);
    expect(result["c"].offsetX).toBeCloseTo(100, 5);
  });

  it("evenly spaces the gap for the middle item(s)", () => {
    const items = [box("a", 0, 0, 2), box("b", 5, 0, 2), box("c", 100, 0, 2)];
    const result = computeDistributedOffsets(
      items,
      "horizontal",
      CANVAS_W,
      CANVAS_H,
    );
    const boxA = resolvePlacementBoxPx(
      "top-left",
      result["a"].offsetX,
      0,
      2,
      2,
      CANVAS_W,
      CANVAS_H,
    );
    const boxB = resolvePlacementBoxPx(
      "top-left",
      result["b"].offsetX,
      0,
      2,
      2,
      CANVAS_W,
      CANVAS_H,
    );
    const boxC = resolvePlacementBoxPx(
      "top-left",
      result["c"].offsetX,
      0,
      2,
      2,
      CANVAS_W,
      CANVAS_H,
    );
    const gap1 = boxB.left - (boxA.left + boxA.width);
    const gap2 = boxC.left - (boxB.left + boxB.width);
    expect(gap1).toBeCloseTo(gap2, 5);
  });

  it("returns nothing for fewer than 3 items — distribution needs a middle to move", () => {
    const items = [box("a", 0, 0), box("b", 10, 0)];
    expect(
      computeDistributedOffsets(items, "horizontal", CANVAS_W, CANVAS_H),
    ).toEqual({});
  });
});
