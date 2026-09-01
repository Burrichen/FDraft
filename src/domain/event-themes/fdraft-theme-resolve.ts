import { hashDecorationSeed } from "@/domain/events/event-decoration-slots";
import {
  FDRAFT_THEME_BREAKPOINT_FALLBACK,
  type FDraftThemeAnchor,
  type FDraftThemeBreakpointId,
  type FDraftThemeCoordinateSpace,
  type FDraftThemeCropRect,
  type FDraftThemeFile,
  type FDraftThemeLayer,
  type FDraftThemePlacement,
} from "./fdraft-theme-schema";
import type { FDraftThemeInteractionId } from "./theme-interaction-ids";

/**
 * Turns a validated `FDraftThemeFile` plus "where/when" (page, state,
 * breakpoint) plus a stable seed into the concrete, final list of things
 * to actually draw — the ONE place a weighted placement group is
 * resolved down to a single picked variant (see §6/§7). Pure, no React,
 * no randomness at call time: reuses `hashDecorationSeed` from the
 * EXISTING Designed Slot engine (`event-decoration-slots.ts`) rather than
 * inventing a second hashing scheme, so both systems pick deterministically
 * the exact same way. `EventThemeLayoutRenderer` is the only intended
 * caller; kept here (not co-located with the renderer) so it stays
 * trivially unit-testable without React/DOM at all.
 */

export interface FDraftThemeResolveSeedInputs {
  /** Stable for the lifetime of one app session (see §7); a fresh value each relaunch is what makes "a different valid variation MAY appear" on relaunch, and stability within a session is what makes "same decoration when you navigate back" hold. */
  sessionSeed: string;
  /** `null`/absent for "no active profile yet" — still a valid, stable seed component (mirrors `DecorationSeedInputs.profileId`'s own convention). */
  profileId?: string | null;
}

export interface FDraftThemeResolvedPlacement {
  placementId: string;
  coordinateSpace: FDraftThemeCoordinateSpace;
  anchor: FDraftThemeAnchor;
  offsetX: number;
  offsetY: number;
  width: number | null;
  height: number | null;
  aspectRatio: number | null;
  rotation: number;
  opacity: number;
  flipX: boolean;
  flipY: boolean;
  layer: FDraftThemeLayer;
  crop: FDraftThemeCropRect | null;
  interactionId: FDraftThemeInteractionId | null;
  /** The resolved real, servable path (`/…`) — already looked up through `theme.assets`; `null` means "no backing image" (an interaction-only placement, or a weighted group's picked "nothing" option). */
  assetPath: string | null;
}

function resolveAssetPath(
  theme: FDraftThemeFile,
  assetId: string | null,
): string | null {
  if (assetId === null) {
    return null;
  }
  const relativePath = theme.assets[assetId];
  // Schema validation (`fdraftThemeSchema`'s `superRefine`) already
  // guarantees every referenced assetId exists in `theme.assets` for any
  // theme that passed `parseFDraftThemeText` — this is just a defensive
  // fallback for a hand-built `FDraftThemeFile` a test constructs
  // in-memory without going through the parser.
  return relativePath ? `/${relativePath}` : null;
}

/**
 * Resolves ONE breakpoint's placement list, applying the fallback order
 * (see `FDRAFT_THEME_BREAKPOINT_FALLBACK`) — the first tier in the
 * fallback chain that the state actually defines wins; a state that
 * defines nothing at all for any tier in the chain resolves to an empty
 * layout (nothing to render), never an error.
 */
function resolveBreakpointPlacements(
  theme: FDraftThemeFile,
  pageId: string,
  stateId: string,
  breakpointId: FDraftThemeBreakpointId,
): FDraftThemePlacement[] {
  const page = theme.layouts[pageId];
  const state = page?.states[stateId];
  if (!state) {
    return [];
  }
  for (const tier of FDRAFT_THEME_BREAKPOINT_FALLBACK[breakpointId]) {
    const breakpoint = state.breakpoints[tier];
    if (breakpoint) {
      return breakpoint.placements;
    }
  }
  return [];
}

function buildPlacementSeed(
  seedInputs: FDraftThemeResolveSeedInputs,
  theme: FDraftThemeFile,
  pageId: string,
  stateId: string,
  breakpointId: FDraftThemeBreakpointId,
  placementId: string,
): string {
  return [
    seedInputs.sessionSeed,
    theme.themeId,
    pageId,
    stateId,
    breakpointId,
    seedInputs.profileId ?? "anon",
    placementId,
  ].join(":");
}

/**
 * Deterministically picks one weighted variant — the exact same weighted-
 * bucket algorithm as `pickDecorationVariant` (`event-decoration-slots.
 * ts`), reimplemented directly against `FDraftThemeWeightedVariant`'s own
 * shape rather than importing that function and reshaping data to fit its
 * signature, since the two variant shapes (`DecorationVariantOption` vs
 * this file's `FDraftThemeWeightedVariant`) are similar but not
 * identical. Returns `null` only if every weight is non-positive (nothing
 * valid to pick), which the caller treats exactly like an explicit
 * "nothing" pick.
 */
function pickWeightedVariant<TVariant extends { weight: number }>(
  seed: string,
  variants: readonly TVariant[],
): TVariant | null {
  const totalWeight = variants.reduce(
    (sum, variant) => sum + Math.max(0, variant.weight),
    0,
  );
  if (totalWeight <= 0) {
    return null;
  }
  const target = hashDecorationSeed(seed) % totalWeight;
  let cumulative = 0;
  for (const variant of variants) {
    cumulative += Math.max(0, variant.weight);
    if (target < cumulative) {
      return variant;
    }
  }
  return variants[variants.length - 1] ?? null;
}

/**
 * Resolves an entire page/state/breakpoint's placements at once — the one
 * function `EventThemeLayoutRenderer` actually calls. A placement whose
 * effective content is "nothing" (a weighted pick of `assetId: null` with
 * no `interactionId`, or `visible: false`) is simply absent from the
 * result — a caller iterating the result only ever sees placements that
 * actually have something to render, exactly like
 * `resolveDecorationLayout`'s own convention.
 */
export function resolveFDraftThemeLayout(
  theme: FDraftThemeFile,
  params: {
    pageId: string;
    stateId: string;
    breakpointId: FDraftThemeBreakpointId;
  },
  seedInputs: FDraftThemeResolveSeedInputs,
): FDraftThemeResolvedPlacement[] {
  const placements = resolveBreakpointPlacements(
    theme,
    params.pageId,
    params.stateId,
    params.breakpointId,
  );

  const resolved: FDraftThemeResolvedPlacement[] = [];

  for (const placement of placements) {
    if (!placement.visible) {
      continue;
    }

    if (placement.kind === "fixed") {
      const assetPath = resolveAssetPath(theme, placement.assetId);
      if (assetPath === null && placement.interactionId === null) {
        continue;
      }
      resolved.push({
        placementId: placement.id,
        coordinateSpace: placement.coordinateSpace,
        anchor: placement.anchor,
        offsetX: placement.offsetX,
        offsetY: placement.offsetY,
        width: placement.width,
        height: placement.height,
        aspectRatio: placement.aspectRatio,
        rotation: placement.rotation,
        opacity: placement.opacity,
        flipX: placement.flipX,
        flipY: placement.flipY,
        layer: placement.layer,
        crop: placement.crop,
        interactionId: placement.interactionId,
        assetPath,
      });
      continue;
    }

    // Weighted group.
    const seed = buildPlacementSeed(
      seedInputs,
      theme,
      params.pageId,
      params.stateId,
      params.breakpointId,
      placement.id,
    );
    const picked = pickWeightedVariant(seed, placement.variants);
    if (!picked) {
      continue;
    }
    const assetPath = resolveAssetPath(theme, picked.assetId);
    if (assetPath === null && placement.interactionId === null) {
      continue;
    }
    const width =
      picked.scale !== null && placement.width !== null
        ? placement.width * picked.scale
        : placement.width;
    const height =
      picked.scale !== null && placement.height !== null
        ? placement.height * picked.scale
        : placement.height;
    resolved.push({
      placementId: placement.id,
      coordinateSpace: placement.coordinateSpace,
      anchor: placement.anchor,
      offsetX: placement.offsetX,
      offsetY: placement.offsetY,
      width,
      height,
      aspectRatio: placement.aspectRatio,
      rotation: placement.rotation,
      opacity: picked.opacityOverride ?? placement.opacity,
      flipX: placement.flipX,
      flipY: placement.flipY,
      layer: placement.layer,
      crop: placement.crop,
      interactionId: placement.interactionId,
      assetPath,
    });
  }

  return resolved;
}
