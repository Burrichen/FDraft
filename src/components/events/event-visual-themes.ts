import { Compass, Radio, Snowflake, type LucideIcon } from "lucide-react";
import type { EventDefinition } from "@/domain/events/event-definition";
import {
  F_YOU_ITS_JANUARY_EVENT_ID,
  SIGNAL_FROM_BEYOND_EVENT_ID,
  WATCHLIST_FRONTIER_EVENT_ID,
} from "@/domain/events/event-registry";
import { resolveEventVisualThemeId } from "@/domain/events/event-visual-presentation";

export interface EventVisualTheme {
  /** A `lucide-react` icon already bundled with the app — no custom artwork or new dependency. */
  icon: LucideIcon;
}

/**
 * UI-only mapping from an `EventDefinition.visualTheme` id to its actual
 * presentation (see docs/product-spec.md, event system Phase 8) — kept
 * separate from `resolveEventVisualThemeId`
 * (`@/domain/events/event-visual-presentation`) so the domain layer never
 * imports React or an icon library; this file is the only place that
 * does. Covers exactly the three currently-implemented events this phase
 * asks for — Halloween has no entry (its own `visualTheme` is `null`
 * anyway, since it has no real content yet either) and any future/removed
 * theme id simply isn't a key here, which `EventPresentationBadge` treats
 * as a safe "no icon" fallback, never an error.
 */
export const EVENT_VISUAL_THEMES: Record<string, EventVisualTheme> = {
  [F_YOU_ITS_JANUARY_EVENT_ID]: { icon: Snowflake },
  [WATCHLIST_FRONTIER_EVENT_ID]: { icon: Compass },
  [SIGNAL_FROM_BEYOND_EVENT_ID]: { icon: Radio },
};

/**
 * The one place a component turns "this event, with visuals in this
 * state" into its resolved theme (or nothing) — shared by every themed UI
 * surface (`EventPresentationBadge`, `EventIntroDialog`) so none of them
 * duplicates the `resolveEventVisualThemeId` + lookup pairing themselves.
 * Returns the theme object itself, not just its icon, so callers render
 * `<theme.icon />` — a member expression, not a locally-bound capitalized
 * variable — which keeps a plain static icon lookup from tripping
 * `react-hooks/static-components`' "component created during render"
 * check (a false positive here: nothing is ever created, only selected
 * from this always-static map).
 */
export function resolveEventTheme(
  event: Pick<EventDefinition, "visualTheme">,
  eventVisualsEnabled: boolean,
): EventVisualTheme | undefined {
  const themeId = resolveEventVisualThemeId({ event, eventVisualsEnabled });
  return themeId ? EVENT_VISUAL_THEMES[themeId] : undefined;
}
