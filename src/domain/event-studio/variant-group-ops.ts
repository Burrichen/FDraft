import { generateUniquePlacementId } from "./placement-ops";
import type {
  FDraftThemePlacement,
  FDraftThemeWeightedVariant,
} from "@/domain/event-themes/fdraft-theme-schema";

type FixedPlacement = Extract<FDraftThemePlacement, { kind: "fixed" }>;
type WeightedPlacement = Extract<FDraftThemePlacement, { kind: "weighted" }>;

/**
 * FIXED vs WEIGHTED VARIANT placement conversion and variant-option
 * editing (see docs/updates, "EVENT STUDIO — PHASE 5" §1/§2) — every
 * function here is pure and operates on a single placement object,
 * mirroring `placement-ops.ts`'s own convention; `StudioPageClient`
 * threads the result through `updatePlacement`/`undoableTheme.commit`
 * exactly like every other edit.
 */

/**
 * Converts a selected FIXED placement into a WEIGHTED VARIANT GROUP (§1)
 * — every shared layout property (anchor/offset/size/rotation/opacity/
 * crop/layer/coordinateSpace/interactionId) carries over UNCHANGED, since
 * those live on the placement's shared base, not on `kind`/`assetId`
 * (see `placementBaseSchema`). The placement's OWN current asset becomes
 * the group's first, full-weight (100) option — converting never loses
 * what was already there; the user can add more options or replace this
 * one from the Variant Editor afterward.
 */
export function convertToVariantGroup(
  placement: FixedPlacement,
): WeightedPlacement {
  const { assetId, ...shared } = placement;
  return {
    ...shared,
    kind: "weighted",
    variants: [
      {
        id: generateUniquePlacementId([], assetId ?? "option-1"),
        assetId,
        weight: 100,
        scale: null,
        opacityOverride: null,
        offsetXAdjustment: 0,
        offsetYAdjustment: 0,
        rotationAdjustment: 0,
      },
    ],
  };
}

/** A fresh, empty-weight variant option — added via the Variant Editor's "add asset option" (or "add Nothing") action, never requiring the caller to hand-type an id or path. */
export function createVariantOption(
  existingIds: readonly string[],
  assetId: string | null,
  baseName: string,
): FDraftThemeWeightedVariant {
  return {
    id: generateUniquePlacementId(existingIds, baseName),
    assetId,
    weight: 20,
    scale: null,
    opacityOverride: null,
    offsetXAdjustment: 0,
    offsetYAdjustment: 0,
    rotationAdjustment: 0,
  };
}

export function addVariantOption(
  placement: WeightedPlacement,
  option: FDraftThemeWeightedVariant,
): WeightedPlacement {
  return { ...placement, variants: [...placement.variants, option] };
}

export function removeVariantOption(
  placement: WeightedPlacement,
  optionId: string,
): WeightedPlacement {
  return {
    ...placement,
    variants: placement.variants.filter((variant) => variant.id !== optionId),
  };
}

export function updateVariantOption(
  placement: WeightedPlacement,
  optionId: string,
  updater: (variant: FDraftThemeWeightedVariant) => FDraftThemeWeightedVariant,
): WeightedPlacement {
  return {
    ...placement,
    variants: placement.variants.map((variant) =>
      variant.id === optionId ? updater(variant) : variant,
    ),
  };
}

export type VariantReorderDirection = "up" | "down";

/** Reorders options within the group — purely cosmetic (variant array order has no effect on which one gets picked, only on Variant Editor list order), offered "if useful" per §2. */
export function reorderVariantOption(
  placement: WeightedPlacement,
  optionId: string,
  direction: VariantReorderDirection,
): WeightedPlacement {
  const variants = placement.variants;
  const index = variants.findIndex((variant) => variant.id === optionId);
  if (index === -1) return placement;
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= variants.length) return placement;
  const next = [...variants];
  [next[index], next[swapWith]] = [next[swapWith]!, next[index]!];
  return { ...placement, variants: next };
}

export interface VariantPercentage {
  optionId: string;
  /** 0–100, rounded to the nearest whole percent for display — see §1: "the UI should display understandable percentages" even when weights don't literally sum to 100. Every non-zero-total group's percentages sum to exactly 100 (rounding remainder absorbed by the largest share, the standard "largest remainder" technique) so a reader never sees e.g. 33/33/33 = 99. */
  percentage: number;
}

/**
 * Normalizes arbitrary (possibly non-100-summing) weights into whole-
 * percent display values (§1) — matches production's own normalization
 * (`pickWeightedVariant` treats weights as relative shares of their own
 * total, exactly like this), so what the Variant Editor shows is what
 * actually governs the real odds, never a separately-massaged number.
 */
export function computeVariantPercentages(
  variants: readonly FDraftThemeWeightedVariant[],
): VariantPercentage[] {
  const total = variants.reduce(
    (sum, variant) => sum + Math.max(0, variant.weight),
    0,
  );
  if (total <= 0) {
    return variants.map((variant) => ({ optionId: variant.id, percentage: 0 }));
  }

  const raw = variants.map(
    (variant) => (Math.max(0, variant.weight) / total) * 100,
  );
  const floored = raw.map(Math.floor);
  let remainder = 100 - floored.reduce((sum, value) => sum + value, 0);

  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);

  const percentages = [...floored];
  for (const { index } of order) {
    if (remainder <= 0) break;
    percentages[index]! += 1;
    remainder -= 1;
  }

  return variants.map((variant, index) => ({
    optionId: variant.id,
    percentage: percentages[index]!,
  }));
}
