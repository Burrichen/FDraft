import type { PxBox } from "./placement-geometry";

/**
 * Safe Area overlap warnings (see docs/updates, "EVENT STUDIO — PHASE 5"
 * §12) — a live, Edit-mode-only ADVISORY, never a restriction ("Do NOT
 * forbid it outright") and never exported (this module has no connection
 * to `.fdraft-theme` at all; it only ever computes a warning STRING for
 * the Inspector to render). Zone rectangles here are kept in exact sync
 * with `SafeZoneOverlay` (`studio-page-client.tsx`)'s own drawn regions —
 * same nav-strip/content-column/modal-box geometry, so a warning always
 * matches what the Safe Zones toggle visually shows.
 */

export interface SafeZone {
  id: string;
  label: string;
  box: PxBox;
}

const NAV_HEIGHT_PX = 64;
const CONTENT_MAX_WIDTH_PX = 1152;
const MODAL_WIDTH_PX = 320;
const MODAL_HEIGHT_PX = 256;

/** The three named safe/content zones, sized for one breakpoint's canvas — see `SafeZoneOverlay`'s own Tailwind classes for the pixel values these mirror exactly (`h-16`, `max-w-[1152px]`, `h-64 w-80`). */
export function getSafeZones(
  canvasWidthPx: number,
  canvasHeightPx: number,
): SafeZone[] {
  const contentWidth = Math.min(canvasWidthPx, CONTENT_MAX_WIDTH_PX);
  return [
    {
      id: "nav",
      label: "nav",
      box: { left: 0, top: 0, width: canvasWidthPx, height: NAV_HEIGHT_PX },
    },
    {
      id: "content",
      label: "content",
      box: {
        left: (canvasWidthPx - contentWidth) / 2,
        top: NAV_HEIGHT_PX,
        width: contentWidth,
        height: Math.max(0, canvasHeightPx - NAV_HEIGHT_PX),
      },
    },
    {
      id: "modal",
      label: "film-card content",
      box: {
        left: canvasWidthPx / 2 - MODAL_WIDTH_PX / 2,
        top: canvasHeightPx / 2 - MODAL_HEIGHT_PX / 2,
        width: MODAL_WIDTH_PX,
        height: MODAL_HEIGHT_PX,
      },
    },
  ];
}

function overlapArea(a: PxBox, b: PxBox): number {
  const left = Math.max(a.left, b.left);
  const right = Math.min(a.left + a.width, b.left + b.width);
  const top = Math.max(a.top, b.top);
  const bottom = Math.min(a.top + a.height, b.top + b.height);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

/** A "strong" overlap — more than this fraction of the PLACEMENT's own area sits inside the zone — is what's worth surfacing; a placement merely brushing a zone's edge isn't. */
export const SAFE_ZONE_OVERLAP_WARNING_THRESHOLD = 0.3;

/**
 * Every safe zone `placementBox` strongly overlaps, worded as a ready-
 * to-render warning (§12's own example: "Overlaps film-card content
 * area") — empty when there's nothing worth flagging. A zero-area
 * placement box never triggers a warning (nothing to overlap with).
 */
export function findSafeZoneOverlapWarnings(
  placementBox: PxBox,
  canvasWidthPx: number,
  canvasHeightPx: number,
): string[] {
  const placementArea = placementBox.width * placementBox.height;
  if (placementArea <= 0) {
    return [];
  }
  const zones = getSafeZones(canvasWidthPx, canvasHeightPx);
  const warnings: string[] = [];
  for (const zone of zones) {
    const fraction = overlapArea(placementBox, zone.box) / placementArea;
    if (fraction > SAFE_ZONE_OVERLAP_WARNING_THRESHOLD) {
      warnings.push(`Overlaps ${zone.label} area`);
    }
  }
  return warnings;
}
