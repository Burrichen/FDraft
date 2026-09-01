import { describe, expect, it } from "vitest";
import {
  STUDIO_BREAKPOINTS,
  STUDIO_PAGES,
  getStudioBreakpoint,
  getStudioPage,
} from "./studio-pages";

describe("studio-pages registry", () => {
  it("every page declares at least one state", () => {
    for (const page of STUDIO_PAGES) {
      expect(page.states.length).toBeGreaterThan(0);
    }
  });

  it("only Event Page and the two dialog pseudo-pages require an Event preset", () => {
    const requiring = STUDIO_PAGES.filter(
      (page) => page.requiresEventPreset,
    ).map((page) => page.id);
    expect(requiring.sort()).toEqual(
      ["endingModal", "eventPage", "introModal"].sort(),
    );
  });

  it("getStudioPage finds a real page and returns undefined for an unknown id", () => {
    expect(getStudioPage("watchlist")?.label).toBe("Watchlist");
    expect(getStudioPage("nonexistent")).toBeUndefined();
  });

  it("getStudioBreakpoint falls back to the first breakpoint for an unknown id", () => {
    expect(getStudioBreakpoint("tablet").width).toBe(768);
    expect(getStudioBreakpoint("nonexistent")).toBe(STUDIO_BREAKPOINTS[0]);
  });

  it("declares exactly the three canonical breakpoints, matching .fdraft-theme's own ids", () => {
    expect(STUDIO_BREAKPOINTS.map((b) => b.id)).toEqual([
      "desktop",
      "tablet",
      "mobile",
    ]);
  });
});
