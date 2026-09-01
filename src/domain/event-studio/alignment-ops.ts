import {
  offsetForDesiredBoxPositionPx,
  resolvePlacementBoxPx,
} from "./placement-geometry";
import type { FDraftThemeAnchor } from "@/domain/event-themes/fdraft-theme-schema";

/**
 * Align/Distribute (see docs/updates, "EVENT STUDIO — PHASE 5" §9) — pure
 * functions over a minimal geometry projection of the selected
 * placements, never the placements themselves, so callers (single
 * objects, or every member of a multi-select/group) can reuse the exact
 * same math. Every result goes through `resolvePlacementBoxPx`/
 * `offsetForDesiredBoxPositionPx` (`placement-geometry.ts`) — the SAME
 * anchor-aware conversion the canvas itself renders with, so aligning a
 * left-anchored and a right-anchored object together produces correct,
 * individually-different `offsetX` results for each, never a naive
 * "set them all to the same offset."
 */
export interface AlignableBox {
  id: string;
  anchor: FDraftThemeAnchor;
  offsetX: number;
  offsetY: number;
  /** Fully resolved (aspect-ratio-derived height already applied) — never `null`; the caller resolves that once, up front. */
  widthRem: number;
  heightRem: number;
}

export type AlignAction =
  "left" | "centerH" | "right" | "top" | "middleV" | "bottom";

export type PlacementOffset = { offsetX: number; offsetY: number };

/**
 * Aligns every box in `items` against the group's own overall bounding
 * box (§9: Align Left/Centre/Right/Top/Middle/Bottom) — meaningful for 2+
 * items; a single item has nothing to align against, so callers should
 * gate the UI on `items.length >= 2` rather than relying on this to no-op
 * gracefully (it would just align the one item to itself).
 */
export function computeAlignedOffsets(
  items: readonly AlignableBox[],
  action: AlignAction,
  canvasWidthPx: number,
  canvasHeightPx: number,
): Record<string, PlacementOffset> {
  const boxes = items.map((item) => ({
    item,
    box: resolvePlacementBoxPx(
      item.anchor,
      item.offsetX,
      item.offsetY,
      item.widthRem,
      item.heightRem,
      canvasWidthPx,
      canvasHeightPx,
    ),
  }));

  const minLeft = Math.min(...boxes.map((b) => b.box.left));
  const maxRight = Math.max(...boxes.map((b) => b.box.left + b.box.width));
  const minTop = Math.min(...boxes.map((b) => b.box.top));
  const maxBottom = Math.max(...boxes.map((b) => b.box.top + b.box.height));
  const centerX = (minLeft + maxRight) / 2;
  const centerY = (minTop + maxBottom) / 2;

  const result: Record<string, PlacementOffset> = {};
  for (const { item, box } of boxes) {
    let desiredLeft = box.left;
    let desiredTop = box.top;
    switch (action) {
      case "left":
        desiredLeft = minLeft;
        break;
      case "right":
        desiredLeft = maxRight - box.width;
        break;
      case "centerH":
        desiredLeft = centerX - box.width / 2;
        break;
      case "top":
        desiredTop = minTop;
        break;
      case "bottom":
        desiredTop = maxBottom - box.height;
        break;
      case "middleV":
        desiredTop = centerY - box.height / 2;
        break;
    }
    result[item.id] = offsetForDesiredBoxPositionPx(
      item.anchor,
      desiredLeft,
      desiredTop,
      item.widthRem,
      item.heightRem,
      canvasWidthPx,
      canvasHeightPx,
    );
  }
  return result;
}

export type DistributeAction = "horizontal" | "vertical";

/**
 * Evenly spaces the GAPS between 3+ boxes along one axis (§9: "Distribute
 * Horizontally/Vertically") — the first and last (by current position)
 * stay exactly where they are; only the ones between them move, to
 * whatever position makes every gap equal. Needs at least 3 items to be
 * meaningful (2 items have only one gap, nothing to "distribute" against)
 * — returns an empty result for fewer, rather than silently no-op-moving
 * them.
 */
export function computeDistributedOffsets(
  items: readonly AlignableBox[],
  action: DistributeAction,
  canvasWidthPx: number,
  canvasHeightPx: number,
): Record<string, PlacementOffset> {
  if (items.length < 3) {
    return {};
  }

  const boxes = items.map((item) => ({
    item,
    box: resolvePlacementBoxPx(
      item.anchor,
      item.offsetX,
      item.offsetY,
      item.widthRem,
      item.heightRem,
      canvasWidthPx,
      canvasHeightPx,
    ),
  }));

  const sorted = [...boxes].sort((a, b) =>
    action === "horizontal" ? a.box.left - b.box.left : a.box.top - b.box.top,
  );
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const totalSpan =
    action === "horizontal"
      ? last.box.left + last.box.width - first.box.left
      : last.box.top + last.box.height - first.box.top;
  const totalSize = sorted.reduce(
    (sum, entry) =>
      sum + (action === "horizontal" ? entry.box.width : entry.box.height),
    0,
  );
  const gap = (totalSpan - totalSize) / (sorted.length - 1);

  const result: Record<string, PlacementOffset> = {};
  let cursor = action === "horizontal" ? first.box.left : first.box.top;
  for (const entry of sorted) {
    const desiredLeft = action === "horizontal" ? cursor : entry.box.left;
    const desiredTop = action === "vertical" ? cursor : entry.box.top;
    result[entry.item.id] = offsetForDesiredBoxPositionPx(
      entry.item.anchor,
      desiredLeft,
      desiredTop,
      entry.item.widthRem,
      entry.item.heightRem,
      canvasWidthPx,
      canvasHeightPx,
    );
    cursor +=
      (action === "horizontal" ? entry.box.width : entry.box.height) + gap;
  }
  return result;
}
