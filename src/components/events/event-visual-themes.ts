import { Compass, Radio, Snowflake } from "lucide-react";
import type { ComponentType, ReactNode, SVGProps } from "react";
import type { EventDefinition } from "@/domain/events/event-definition";
import {
  F_YOU_ITS_JANUARY_EVENT_ID,
  HALLOWEEN_EVENT_ID,
  SIGNAL_FROM_BEYOND_EVENT_ID,
  WATCHLIST_FRONTIER_EVENT_ID,
} from "@/domain/events/event-registry";
import { resolveEventVisualThemeId } from "@/domain/events/event-visual-presentation";
import { HalloweenNavIcon } from "@/components/layout/nav-icons";
import { renderHalloweenDialogDecoration } from "./halloween-dialog-decoration";

export interface EventVisualTheme {
  /** Widened from `LucideIcon` (same convention `nav-config.ts`'s `NavItem.icon` already uses) — accepts a plain lucide icon or a hand-authored SVG component like `HalloweenNavIcon`, since both are just components over `SVGProps<SVGSVGElement>`. */
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /**
   * Applied by a caller to the root of whatever it's theming (dialog
   * content, page wrapper) — see `.theme-halloween` in `globals.css` (see
   * docs/updates, "PROMPT 20 — HIGH-EFFORT HALLOWEEN UI"). Optional so
   * January/Frontier/Signal's plain icon-only theme is completely
   * unaffected — `EventIntroDialog`/`EventPresentationBadge` read this
   * generically, no per-event branch added to either.
   */
  rootClassName?: string;
  /** Purely decorative content a caller renders alongside its own — see `EventIntroDialog`'s Halloween decoration. Always `aria-hidden` inside the renderer itself. */
  renderDecoration?: () => ReactNode;
}

/**
 * UI-only mapping from an `EventDefinition.visualTheme` id to its actual
 * presentation (see docs/product-spec.md, event system Phase 8) — kept
 * separate from `resolveEventVisualThemeId`
 * (`@/domain/events/event-visual-presentation`) so the domain layer never
 * imports React or an icon library; this file is the only place that
 * does. Any future/removed theme id simply isn't a key here, which every
 * caller treats as a safe "no icon" fallback, never an error.
 */
export const EVENT_VISUAL_THEMES: Record<string, EventVisualTheme> = {
  [F_YOU_ITS_JANUARY_EVENT_ID]: { icon: Snowflake },
  [WATCHLIST_FRONTIER_EVENT_ID]: { icon: Compass },
  [SIGNAL_FROM_BEYOND_EVENT_ID]: { icon: Radio },
  [HALLOWEEN_EVENT_ID]: {
    icon: HalloweenNavIcon,
    rootClassName: "theme-halloween",
    renderDecoration: renderHalloweenDialogDecoration,
  },
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

/**
 * The presentation-theme lookup for a one-time introductory surface (see
 * `EventIntroDialog`'s decoration, docs/updates "PROMPT 20 — HIGH-EFFORT
 * HALLOWEEN UI") — deliberately UNGATED by `EventSettings.
 * eventVisualsEnabled`, unlike `resolveEventTheme`. That flag governs
 * ongoing/ambient theming for an event a profile has already opted into;
 * the opt-in modal's own decoration is a first impression shown BEFORE
 * any opt-in exists, so gating it on a setting from a prior, unrelated
 * event would routinely (and wrongly) hide it for a profile that has
 * never opted into anything yet.
 */
export function resolveEventPresentationTheme(
  event: Pick<EventDefinition, "visualTheme">,
): EventVisualTheme | undefined {
  return event.visualTheme ? EVENT_VISUAL_THEMES[event.visualTheme] : undefined;
}
