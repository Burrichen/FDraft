import { describe, expect, it } from "vitest";
import { JanuaryTrashCanNavIcon } from "@/components/layout/nav-icons";
import {
  F_YOU_ITS_JANUARY_EVENT_ID,
  HALLOWEEN_EVENT_ID,
} from "@/domain/events/event-registry";
import { EVENT_VISUAL_THEMES } from "./event-visual-themes";
import { JanuaryEndingDecoration } from "./january-ending-decoration";

/**
 * Regression coverage for docs/updates, "PROMPT B2.1 — DUAL DRAFT
 * ARCHITECTURE + EVENT ROUTING/SETTINGS FIXES" §3: January's icon is now
 * a hand-authored trash can, never the generic `lucide-react` Snowflake —
 * which is DELIBERATELY unused and reserved for a future Christmas Event.
 */
describe("EVENT_VISUAL_THEMES — January uses the trash can, not Snowflake", () => {
  it("January's theme icon is exactly JanuaryTrashCanNavIcon", () => {
    expect(EVENT_VISUAL_THEMES[F_YOU_ITS_JANUARY_EVENT_ID]?.icon).toBe(
      JanuaryTrashCanNavIcon,
    );
  });

  it("no registered event theme uses lucide-react's Snowflake icon", () => {
    for (const [eventId, theme] of Object.entries(EVENT_VISUAL_THEMES)) {
      // A named-function identity check: Snowflake's own display/function
      // name is "Snowflake" — every real theme icon here has a different
      // name (JanuaryTrashCanNavIcon, HalloweenNavIcon, Compass, Radio).
      expect(theme.icon.name, `theme for ${eventId}`).not.toBe("Snowflake");
    }
  });
});

/**
 * Covers docs/updates, "FDRAFT UPDATE 1 — JANUARY EVENT-OVER EXPERIENCE"
 * §3/§4 (the ending decoration) and "FDRAFT UPDATE 1 — F* YOU, IT'S
 * JANUARY: SIMPLE EVENT MECHANICS" §13-§15 (the pale icy palette that
 * replaced this event's previously-absent join-modal styling).
 */
describe("EVENT_VISUAL_THEMES — January's icy theme and Event-ending treatment", () => {
  it("has its own ending decoration and modal width", () => {
    const theme = EVENT_VISUAL_THEMES[F_YOU_ITS_JANUARY_EVENT_ID];
    expect(theme?.EndingDecorationComponent).toBe(JanuaryEndingDecoration);
    expect(theme?.endingRootClassName).toBeTruthy();
  });

  it("applies the scoped `theme-january` token reroute to BOTH its join modal and its ending — never a raw colour value", () => {
    const theme = EVENT_VISUAL_THEMES[F_YOU_ITS_JANUARY_EVENT_ID];
    expect(theme?.rootClassName).toContain("theme-january");
    expect(theme?.endingRootClassName).toContain("theme-january");
  });

  it("accents its titles through January's own theme tokens, not a hardcoded hex/oklch value", () => {
    const theme = EVENT_VISUAL_THEMES[F_YOU_ITS_JANUARY_EVENT_ID];
    for (const className of [
      theme?.titleClassName,
      theme?.endingTitleClassName,
    ]) {
      expect(className).toBeTruthy();
      expect(className).toMatch(/text-january-(ice|frost)/);
      // §15: no scattered arbitrary light-blue values anywhere.
      expect(className).not.toMatch(/#[0-9a-f]{3,8}|oklch\(/i);
    }
  });

  it("never reroutes Halloween's palette — the two themes stay isolated", () => {
    const halloween = EVENT_VISUAL_THEMES[HALLOWEEN_EVENT_ID];
    expect(halloween?.rootClassName).not.toContain("theme-january");
    expect(halloween?.endingRootClassName).not.toContain("theme-january");
    expect(
      EVENT_VISUAL_THEMES[F_YOU_ITS_JANUARY_EVENT_ID]?.rootClassName,
    ).not.toContain("theme-halloween");
  });
});
