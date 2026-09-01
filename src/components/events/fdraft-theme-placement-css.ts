import type { CSSProperties } from "react";
import { anchorCentering } from "@/domain/event-studio/placement-geometry";
import type { FDraftThemeResolvedPlacement } from "@/domain/event-themes/fdraft-theme-resolve";
import type {
  FDraftThemeAnchor,
  FDraftThemeLayer,
} from "@/domain/event-themes/fdraft-theme-schema";

/**
 * The exact positioning CSS `EventThemeLayoutRenderer` paints a resolved
 * placement with — extracted here (see docs/updates, "EVENT STUDIO —
 * PHASE 4" §7/§14) so the Studio canvas editor's OWN interactive
 * placement targets can be given the byte-for-byte identical box the
 * production renderer would draw, rather than a second, hand-approximated
 * copy of this math that could quietly drift from it. `EventThemeLayoutRenderer`
 * itself imports this — it is the one definition, not a parallel one.
 */

export const LAYER_Z_INDEX: Record<FDraftThemeLayer, number> = {
  background: 0,
  mid: 10,
  foreground: 20,
};

export function anchorEdgeStyle(anchor: FDraftThemeAnchor): CSSProperties {
  const style: CSSProperties = {};
  if (anchor.startsWith("top")) {
    style.top = 0;
  } else if (anchor.startsWith("bottom")) {
    style.bottom = 0;
  } else {
    // left-center / center / right-center
    style.top = "50%";
  }
  if (anchor.endsWith("left")) {
    style.left = 0;
  } else if (anchor.endsWith("right")) {
    style.right = 0;
  } else {
    // top-center / center / bottom-center
    style.left = "50%";
  }
  return style;
}

export function placementWrapperStyle(
  placement: FDraftThemeResolvedPlacement,
): CSSProperties {
  const { centerX, centerY } = anchorCentering(placement.anchor);
  const translateX = `calc(${centerX ? "-50%" : "0%"} + ${placement.offsetX}rem)`;
  const translateY = `calc(${centerY ? "-50%" : "0%"} + ${placement.offsetY}rem)`;
  const scaleX = placement.flipX ? -1 : 1;
  const scaleY = placement.flipY ? -1 : 1;

  const height =
    placement.height !== null
      ? placement.height
      : placement.width !== null && placement.aspectRatio !== null
        ? placement.width / placement.aspectRatio
        : null;

  return {
    position: placement.coordinateSpace === "viewport" ? "fixed" : "absolute",
    ...anchorEdgeStyle(placement.anchor),
    width: placement.width !== null ? `${placement.width}rem` : undefined,
    height: height !== null ? `${height}rem` : undefined,
    opacity: placement.opacity,
    zIndex: LAYER_Z_INDEX[placement.layer],
    transform: `translate(${translateX}, ${translateY}) rotate(${placement.rotation}deg) scale(${scaleX}, ${scaleY})`,
  };
}
