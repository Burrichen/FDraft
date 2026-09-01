import { describe, expect, it } from "vitest";
import {
  collectAssetIdsForLayouts,
  remapAssetIdsInPageLayout,
} from "./theme-asset-refs";
import {
  addPlacement,
  createFixedPlacement,
  updatePlacement,
} from "./placement-ops";
import {
  addVariantOption,
  convertToVariantGroup,
  createVariantOption,
} from "./variant-group-ops";
import { fdraftThemeSchema } from "@/domain/event-themes/fdraft-theme-schema";
import type { FDraftThemePlacement } from "@/domain/event-themes/fdraft-theme-schema";

type FixedPlacement = Extract<FDraftThemePlacement, { kind: "fixed" }>;

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

describe("collectAssetIdsForLayouts", () => {
  it("returns an empty set for a theme with no placements", () => {
    expect(collectAssetIdsForLayouts(emptyTheme().layouts)).toEqual(new Set());
  });

  it("collects a fixed placement's assetId", () => {
    let theme = emptyTheme();
    theme = addPlacement(theme, LOC, createFixedPlacement("p1", "ghost"));
    expect(collectAssetIdsForLayouts(theme.layouts)).toEqual(
      new Set(["ghost"]),
    );
  });

  it("skips a fixed placement with a null assetId (Nothing is valid, not an asset)", () => {
    let theme = emptyTheme();
    theme = addPlacement(theme, LOC, {
      ...createFixedPlacement("p1", "ghost"),
      assetId: null,
    });
    expect(collectAssetIdsForLayouts(theme.layouts)).toEqual(new Set());
  });

  it("collects every variant's assetId in a weighted placement", () => {
    let theme = emptyTheme();
    theme = addPlacement(theme, LOC, createFixedPlacement("p1", "ghost"));
    theme = updatePlacement(theme, LOC, "p1", (placement) => {
      const weighted = convertToVariantGroup(placement as FixedPlacement);
      return addVariantOption(
        weighted,
        createVariantOption([weighted.variants[0].id], "pumpkin", "pumpkin"),
      );
    });
    const ids = collectAssetIdsForLayouts(theme.layouts);
    expect(ids.has("ghost")).toBe(true);
    expect(ids.has("pumpkin")).toBe(true);
  });
});

describe("remapAssetIdsInPageLayout", () => {
  it("rewrites a fixed placement's assetId per the remap", () => {
    let theme = emptyTheme();
    theme = addPlacement(theme, LOC, createFixedPlacement("p1", "ghost"));
    const remapped = remapAssetIdsInPageLayout(
      theme.layouts[LOC.pageId],
      new Map([["ghost", "ghost-2"]]),
    );
    const placement =
      remapped.states[LOC.stateId].breakpoints[LOC.breakpointId]!.placements[0];
    expect(placement.kind === "fixed" && placement.assetId).toBe("ghost-2");
  });

  it("leaves an assetId untouched when it has no entry in the remap", () => {
    let theme = emptyTheme();
    theme = addPlacement(theme, LOC, createFixedPlacement("p1", "ghost"));
    const remapped = remapAssetIdsInPageLayout(
      theme.layouts[LOC.pageId],
      new Map(),
    );
    const placement =
      remapped.states[LOC.stateId].breakpoints[LOC.breakpointId]!.placements[0];
    expect(placement.kind === "fixed" && placement.assetId).toBe("ghost");
  });

  it("rewrites every variant's assetId in a weighted placement", () => {
    let theme = emptyTheme();
    theme = addPlacement(theme, LOC, createFixedPlacement("p1", "ghost"));
    theme = updatePlacement(theme, LOC, "p1", (placement) => {
      const weighted = convertToVariantGroup(placement as FixedPlacement);
      return addVariantOption(
        weighted,
        createVariantOption([weighted.variants[0].id], "pumpkin", "pumpkin"),
      );
    });
    const remapped = remapAssetIdsInPageLayout(
      theme.layouts[LOC.pageId],
      new Map([
        ["ghost", "ghost-2"],
        ["pumpkin", "pumpkin-2"],
      ]),
    );
    const placement =
      remapped.states[LOC.stateId].breakpoints[LOC.breakpointId]!.placements[0];
    expect(
      placement.kind === "weighted" && placement.variants.map((v) => v.assetId),
    ).toEqual(["ghost-2", "pumpkin-2"]);
  });
});
