import { Compass, Radio, Snowflake } from "lucide-react";
import type { ComponentType, ReactNode, SVGProps } from "react";
import type { EventDefinition } from "@/domain/events/event-definition";
import {
  CHRISTMAS_EVENT_ID,
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
import { HalloweenDialogDecoration } from "./halloween-dialog-decoration";
import { HalloweenEndingDecoration } from "./halloween-ending-decoration";
import { renderHalloweenIntroContent } from "./halloween-intro-content";
import { ChristmasEndingDecoration } from "./christmas-ending-decoration";
import { renderChristmasIntroContent } from "./christmas-intro-content";
import { JanuaryEndingDecoration } from "./january-ending-decoration";

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
   * in. Optional so Frontier/Signal's plain icon-only theme is completely
   * unaffected — read generically, no per-event branch added.
   */
  rootClassName?: string;
  /** Applied to `EventIntroDialog`'s own `AlertDialogTitle`, generically — same "optional per-theme override, undefined preserves today's default" convention as `rootClassName` (see docs/updates, "PROMPT B2.3" §2). */
  titleClassName?: string;
  /**
   * A purely decorative component a caller renders alongside its own —
   * see `EventIntroDialog`'s Halloween decoration. A real component
   * (not a plain render-prop function) because Halloween's own
   * decoration now uses the Designed Slot system internally
   * (`EventDecorationLayer`), which calls React hooks — hooks can only
   * ever be called from something React itself recognizes as a
   * component. Always `aria-hidden` inside the component itself.
   */
  DecorationComponent?: ComponentType;
  /**
   * Fully replaces `EventIntroDialog`'s generic description + bullets +
   * footer-note body for this event (see docs/updates, "PROMPT B2.3" §3)
   * — lets an event supply genuinely rich, word-level-emphasized copy the
   * plain-string `EventIntroContent.description`/`bullets` shape can't
   * express, without teaching the shared dialog anything about which
   * event it is. Absent for every event that keeps the generic rendering
   * (today: everyone but Halloween and Christmas).
   *
   * Receives the candidate's own `event` and resolved `occurrenceYear` so
   * a custom body can render the SAME approved `intro.description`/
   * `intro.bullets` strings the generic path would (rather than a
   * hand-copied duplicate that could silently drift out of sync — see
   * `renderChristmasIntroContent`), and can name the year it's greeting.
   * `occurrenceYear` is `null` only for a manual-only event with no
   * occurrence key at all.
   */
  renderIntroContent?: (context: {
    event: EventDefinition;
    occurrenceYear: number | null;
  }) => ReactNode;
  /**
   * The Event-ending dialog's own root class override (see
   * `EventEndingDialog`) — a SEPARATE, optional field from `rootClassName`
   * above so an event can give its ending a deliberately quieter
   * treatment than its join modal (see docs/updates, "EVENT SYSTEM —
   * EVENT-OVER EXPERIENCE" §8: "quieter than the Event introduction").
   * Falls back to `rootClassName` when absent — an event that hasn't
   * defined a distinct ending look yet still gets its normal theme
   * applied, never an unstyled dialog.
   */
  endingRootClassName?: string;
  /** The Event-ending dialog's own title class override — same fallback-to-`titleClassName` convention as `endingRootClassName`. */
  endingTitleClassName?: string;
  /** The Event-ending dialog's own purely decorative component — same contract as `DecorationComponent` above, just for the ending surface instead of the join modal. Absent means no decoration (a plain, undecorated ending — still fully functional, just visually bare, exactly like an undecorated join modal today for Frontier/Signal). */
  EndingDecorationComponent?: ComponentType;
  /**
   * The SECOND ending stage's own root class (see
   * `EventEndingContent.stinger`, docs/updates "FDRAFT UPDATE 1 —
   * CHRISTMAS DRAFT DIFFICULTIES + VISUAL POLISH" §16) — a separate field
   * from `endingRootClassName` specifically so a stinger can step AWAY
   * from its event's theme, which is exactly what Christmas's January
   * sting does. Falls back to `endingRootClassName`, then
   * `rootClassName`, for an event that wants its stinger to look like the
   * rest of its ending.
   */
  endingStingerRootClassName?: string;
  /** The second ending stage's own title class. No fallback — a stinger with no title of its own renders none (see `EventEndingDialog`). */
  endingStingerTitleClassName?: string;
  /** The second ending stage's own message class, layered on top of the shared description styling. */
  endingStingerMessageClassName?: string;
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
 * January's theme is a hand-authored trash can icon plus its own
 * pale-icy-blue token family (see docs/updates, "PROMPT B2.1 — DUAL DRAFT
 * ARCHITECTURE + EVENT ROUTING/SETTINGS FIXES" §3 for the icon, and
 * "FDRAFT UPDATE 1 — F* YOU, IT'S JANUARY: SIMPLE EVENT MECHANICS" §13-§15
 * for the palette). That icon previously borrowed `lucide-react`'s generic
 * `Snowflake`, which is now Christmas's own icon — both for its nav tab
 * (see `use-nav-items.ts`) and, as of docs/updates "FDRAFT UPDATE 1 —
 * CHRISTMAS DRAFT DIFFICULTIES + VISUAL POLISH", for its real visual
 * theme below. That long-standing reservation is now cashed in: Christmas
 * has a cosmetic theme, and `Snowflake` belongs to it alone.
 */
export const EVENT_VISUAL_THEMES: Record<string, EventVisualTheme> = {
  [F_YOU_ITS_JANUARY_EVENT_ID]: {
    icon: JanuaryTrashCanNavIcon,
    // January's own pale icy palette (see `.theme-january`, `globals.css`,
    // and docs/updates "FDRAFT UPDATE 1 — F* YOU, IT'S JANUARY: SIMPLE
    // EVENT MECHANICS" §13-§15). This REPLACES the previous entry's
    // deliberate no-op, which leaned on the app's default `--primary`
    // being "already a cool blue" — that default is FDraft's normal
    // interactive blue everywhere in the app, so it gave January no
    // identity of its own at all. `theme-january` is a token reroute only,
    // so the join modal keeps its ordinary sizing and structure and simply
    // picks up cold winter light — subtle but clear, at Halloween's
    // intensity, never a flood of blue.
    rootClassName: "theme-january w-[92vw] sm:w-[80vw] max-w-lg",
    titleClassName: "text-january-frost",
    // The ending is where January is ALLOWED to brighten (§14: "the clouds
    // part") — the icy accent is on the title itself here, alongside the
    // clouds-parting/soft-sun/rain-fading decoration, rather than the
    // deliberately quieter treatment Halloween's ending uses.
    endingRootClassName: "theme-january w-[92vw] sm:w-[80vw] max-w-lg",
    endingTitleClassName:
      "flex-col items-center justify-center gap-2 text-center text-2xl sm:text-3xl font-semibold text-january-ice",
    EndingDecorationComponent: JanuaryEndingDecoration,
  },
  [CHRISTMAS_EVENT_ID]: {
    // The `Snowflake` reservation, finally cashed in (see the note at the
    // top of this file): Christmas now has a real visual theme, so this is
    // the one and only `visualTheme` that uses that icon.
    icon: Snowflake,
    // JOIN MODAL — full `.theme-christmas` token reroute, so its buttons,
    // focus ring, card ground and borders all pick up the Christmas
    // palette (see docs/updates, "FDRAFT UPDATE 1 — CHRISTMAS DRAFT
    // DIFFICULTIES + VISUAL POLISH" §12). Sized on Halloween's modal as
    // the baseline for hierarchy/spacing, a step below its largest
    // treatment: Christmas's copy is much shorter than Halloween's, so
    // the same huge width would leave it swimming.
    rootClassName:
      "theme-christmas w-[92vw] sm:w-[84vw] md:w-[62vw] max-w-xl max-h-[85vh] overflow-y-auto",
    titleClassName:
      "flex-col items-center justify-center gap-1 text-center text-3xl sm:text-4xl font-extrabold text-christmas-red [&_svg]:size-7 sm:[&_svg]:size-8 [&_svg]:text-christmas-snow",
    // No join-modal decoration, deliberately. A Designed Slot layout for
    // it was built and then removed after looking at it: at the sizes that
    // fit this modal's corners the snowflake cluster read as three stray
    // dots rather than as decoration — exactly the kind of thing §13 warns
    // against. The typography carries Christmas's identity here instead;
    // the ENDING keeps its own (single, larger) decoration.
    renderIntroContent: renderChristmasIntroContent,
    // ENDING — deliberately NOT `.theme-christmas`. §15 requires the
    // "Onto next year!" button to stay standard FDraft theming, and
    // rerouting `--primary` here would repaint it festive. So the ending
    // takes its Christmas identity from explicit `christmas-*` utility
    // classes on the surface/title/body instead, leaving every token the
    // shared `Button` reads at the app's own defaults.
    endingRootClassName:
      "bg-christmas-surface border-christmas-border w-[92vw] sm:w-[80vw] max-w-lg",
    endingTitleClassName:
      "flex-col items-center justify-center gap-2 text-center text-2xl sm:text-3xl font-semibold text-christmas-snow [&_svg]:text-christmas-red",
    EndingDecorationComponent: ChristmasEndingDecoration,
    // STINGER — steps away from Christmas entirely (§16's "you may subtly
    // transition the modal visually away from Christmas"): no Christmas
    // surface, no festive accent, just FDraft's own plain dark dialog with
    // the line delivered flat. The contrast with the modal it follows is
    // the whole joke.
    endingStingerRootClassName: "w-[92vw] sm:w-[70vw] max-w-md",
    endingStingerMessageClassName: "text-center font-semibold",
  },
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
    DecorationComponent: HalloweenDialogDecoration,
    renderIntroContent: renderHalloweenIntroContent,
    // Deliberately quieter than the join modal above (see docs/updates,
    // "EVENT SYSTEM — EVENT-OVER EXPERIENCE" §8: "quieter... chilly...
    // eerie... slightly melancholy") — a smaller, unbolded title in the
    // muted cream/charcoal ends of the palette rather than the join
    // modal's huge bold pumpkin-orange, and no huge width/height jump
    // (this dialog's body is much shorter than the join modal's).
    endingRootClassName: "theme-halloween w-[92vw] sm:w-[80vw] max-w-lg",
    endingTitleClassName:
      "flex-col items-center justify-center gap-2 text-center text-2xl sm:text-3xl font-semibold text-halloween-cream [&_svg]:size-6",
    EndingDecorationComponent: HalloweenEndingDecoration,
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
