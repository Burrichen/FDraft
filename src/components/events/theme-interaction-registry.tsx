import type { ComponentType } from "react";
import { HalloweenCandyBowl } from "./halloween-candy-bowl";
import { HalloweenGravestone } from "./halloween-gravestone";
import { HalloweenPumpkin } from "./halloween-pumpkin";
import {
  FDRAFT_THEME_INTERACTION_IDS,
  type FDraftThemeInteractionId,
} from "@/domain/event-themes/theme-interaction-ids";

/**
 * The components-layer half of the interaction allowlist (see
 * docs/updates, "EVENT STUDIO — PHASE 1" §8) — maps each id in
 * `theme-interaction-ids.ts`'s fixed list to one of FDraft's own already-
 * built, self-contained interactive components (each already manages its
 * own state/accessibility/persistence; a theme placement referencing one
 * renders it exactly as-is, with zero extra props). `EventThemeLayoutRenderer`
 * is the ONLY consumer — a theme file can never reach a component that
 * isn't listed here, and this map can never contain an id the schema
 * itself wouldn't also accept, since both read from the SAME
 * `FDRAFT_THEME_INTERACTION_IDS` source list (enforced by the
 * `satisfies` below — this file fails to compile if the two ever drift).
 */
export const THEME_INTERACTION_REGISTRY: Record<
  FDraftThemeInteractionId,
  ComponentType
> = {
  "halloween-pumpkin": HalloweenPumpkin,
  "halloween-gravestone": HalloweenGravestone,
  "halloween-candy-bowl": HalloweenCandyBowl,
} satisfies Record<
  (typeof FDRAFT_THEME_INTERACTION_IDS)[number],
  ComponentType
>;
