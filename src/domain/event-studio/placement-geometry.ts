import type { FDraftThemeAnchor } from "@/domain/event-themes/fdraft-theme-schema";

/**
 * Screen-pixel <-> `.fdraft-theme` rem-unit conversion for the Studio
 * canvas editor (see docs/updates, "EVENT STUDIO — PHASE 4" §5/§7) — every
 * placement geometry field (`offsetX`/`offsetY`/`width`/`height`) is
 * stored in rem (matching this app's existing Designed Slot convention,
 * see `fdraft-theme-schema.ts`), while every pointer/drag gesture reports
 * real screen pixels. `REM_PX` matches this app's actual, unmodified root
 * font-size (`globals.css` sets no `html`/`:root` `font-size` override —
 * confirmed by inspection — so the browser default of 16px holds
 * app-wide); a fixed constant rather than a runtime `getComputedStyle`
 * read keeps every conversion synchronous and trivially testable.
 */
export const REM_PX = 16;

export function pxToRem(px: number): number {
  return px / REM_PX;
}

export function remToPx(rem: number): number {
  return rem * REM_PX;
}

/** A freshly-placed image with no known natural size starts at a modest, clearly-visible default (see §4: "place centred") — large enough to select/grab immediately, small enough not to swallow the whole canvas. */
export const DEFAULT_PLACEMENT_WIDTH_REM = 6;

/** Arrow-key nudge distance (see §12) — a small, precise adjustment. */
export const NUDGE_STEP_REM = pxToRem(1);
/** Shift+Arrow nudge distance — a coarser adjustment for faster positioning. */
export const NUDGE_STEP_LARGE_REM = pxToRem(10);

/** How far a duplicated/pasted placement is offset from its source, in rem, so it never lands exactly on top of (and visually indistinguishable from) the original (see §10: "offset slightly so they remain visible"). */
export const DUPLICATE_OFFSET_REM = 1;

/**
 * Anchor box geometry — the pure math half of `placementWrapperStyle`
 * (`fdraft-theme-placement-css.ts`), moved here (see docs/updates, "EVENT
 * STUDIO — PHASE 5" §9/§11) because Align/Distribute/Snap/Breakpoint-copy
 * all need to convert a placement's anchor+offset into an absolute px
 * box (and back), and this is domain-layer logic with no React/CSS
 * dependency — `fdraft-theme-placement-css.ts` imports `anchorCentering`
 * FROM here rather than keeping its own copy, so there is exactly one
 * definition of "what does this anchor mean," not two that could drift.
 */

/** Whether `anchor` centers horizontally/vertically — used to compute the anchor's own half-shift transform, combined with the placement's explicit offset. */
export function anchorCentering(anchor: FDraftThemeAnchor): {
  centerX: boolean;
  centerY: boolean;
} {
  return {
    centerX:
      anchor === "top-center" ||
      anchor === "center" ||
      anchor === "bottom-center",
    centerY:
      anchor === "left-center" ||
      anchor === "center" ||
      anchor === "right-center",
  };
}

export interface PxBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

function anchorBasePositionPx(
  anchor: FDraftThemeAnchor,
  widthPx: number,
  heightPx: number,
  canvasWidthPx: number,
  canvasHeightPx: number,
): { left: number; top: number } {
  const left = anchor.endsWith("left")
    ? 0
    : anchor.endsWith("right")
      ? canvasWidthPx - widthPx
      : (canvasWidthPx - widthPx) / 2;
  const top = anchor.startsWith("top")
    ? 0
    : anchor.startsWith("bottom")
      ? canvasHeightPx - heightPx
      : (canvasHeightPx - heightPx) / 2;
  return { left, top };
}

/**
 * A placement's absolute on-canvas box in px — the forward half of the
 * anchor/offset <-> absolute-position conversion, matching
 * `placementWrapperStyle`'s CSS byte-for-byte (verified directly against
 * its `top`/`left`/`right`/`bottom` + `translate(calc(...))` technique
 * for every anchor). Used by Align/Distribute (§9), Snap guides (§7),
 * and Safe Area overlap checks (§12) — anywhere the editor needs "where
 * is this thing, really" in one common coordinate space. `width`/
 * `height` in rem should already be FULLY RESOLVED (aspect-ratio-derived
 * height included) by the caller — this function does no derivation of
 * its own.
 */
export function resolvePlacementBoxPx(
  anchor: FDraftThemeAnchor,
  offsetXRem: number,
  offsetYRem: number,
  widthRem: number,
  heightRem: number,
  canvasWidthPx: number,
  canvasHeightPx: number,
): PxBox {
  const width = remToPx(widthRem);
  const height = remToPx(heightRem);
  const base = anchorBasePositionPx(
    anchor,
    width,
    height,
    canvasWidthPx,
    canvasHeightPx,
  );
  return {
    left: base.left + remToPx(offsetXRem),
    top: base.top + remToPx(offsetYRem),
    width,
    height,
  };
}

/**
 * The inverse of `resolvePlacementBoxPx` — given a DESIRED absolute
 * left/top (px) for a placement with a known anchor/size, returns the
 * `offsetX`/`offsetY` (rem) that would produce it. This is what lets
 * Align/Distribute/Snap work uniformly across every anchor: compute the
 * new box in absolute px, then convert back through EACH placement's own
 * anchor, so a right-anchored and a left-anchored object end up with
 * completely different (but each individually correct) offset values for
 * the same visual result.
 */
export function offsetForDesiredBoxPositionPx(
  anchor: FDraftThemeAnchor,
  desiredLeftPx: number,
  desiredTopPx: number,
  widthRem: number,
  heightRem: number,
  canvasWidthPx: number,
  canvasHeightPx: number,
): { offsetX: number; offsetY: number } {
  const width = remToPx(widthRem);
  const height = remToPx(heightRem);
  const base = anchorBasePositionPx(
    anchor,
    width,
    height,
    canvasWidthPx,
    canvasHeightPx,
  );
  return {
    offsetX: pxToRem(desiredLeftPx - base.left),
    offsetY: pxToRem(desiredTopPx - base.top),
  };
}

/**
 * Proportionally rescales a placement's `offsetX`/`offsetY`/`width`/
 * `height` for a DIFFERENT breakpoint's (narrower or wider) canvas —
 * see docs/updates, "EVENT STUDIO — PHASE 5" §11: "translate anchors/
 * offsets sensibly... do not blindly copy 1440px absolute coordinates."
 * The anchor system already makes POSITION portable across breakpoints
 * (a corner/center anchor means the same thing regardless of canvas
 * width) — what genuinely needs translating is MAGNITUDE: a 40rem-wide
 * decoration that reads as modest on a 1440px desktop canvas would
 * swallow most of a 375px mobile one. Scaling both the offset and the
 * size by the destination/source canvas-width ratio keeps a
 * placement's RELATIVE footprint consistent across breakpoints, which is
 * the closest thing to "sensible" a purely generic (asset-agnostic)
 * translation can do — anchor, rotation, opacity, flip, layer, crop
 * (already a normalized 0–1 fraction), and interaction id are all left
 * exactly as they were, since none of those are canvas-width-relative.
 */
export function scaleOffsetAndSizeForBreakpoint(
  offsetXRem: number,
  offsetYRem: number,
  widthRem: number | null,
  heightRem: number | null,
  fromCanvasWidthPx: number,
  toCanvasWidthPx: number,
): {
  offsetX: number;
  offsetY: number;
  width: number | null;
  height: number | null;
} {
  const ratio = toCanvasWidthPx / fromCanvasWidthPx;
  return {
    offsetX: offsetXRem * ratio,
    offsetY: offsetYRem * ratio,
    width: widthRem !== null ? widthRem * ratio : null,
    height: heightRem !== null ? heightRem * ratio : null,
  };
}
