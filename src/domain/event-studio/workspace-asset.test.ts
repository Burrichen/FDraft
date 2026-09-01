import { describe, expect, it } from "vitest";
import {
  filterWorkspaceAssetsByFilter,
  friendlyAssetName,
  getWorkspaceAssetFilters,
  searchWorkspaceAssetsByFilename,
  WORKSPACE_ASSET_ALL_FILTER_ID,
  WORKSPACE_ASSET_COMMON_EVENT_ID,
  type WorkspaceAssetEntry,
} from "./workspace-asset";

function asset(overrides: Partial<WorkspaceAssetEntry>): WorkspaceAssetEntry {
  return {
    relativePath: "events/halloween/interactives/pumpkin-lit.png",
    eventId: "halloween",
    category: "interactives",
    fileName: "pumpkin-lit.png",
    ...overrides,
  };
}

const HALLOWEEN_ASSET = asset({});
const CHRISTMAS_ASSET = asset({
  relativePath: "events/christmas/decorations/lights.svg",
  eventId: "christmas",
  category: "decorations",
  fileName: "lights.svg",
});
const COMMON_ASSET = asset({
  relativePath: "events/common/icons/star.svg",
  eventId: "common",
  category: "icons",
  fileName: "star.svg",
});

describe("getWorkspaceAssetFilters", () => {
  it("always includes All and Default/Common, plus one entry per discovered event id", () => {
    const filters = getWorkspaceAssetFilters([
      HALLOWEEN_ASSET,
      CHRISTMAS_ASSET,
      COMMON_ASSET,
    ]);
    expect(filters.map((f) => f.id)).toEqual([
      "all",
      "common",
      "christmas",
      "halloween",
    ]);
  });

  it("includes All and Default/Common even with zero assets scanned yet", () => {
    const filters = getWorkspaceAssetFilters([]);
    expect(filters.map((f) => f.id)).toEqual(["all", "common"]);
  });

  it("generates a future event's filter automatically from its folder alone", () => {
    const filters = getWorkspaceAssetFilters([
      asset({
        eventId: "sci-fi-summer",
        relativePath: "events/sci-fi-summer/icons/rocket.png",
      }),
    ]);
    expect(filters.map((f) => f.id)).toContain("sci-fi-summer");
  });
});

describe("filterWorkspaceAssetsByFilter", () => {
  const all = [HALLOWEEN_ASSET, CHRISTMAS_ASSET, COMMON_ASSET];

  it("'all' returns every asset", () => {
    expect(
      filterWorkspaceAssetsByFilter(all, WORKSPACE_ASSET_ALL_FILTER_ID),
    ).toHaveLength(3);
  });

  it("'common' returns only shared assets", () => {
    expect(
      filterWorkspaceAssetsByFilter(all, WORKSPACE_ASSET_COMMON_EVENT_ID),
    ).toEqual([COMMON_ASSET]);
  });

  it("a specific event filter shows only that event's assets plus common ones", () => {
    const result = filterWorkspaceAssetsByFilter(all, "halloween");
    expect(result).toContain(HALLOWEEN_ASSET);
    expect(result).toContain(COMMON_ASSET);
    expect(result).not.toContain(CHRISTMAS_ASSET);
  });
});

describe("searchWorkspaceAssetsByFilename", () => {
  const all = [HALLOWEEN_ASSET, CHRISTMAS_ASSET];

  it("matches case-insensitively by substring", () => {
    expect(searchWorkspaceAssetsByFilename(all, "PUMPKIN")).toEqual([
      HALLOWEEN_ASSET,
    ]);
  });

  it("an empty query returns everything unchanged", () => {
    expect(searchWorkspaceAssetsByFilename(all, "  ")).toEqual(all);
  });

  it("no matches returns an empty list", () => {
    expect(searchWorkspaceAssetsByFilename(all, "nonexistent")).toEqual([]);
  });
});

describe("friendlyAssetName", () => {
  it("strips the extension and replaces separators with spaces", () => {
    expect(friendlyAssetName("pumpkin-lit.png")).toBe("pumpkin lit");
    expect(friendlyAssetName("candy_bowl_full.webp")).toBe("candy bowl full");
  });
});
