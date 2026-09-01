import { describe, expect, it } from "vitest";
import {
  addPlacement,
  createFixedPlacement,
  duplicatePlacement,
  generateUniquePlacementId,
  getPlacementsAt,
  removePlacement,
  reorderPlacement,
  updatePlacement,
  type PlacementLocation,
} from "./placement-ops";
import { fdraftThemeSchema } from "@/domain/event-themes/fdraft-theme-schema";

const LOC: PlacementLocation = {
  pageId: "eventPage",
  stateId: "active",
  breakpointId: "desktop",
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

function themeWithPlacements(ids: string[]) {
  return fdraftThemeSchema.parse({
    schemaVersion: 1,
    themeId: "test",
    eventId: "test",
    scope: "event",
    assets: {},
    layouts: {
      eventPage: {
        states: {
          active: {
            breakpoints: {
              desktop: {
                placements: ids.map((id) => ({
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

describe("createFixedPlacement", () => {
  it("is centred with a zero offset and a sensible default size", () => {
    const placement = createFixedPlacement("p1", "asset-1");
    expect(placement.kind).toBe("fixed");
    expect(placement.anchor).toBe("center");
    expect(placement.offsetX).toBe(0);
    expect(placement.offsetY).toBe(0);
    expect(placement.width).toBeGreaterThan(0);
    if (placement.kind === "fixed") {
      expect(placement.assetId).toBe("asset-1");
    }
  });
});

describe("addPlacement / getPlacementsAt", () => {
  it("creates every missing intermediate node for a page/state/breakpoint with no layout yet", () => {
    const theme = addPlacement(
      emptyTheme(),
      LOC,
      createFixedPlacement("p1", "a"),
    );
    expect(getPlacementsAt(theme, LOC).map((p) => p.id)).toEqual(["p1"]);
  });

  it("appends to an existing list without disturbing other placements", () => {
    let theme = themeWithPlacements(["a", "b"]);
    theme = addPlacement(theme, LOC, createFixedPlacement("c", null));
    expect(getPlacementsAt(theme, LOC).map((p) => p.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("never mutates the input theme", () => {
    const theme = emptyTheme();
    addPlacement(theme, LOC, createFixedPlacement("p1", "a"));
    expect(getPlacementsAt(theme, LOC)).toEqual([]);
  });
});

describe("updatePlacement", () => {
  it("applies the updater only to the matching placement", () => {
    const theme = themeWithPlacements(["a", "b"]);
    const updated = updatePlacement(theme, LOC, "a", (p) => ({
      ...p,
      offsetX: 5,
    }));
    const placements = getPlacementsAt(updated, LOC);
    expect(placements.find((p) => p.id === "a")?.offsetX).toBe(5);
    expect(placements.find((p) => p.id === "b")?.offsetX).toBe(0);
  });
});

describe("removePlacement", () => {
  it("removes exactly the matching placement", () => {
    const theme = themeWithPlacements(["a", "b", "c"]);
    const updated = removePlacement(theme, LOC, "b");
    expect(getPlacementsAt(updated, LOC).map((p) => p.id)).toEqual(["a", "c"]);
  });
});

describe("duplicatePlacement", () => {
  it("clones with a new id, offset placement, inserted right after the original", () => {
    const theme = themeWithPlacements(["a", "b"]);
    const result = duplicatePlacement(theme, LOC, "a", "a-copy", 1);
    expect(result).not.toBeNull();
    const placements = getPlacementsAt(result!.theme, LOC);
    expect(placements.map((p) => p.id)).toEqual(["a", "a-copy", "b"]);
    const clone = placements[1];
    expect(clone.offsetX).toBe(1);
    expect(clone.offsetY).toBe(1);
  });

  it("returns null for a nonexistent placement id", () => {
    const theme = themeWithPlacements(["a"]);
    expect(duplicatePlacement(theme, LOC, "nonexistent", "x", 1)).toBeNull();
  });
});

describe("reorderPlacement", () => {
  it("forward moves one step later in the array", () => {
    const theme = themeWithPlacements(["a", "b", "c"]);
    const updated = reorderPlacement(theme, LOC, "a", "forward");
    expect(getPlacementsAt(updated, LOC).map((p) => p.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("backward moves one step earlier in the array", () => {
    const theme = themeWithPlacements(["a", "b", "c"]);
    const updated = reorderPlacement(theme, LOC, "c", "backward");
    expect(getPlacementsAt(updated, LOC).map((p) => p.id)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  it("front moves to the very end (top of z-order)", () => {
    const theme = themeWithPlacements(["a", "b", "c"]);
    const updated = reorderPlacement(theme, LOC, "a", "front");
    expect(getPlacementsAt(updated, LOC).map((p) => p.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("back moves to the very start (bottom of z-order)", () => {
    const theme = themeWithPlacements(["a", "b", "c"]);
    const updated = reorderPlacement(theme, LOC, "c", "back");
    expect(getPlacementsAt(updated, LOC).map((p) => p.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("forward/back are clamped at the array's own edges — a no-op past the boundary", () => {
    const theme = themeWithPlacements(["a", "b"]);
    const updated = reorderPlacement(theme, LOC, "b", "forward");
    expect(getPlacementsAt(updated, LOC).map((p) => p.id)).toEqual(["a", "b"]);
  });
});

describe("generateUniquePlacementId", () => {
  it("returns the base id unchanged when it's free", () => {
    expect(generateUniquePlacementId([], "pumpkin")).toBe("pumpkin");
  });

  it("appends a numeric suffix, incrementing until free", () => {
    expect(generateUniquePlacementId(["pumpkin", "pumpkin-2"], "pumpkin")).toBe(
      "pumpkin-3",
    );
  });
});
