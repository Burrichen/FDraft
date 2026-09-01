"use client";

import type { CSSProperties } from "react";
import { EventArtImage } from "./event-art-image";
import { THEME_INTERACTION_REGISTRY } from "./theme-interaction-registry";
import { THEME_SESSION_SEED } from "./theme-session-seed";
import { useThemeBreakpoint } from "./use-theme-breakpoint";
import {
  resolveFDraftThemeLayout,
  type FDraftThemeResolvedPlacement,
} from "@/domain/event-themes/fdraft-theme-resolve";
import type {
  FDraftThemeAnchor,
  FDraftThemeFile,
  FDraftThemeLayer,
} from "@/domain/event-themes/fdraft-theme-schema";
import { cn } from "@/lib/utils";

/**
 * THE authoritative production `.fdraft-theme` renderer (see
 * docs/updates, "EVENT STUDIO — PHASE 1" §10) — the ONE place a validated
 * `FDraftThemeFile` ever becomes pixels. Normal Beta uses this directly;
 * the future FDraft (Dev) Preview Mode is required to use this SAME
 * component (not a second, hand-approximated renderer) so "what Dev
 * Preview shows" and "what Beta renders" can never independently drift —
 * see that section's own "do not create one renderer now and let Dev
 * later implement a separate approximate renderer."
 *
 * READ-ONLY (§11): this component has no drag handles, resize handles,
 * layer panel, crop controls, or any editing affordance whatsoever — it
 * only ever calls `resolveFDraftThemeLayout` (pure data) and paints the
 * result. There is no code path anywhere in this file that could mutate
 * a theme.
 *
 * Every rendered piece is `aria-hidden`/`pointer-events-none` UNLESS it
 * carries a registered `interactionId`, in which case the registered
 * component (which already manages its own accessibility) renders
 * directly — mirroring the existing `EventDecorationLayer`'s own
 * convention.
 */
export interface EventThemeLayoutRendererProps {
  theme: FDraftThemeFile;
  pageId: string;
  stateId: string;
  /** `null`/absent for "no active profile yet" — forwarded straight into the resolver's seed inputs. */
  profileId?: string | null;
  className?: string;
}

const LAYER_Z_INDEX: Record<FDraftThemeLayer, number> = {
  background: 0,
  mid: 10,
  foreground: 20,
};

/** Whether `anchor` centers horizontally/vertically — used to compute the anchor's own half-shift transform, combined with the placement's explicit offset below. */
function anchorCentering(anchor: FDraftThemeAnchor): {
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

function anchorEdgeStyle(anchor: FDraftThemeAnchor): CSSProperties {
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

function placementWrapperStyle(
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

/**
 * Non-destructive crop (§5) via the standard normalized scale-and-offset
 * technique — an outer box sized to the FINAL (cropped) dimensions with
 * `overflow: hidden`, and the actual image rendered larger and shifted
 * inside it, both expressed as percentages of the crop rect so this works
 * regardless of the container's actual pixel size. The source file itself
 * is never touched; this is purely a rendering transform.
 */
function CroppedImage({
  src,
  crop,
}: {
  src: string;
  crop: { x: number; y: number; width: number; height: number };
}) {
  return (
    <div className="size-full overflow-hidden">
      <EventArtImage
        src={src}
        className="absolute max-w-none"
        style={{
          width: `${100 / crop.width}%`,
          height: `${100 / crop.height}%`,
          left: `${(-100 * crop.x) / crop.width}%`,
          top: `${(-100 * crop.y) / crop.height}%`,
        }}
      />
    </div>
  );
}

function PlacementContent({
  placement,
}: {
  placement: FDraftThemeResolvedPlacement;
}) {
  if (placement.interactionId) {
    const Interaction = THEME_INTERACTION_REGISTRY[placement.interactionId];
    return <Interaction />;
  }
  if (!placement.assetPath) {
    return null;
  }
  if (placement.crop) {
    return <CroppedImage src={placement.assetPath} crop={placement.crop} />;
  }
  return <EventArtImage src={placement.assetPath} className="size-full" />;
}

export function EventThemeLayoutRenderer({
  theme,
  pageId,
  stateId,
  profileId = null,
  className,
}: EventThemeLayoutRendererProps) {
  const breakpointId = useThemeBreakpoint();
  const placements = resolveFDraftThemeLayout(
    theme,
    { pageId, stateId, breakpointId },
    { sessionSeed: THEME_SESSION_SEED, profileId },
  );

  return (
    <div
      className={cn("pointer-events-none absolute inset-0", className)}
      data-fdraft-theme-id={theme.themeId}
      data-fdraft-theme-page={pageId}
      data-fdraft-theme-state={stateId}
      data-fdraft-theme-breakpoint={breakpointId}
    >
      {placements.map((placement) => (
        <div
          key={placement.placementId}
          aria-hidden={placement.interactionId ? undefined : "true"}
          className={cn(
            placement.interactionId ? "pointer-events-auto" : undefined,
          )}
          style={placementWrapperStyle(placement)}
          data-fdraft-placement-id={placement.placementId}
        >
          <PlacementContent placement={placement} />
        </div>
      ))}
    </div>
  );
}
