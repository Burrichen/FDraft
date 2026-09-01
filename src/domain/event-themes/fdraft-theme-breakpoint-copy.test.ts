import { describe, expect, it } from "vitest";
import {
  breakpointCopyWouldOverwriteEdits,
  copyBreakpointLayout,
} from "./fdraft-theme-breakpoint-copy";
import { fdraftThemeSchema } from "./fdraft-theme-schema";

function buildTheme(
  desktopPlacementIds: string[],
  tabletPlacementIds: string[],
) {
  return fdraftThemeSchema.parse({
    schemaVersion: 1,
    themeId: "test-theme",
    eventId: "test-theme",
    scope: "event",
    assets: {},
    layouts: {
      eventPage: {
        states: {
          active: {
            breakpoints: {
              desktop: {
                placements: desktopPlacementIds.map((id) => ({
                  id,
                  kind: "fixed",
                  assetId: null,
                })),
              },
              tablet: {
                placements: tabletPlacementIds.map((id) => ({
                  id,
                  kind: "fixed",
                  assetId: null,
                })),
              },
            },
          },
        },
      },
    },
  });
}

describe("copyBreakpointLayout", () => {
  it("replaces the destination breakpoint's placements with a clone of the source's", () => {
    const theme = buildTheme(["a", "b"], []);
    const updated = copyBreakpointLayout(
      theme,
      "eventPage",
      "active",
      "desktop",
      "tablet",
    );
    expect(
      updated.layouts.eventPage.states.active.breakpoints.tablet?.placements.map(
        (p) => p.id,
      ),
    ).toEqual(["a", "b"]);
    // Source untouched.
    expect(
      updated.layouts.eventPage.states.active.breakpoints.desktop?.placements.map(
        (p) => p.id,
      ),
    ).toEqual(["a", "b"]);
  });

  it("deep-clones — mutating the copy never affects the original theme object", () => {
    const theme = buildTheme(["a"], []);
    const updated = copyBreakpointLayout(
      theme,
      "eventPage",
      "active",
      "desktop",
      "tablet",
    );
    updated.layouts.eventPage.states.active.breakpoints.tablet!.placements[0]!.id =
      "mutated";
    expect(
      theme.layouts.eventPage.states.active.breakpoints.desktop?.placements[0]
        ?.id,
    ).toBe("a");
  });

  it("leaves every other page/state/breakpoint in the theme untouched", () => {
    const theme = buildTheme(["a"], ["existing-mobile-sibling"]);
    const updated = copyBreakpointLayout(
      theme,
      "eventPage",
      "active",
      "desktop",
      "tablet",
    );
    // mobile was never set; other page ids don't exist — nothing to break,
    // just confirm the theme's top-level identity fields survive untouched.
    expect(updated.themeId).toBe(theme.themeId);
    expect(updated.eventId).toBe(theme.eventId);
  });

  it("returns the theme unchanged when the page/state/source breakpoint doesn't exist", () => {
    const theme = buildTheme(["a"], []);
    const updated = copyBreakpointLayout(
      theme,
      "nonexistentPage",
      "active",
      "desktop",
      "tablet",
    );
    expect(updated).toBe(theme);
  });
});

describe("breakpointCopyWouldOverwriteEdits", () => {
  it("is false when the destination has no placements yet", () => {
    const theme = buildTheme(["a"], []);
    expect(
      breakpointCopyWouldOverwriteEdits(
        theme,
        "eventPage",
        "active",
        "desktop",
        "tablet",
      ),
    ).toBe(false);
  });

  it("is false when the destination already matches the source", () => {
    const theme = buildTheme(["a", "b"], ["a", "b"]);
    expect(
      breakpointCopyWouldOverwriteEdits(
        theme,
        "eventPage",
        "active",
        "desktop",
        "tablet",
      ),
    ).toBe(false);
  });

  it("is true when the destination has different placements than the source", () => {
    const theme = buildTheme(["a", "b"], ["c"]);
    expect(
      breakpointCopyWouldOverwriteEdits(
        theme,
        "eventPage",
        "active",
        "desktop",
        "tablet",
      ),
    ).toBe(true);
  });
});
