"use client";

import { EventArtImage } from "./event-art-image";
import { placementWrapperStyle } from "./fdraft-theme-placement-css";
import { THEME_INTERACTION_REGISTRY } from "./theme-interaction-registry";
import { THEME_SESSION_SEED } from "./theme-session-seed";
import { useThemeBreakpoint } from "./use-theme-breakpoint";
import {
  resolveFDraftThemeLayout,
  type FDraftThemeResolvedPlacement,
} from "@/domain/event-themes/fdraft-theme-resolve";
import type { FDraftThemeFile } from "@/domain/event-themes/fdraft-theme-schema";
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

/** Exported so the Studio canvas editor (`editable-theme-canvas.tsx`) can reuse the exact same asset/crop/interaction rendering for its own interactive placement boxes — see docs/updates, "EVENT STUDIO — PHASE 4" §7/§8: the editor's WYSIWYG content must never be a second, hand-approximated copy of this. */
export function PlacementContent({
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
