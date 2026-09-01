import { describe, expect, it } from "vitest";
import {
  findAssetReferences,
  formatAssetReference,
} from "./theme-asset-references";
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

const WATCHLIST_DESKTOP = {
  pageId: "watchlist",
  stateId: "populated",
  breakpointId: "desktop" as const,
};
const EVENT_PAGE_ACTIVE = {
  pageId: "eventPage",
  stateId: "active",
  breakpointId: "desktop" as const,
};
const INTRO_MODAL = {
  pageId: "introModal",
  stateId: "default",
  breakpointId: "desktop" as const,
};

function emptyTheme() {
  return fdraftThemeSchema.parse({
    schemaVersion: 1,
    themeId: "halloween",
    eventId: "halloween",
    scope: "event",
    assets: { ghost: "events/halloween/interactives/ghost.png" },
    layouts: {},
  });
}

describe("findAssetReferences (EVENT STUDIO — PHASE 9 §14)", () => {
  it("returns an empty list for an asset that is never referenced", () => {
    const theme = emptyTheme();
    expect(findAssetReferences(theme, "ghost")).toEqual([]);
  });

  it("finds a single fixed-placement reference", () => {
    let theme = emptyTheme();
    theme = addPlacement(
      theme,
      WATCHLIST_DESKTOP,
      createFixedPlacement("p1", "ghost"),
    );

    const refs = findAssetReferences(theme, "ghost");

    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      pageId: "watchlist",
      pageLabel: "Watchlist",
      stateId: "populated",
      stateLabel: "Populated",
      breakpointId: "desktop",
      breakpointLabel: "Desktop",
      placementId: "p1",
    });
  });

  it("finds every reference across multiple pages/states/breakpoints, including modal pages", () => {
    let theme = emptyTheme();
    theme = addPlacement(
      theme,
      WATCHLIST_DESKTOP,
      createFixedPlacement("p1", "ghost"),
    );
    theme = addPlacement(
      theme,
      EVENT_PAGE_ACTIVE,
      createFixedPlacement("p2", "ghost"),
    );
    theme = addPlacement(
      theme,
      INTRO_MODAL,
      createFixedPlacement("p3", "ghost", null, "viewport"),
    );
    // A placement referencing a DIFFERENT asset must not show up.
    theme = addPlacement(
      theme,
      { ...WATCHLIST_DESKTOP, stateId: "empty" },
      createFixedPlacement("p4", "some-other-asset"),
    );

    const refs = findAssetReferences(theme, "ghost");

    expect(refs).toHaveLength(3);
    expect(refs.map((r) => r.placementId).sort()).toEqual(["p1", "p2", "p3"]);
  });

  it("finds a reference inside a weighted variant group, not just fixed placements", () => {
    let theme = emptyTheme();
    theme = addPlacement(
      theme,
      WATCHLIST_DESKTOP,
      createFixedPlacement("p1", "other"),
    );
    theme = updatePlacement(theme, WATCHLIST_DESKTOP, "p1", (placement) => {
      const weighted = convertToVariantGroup(placement as FixedPlacement);
      return addVariantOption(
        weighted,
        createVariantOption([weighted.variants[0].id], "ghost", "ghost"),
      );
    });

    const refs = findAssetReferences(theme, "ghost");

    expect(refs).toHaveLength(1);
    expect(refs[0]?.placementId).toBe("p1");
  });

  it("never matches a null assetId (Nothing is not a reference to anything)", () => {
    let theme = emptyTheme();
    theme = addPlacement(theme, WATCHLIST_DESKTOP, {
      ...createFixedPlacement("p1", "ghost"),
      assetId: null,
    });

    expect(findAssetReferences(theme, "ghost")).toEqual([]);
  });
});

describe("formatAssetReference", () => {
  it("formats as Page → State → Breakpoint", () => {
    expect(
      formatAssetReference({
        pageId: "watchlist",
        pageLabel: "Watchlist",
        stateId: "populated",
        stateLabel: "Populated",
        breakpointId: "desktop",
        breakpointLabel: "Desktop",
        placementId: "p1",
      }),
    ).toBe("Watchlist → Populated → Desktop");
  });
});
