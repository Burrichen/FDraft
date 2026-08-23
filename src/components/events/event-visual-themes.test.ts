import { describe, expect, it } from "vitest";
import { JanuaryTrashCanNavIcon } from "@/components/layout/nav-icons";
import { F_YOU_ITS_JANUARY_EVENT_ID } from "@/domain/events/event-registry";
import { EVENT_VISUAL_THEMES } from "./event-visual-themes";

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
