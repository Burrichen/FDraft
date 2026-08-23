import { Compass, Radio } from "lucide-react";
import type { ComponentType, ReactNode, SVGProps } from "react";
import type { EventDefinition } from "@/domain/events/event-definition";
import {
  F_YOU_ITS_JANUARY_EVENT_ID,
  HALLOWEEN_EVENT_ID,
  SIGNAL_FROM_BEYOND_EVENT_ID,
  WATCHLIST_FRONTIER_EVENT_ID,
} from "@/domain/events/event-registry";
import { resolveEventVisualThemeId } from "@/domain/events/event-visual-presentation";
import {
  HalloweenNavIcon,
  JanuaryTrashCanNavIcon,
} from "@/components/layout/nav-icons";
import { renderHalloweenDialogDecoration } from "./halloween-dialog-decoration";
import { renderHalloweenIntroContent } from "./halloween-intro-content";

export interface EventVisualTheme {
  /** Widened from `LucideIcon` (same convention `nav-config.ts`'s `NavItem.icon` already uses) — accepts a plain lucide icon or a hand-authored SVG component like `HalloweenNavIcon`, since both are just components over `SVGProps<SVGSVGElement>`. */
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /**
   * Applied by a caller to the root of whatever it's theming — today
   * exclusively `EventIntroDialog`'s `AlertDialogContent` (see
   * `.theme-halloween` in `globals.css`, docs/updates "PROMPT 20"). Any
   * classes the theme's root needs belong here, not just color tokens —
   * see docs/updates, "PROMPT B2.3 — HALLOWEEN JOIN MODAL COMPLETE
   * REDESIGN" §1, which also folds the modal's own (much larger) sizing
   * in. Optional so January/Frontier/Signal's plain icon-only theme is
   * completely unaffected — read generically, no per-event branch added.
   */
  rootClassName?: string;
  /** Applied to `EventIntroDialog`'s own `AlertDialogTitle`, generically — same "optional per-theme override, undefined preserves today's default" convention as `rootClassName` (see docs/updates, "PROMPT B2.3" §2). */
  titleClassName?: string;
  /** Purely decorative content a caller renders alongside its own — see `EventIntroDialog`'s Halloween decoration. Always `aria-hidden` inside the renderer itself. */
  renderDecoration?: () => ReactNode;
  /**
   * Fully replaces `EventIntroDialog`'s generic description + bullets +
   * footer-note body for this event (see docs/updates, "PROMPT B2.3" §3)
   * — lets an event supply genuinely rich, word-level-emphasized copy the
   * plain-string `EventIntroContent.description`/`bullets` shape can't
   * express, without teaching the shared dialog anything about which
   * event it is. Absent for every event that keeps the generic rendering
   * (today: everyone but Halloween).
   */
  renderIntroContent?: () => ReactNode;
}

/**
 * UI-only mapping from an `EventDefinition.visualTheme` id to its actual
 * presentation (see docs/product-spec.md, event system Phase 8) — kept
 * separate from `resolveEventVisualThemeId`
 * (`@/domain/events/event-visual-presentation`) so the domain layer never
 * imports React or an icon library; this file is the only place that
 * does. Any future/removed theme id simply isn't a key here, which every
 * caller treats as a safe "no icon" fallback, never an error.
 *
 * January uses a hand-authored trash can (see docs/updates, "PROMPT B2.1
 * — DUAL DRAFT ARCHITECTURE + EVENT ROUTING/SETTINGS FIXES" §3) — it
 * previously borrowed `lucide-react`'s generic `Snowflake`, which is now
 * DELIBERATELY UNUSED and reserved for a future Christmas Event instead.
 * Do not reuse `Snowflake` for anything else; a Christmas Event isn't
 * implemented yet (no nav tab, no page, no gameplay — see §3's "CHRISTMAS
 * ICON RESERVATION"), but when one is, its icon is already decided.
 */
export const EVENT_VISUAL_THEMES: Record<string, EventVisualTheme> = {
  [F_YOU_ITS_JANUARY_EVENT_ID]: { icon: JanuaryTrashCanNavIcon },
  [WATCHLIST_FRONTIER_EVENT_ID]: { icon: Compass },
  [SIGNAL_FROM_BEYOND_EVENT_ID]: { icon: Radio },
  [HALLOWEEN_EVENT_ID]: {
    icon: HalloweenNavIcon,
    // Roughly 65-80% of the viewport width on larger screens, capped at a
    // sensible maximum (matches the app's own `max-w-2xl` content-column
    // convention) — see docs/updates, "PROMPT B2.3" §1. `max-h-[85vh]` +
    // `overflow-y-auto` keeps the much taller content from ever
    // overflowing the viewport unusably on a short screen.
    rootClassName:
      "theme-halloween w-[92vw] sm:w-[80vw] md:w-[70vw] max-w-2xl max-h-[85vh] overflow-y-auto",
    titleClassName:
      "flex-col items-center justify-center gap-2 text-center text-4xl sm:text-5xl font-extrabold text-halloween-pumpkin [&_svg]:size-9 sm:[&_svg]:size-11",
    renderDecoration: renderHalloweenDialogDecoration,
    renderIntroContent: renderHalloweenIntroContent,
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
