import { describe, expect, it } from "vitest";
import {
  resetBreakpointToCanonical,
  resetEntireThemeToCanonical,
  resetPageToCanonical,
} from "./theme-reset-scope";
import { addPlacement, createFixedPlacement } from "./placement-ops";
import { fdraftThemeSchema } from "@/domain/event-themes/fdraft-theme-schema";

const LOC = {
  pageId: "watchlist",
  stateId: "active",
  breakpointId: "desktop" as const,
};

function emptyTheme(themeId = "halloween") {
  return fdraftThemeSchema.parse({
    schemaVersion: 1,
    themeId,
    eventId: "halloween",
    scope: "event",
    assets: {},
    layouts: {},
  });
}

describe("resetPageToCanonical", () => {
  it("replaces the edited page's layout with the canonical one", () => {
    const canonical = addPlacement(
      emptyTheme(),
      LOC,
      createFixedPlacement("canonical-1", "ghost"),
    );
    let edited = addPlacement(
      emptyTheme(),
      LOC,
      createFixedPlacement("edited-1", "moved-ghost"),
    );
    edited = { ...edited, themeId: "halloween-edited" };

    const reset = resetPageToCanonical(edited, canonical, "watchlist");

    expect(
      reset.layouts.watchlist.states.active.breakpoints.desktop!.placements.map(
        (p) => p.id,
      ),
    ).toEqual(["canonical-1"]);
  });

  it("leaves every other page untouched", () => {
    const otherLoc = { ...LOC, pageId: "drafts" };
    const canonical = emptyTheme();
    let edited = addPlacement(
      emptyTheme(),
      LOC,
      createFixedPlacement("watchlist-1", "ghost"),
    );
    edited = addPlacement(
      edited,
      otherLoc,
      createFixedPlacement("drafts-1", "bat"),
    );

    const reset = resetPageToCanonical(edited, canonical, "watchlist");

    expect(
      Object.keys(reset.layouts.drafts.states.active.breakpoints),
    ).toContain("desktop");
  });

  it("removes the page entirely if the canonical theme never had it", () => {
    const canonical = emptyTheme();
    const edited = addPlacement(
      emptyTheme(),
      LOC,
      createFixedPlacement("edited-1", "ghost"),
    );

    const reset = resetPageToCanonical(edited, canonical, "watchlist");

    expect(reset.layouts.watchlist).toBeUndefined();
  });
});

describe("resetBreakpointToCanonical", () => {
  it("replaces only the given breakpoint, leaving sibling breakpoints alone", () => {
    const canonical = addPlacement(
      emptyTheme(),
      LOC,
      createFixedPlacement("canonical-desktop", "ghost"),
    );
    let edited = addPlacement(
      emptyTheme(),
      LOC,
      createFixedPlacement("edited-desktop", "moved-ghost"),
    );
    edited = addPlacement(
      edited,
      { ...LOC, breakpointId: "mobile" },
      createFixedPlacement("edited-mobile", "bat"),
    );

    const reset = resetBreakpointToCanonical(
      edited,
      canonical,
      "watchlist",
      "active",
      "desktop",
    );

    expect(
      reset.layouts.watchlist.states.active.breakpoints.desktop!.placements.map(
        (p) => p.id,
      ),
    ).toEqual(["canonical-desktop"]);
    expect(
      reset.layouts.watchlist.states.active.breakpoints.mobile!.placements.map(
        (p) => p.id,
      ),
    ).toEqual(["edited-mobile"]);
  });

  it("removes the breakpoint entirely if the canonical theme has no such breakpoint", () => {
    const canonical = emptyTheme();
    const edited = addPlacement(
      emptyTheme(),
      LOC,
      createFixedPlacement("edited-1", "ghost"),
    );

    const reset = resetBreakpointToCanonical(
      edited,
      canonical,
      "watchlist",
      "active",
      "desktop",
    );

    expect(
      reset.layouts.watchlist.states.active.breakpoints.desktop,
    ).toBeUndefined();
  });
});

describe("resetEntireThemeToCanonical", () => {
  it("returns the canonical theme in full", () => {
    const canonical = addPlacement(
      emptyTheme(),
      LOC,
      createFixedPlacement("canonical-1", "ghost"),
    );
    expect(resetEntireThemeToCanonical(canonical)).toBe(canonical);
  });
});
