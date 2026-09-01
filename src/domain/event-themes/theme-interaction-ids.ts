/**
 * The complete allowlist of interaction ids a `.fdraft-theme` file may
 * reference (see docs/updates, "EVENT STUDIO — PHASE 1" §8) — a theme
 * file NEVER contains executable code; an `interactionId` is only ever a
 * plain string key into this fixed list, resolved by the components layer
 * (`theme-interaction-registry.tsx`) into one of FDraft's own already-
 * built interactive components. `fdraft-theme-schema.ts` validates every
 * placement's `interactionId` against this SAME list at parse time — an
 * id that isn't here is REJECTED, never silently ignored, so a malformed
 * or malicious theme file fails loudly during validation rather than
 * rendering unpredictably (or not at all) at the last possible moment.
 *
 * Adding a new interaction (a future event's own easter egg) means adding
 * its id here AND registering a component for it in
 * `theme-interaction-registry.tsx` — the two are always kept in exact
 * 1:1 correspondence; there is no third place either could drift from.
 */
export const FDRAFT_THEME_INTERACTION_IDS = [
  "halloween-pumpkin",
  "halloween-gravestone",
  "halloween-candy-bowl",
] as const;

export type FDraftThemeInteractionId =
  (typeof FDRAFT_THEME_INTERACTION_IDS)[number];

export function isFDraftThemeInteractionId(
  value: string,
): value is FDraftThemeInteractionId {
  return (FDRAFT_THEME_INTERACTION_IDS as readonly string[]).includes(value);
}
