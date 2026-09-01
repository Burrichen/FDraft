import { describe, expect, it } from "vitest";
import {
  copyPlacementsToBreakpoint,
  otherBreakpoints,
  placementCopyWouldOverwriteExisting,
} from "./placement-breakpoint-copy";
import {
  addPlacement,
  createFixedPlacement,
  getPlacementsAt,
} from "./placement-ops";
import { fdraftThemeSchema } from "@/domain/event-themes/fdraft-theme-schema";

const LOC = {
  pageId: "eventPage",
  stateId: "active",
  breakpointId: "desktop" as const,
};

function emptyTheme() {
  return fdraftThemeSchema.parse({
    schemaVersion: 1,
    themeId: "test",
    eventId: "test",
    scope: "event",
    assets: {},
    layouts: {},
  });
}

describe("otherBreakpoints", () => {
  it("returns the two breakpoints besides the given one", () => {
    expect(otherBreakpoints("desktop").sort()).toEqual(["mobile", "tablet"]);
    expect(otherBreakpoints("mobile").sort()).toEqual(["desktop", "tablet"]);
  });
});

describe("copyPlacementsToBreakpoint", () => {
  it("copies a placement into a breakpoint with no existing entry for it", () => {
    let theme = emptyTheme();
    theme = addPlacement(theme, LOC, {
      ...createFixedPlacement("p1", "a"),
      offsetX: 10,
      width: 8,
    });
    const updated = copyPlacementsToBreakpoint(theme, LOC, ["p1"], "mobile");
    const mobilePlacements = getPlacementsAt(updated, {
      ...LOC,
      breakpointId: "mobile",
    });
    expect(mobilePlacements).toHaveLength(1);
    expect(mobilePlacements[0].id).toBe("p1");
  });

  it("scales offset/width down for a narrower target breakpoint — never a blind 1:1 copy", () => {
    let theme = emptyTheme();
    theme = addPlacement(theme, LOC, {
      ...createFixedPlacement("p1", "a"),
      offsetX: 10,
      width: 8,
    });
    const updated = copyPlacementsToBreakpoint(theme, LOC, ["p1"], "mobile");
    const [mobilePlacement] = getPlacementsAt(updated, {
      ...LOC,
      breakpointId: "mobile",
    });
    expect(mobilePlacement.offsetX).toBeLessThan(10);
    expect(mobilePlacement.width!).toBeLessThan(8);
  });

  it("REPLACES (not duplicates) an existing same-id placement in the target", () => {
    let theme = emptyTheme();
    theme = addPlacement(theme, LOC, createFixedPlacement("p1", "a"));
    theme = addPlacement(
      theme,
      { ...LOC, breakpointId: "tablet" },
      {
        ...createFixedPlacement("p1", "old-asset"),
      },
    );
    const updated = copyPlacementsToBreakpoint(theme, LOC, ["p1"], "tablet");
    const tabletPlacements = getPlacementsAt(updated, {
      ...LOC,
      breakpointId: "tablet",
    });
    expect(tabletPlacements).toHaveLength(1);
    expect(
      tabletPlacements[0].kind === "fixed" && tabletPlacements[0].assetId,
    ).toBe("a");
  });

  it("copies every id in a multi-id (group) request", () => {
    let theme = emptyTheme();
    theme = addPlacement(theme, LOC, createFixedPlacement("p1", "a"));
    theme = addPlacement(theme, LOC, createFixedPlacement("p2", "b"));
    const updated = copyPlacementsToBreakpoint(
      theme,
      LOC,
      ["p1", "p2"],
      "tablet",
    );
    const tabletPlacements = getPlacementsAt(updated, {
      ...LOC,
      breakpointId: "tablet",
    });
    expect(tabletPlacements.map((p) => p.id).sort()).toEqual(["p1", "p2"]);
  });

  it("is a no-op copying a breakpoint to itself", () => {
    let theme = emptyTheme();
    theme = addPlacement(theme, LOC, createFixedPlacement("p1", "a"));
    const updated = copyPlacementsToBreakpoint(theme, LOC, ["p1"], "desktop");
    expect(updated).toBe(theme);
  });
});

describe("placementCopyWouldOverwriteExisting", () => {
  it("is false when the target has no existing entry", () => {
    let theme = emptyTheme();
    theme = addPlacement(theme, LOC, createFixedPlacement("p1", "a"));
    expect(
      placementCopyWouldOverwriteExisting(theme, LOC, ["p1"], "tablet"),
    ).toBe(false);
  });

  it("is true when the target already has a DIFFERENT same-id placement", () => {
    let theme = emptyTheme();
    theme = addPlacement(theme, LOC, createFixedPlacement("p1", "a"));
    theme = addPlacement(
      theme,
      { ...LOC, breakpointId: "tablet" },
      {
        ...createFixedPlacement("p1", "different-asset"),
      },
    );
    expect(
      placementCopyWouldOverwriteExisting(theme, LOC, ["p1"], "tablet"),
    ).toBe(true);
  });
});
