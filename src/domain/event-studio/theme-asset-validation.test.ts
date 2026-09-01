import { describe, expect, it, vi } from "vitest";
import {
  formatAssetValidationLine,
  missingRequiredAssets,
  validateThemeAssetsAgainstWorkspace,
} from "./theme-asset-validation";
import { addPlacement, createFixedPlacement } from "./placement-ops";
import { fdraftThemeSchema } from "@/domain/event-themes/fdraft-theme-schema";

const LOC = {
  pageId: "watchlist",
  stateId: "active",
  breakpointId: "desktop" as const,
};

function themeWithAssets(assets: Record<string, string>) {
  const empty = fdraftThemeSchema.parse({
    schemaVersion: 1,
    themeId: "halloween",
    eventId: "halloween",
    scope: "event",
    assets,
    layouts: {},
  });
  return addPlacement(empty, LOC, createFixedPlacement("p1", "ghost-1"));
}

describe("validateThemeAssetsAgainstWorkspace", () => {
  it("returns an empty list for a theme with no required assets", async () => {
    const checkPaths = vi.fn();
    const theme = fdraftThemeSchema.parse({
      schemaVersion: 1,
      themeId: "halloween",
      eventId: "halloween",
      scope: "event",
      assets: {},
      layouts: {},
    });
    expect(
      await validateThemeAssetsAgainstWorkspace(theme, "/repo", checkPaths),
    ).toEqual([]);
    expect(checkPaths).not.toHaveBeenCalled();
  });

  it("checks only assets actually referenced by a placement, not unused registered assets", async () => {
    const checkPaths = vi.fn().mockResolvedValue({
      "events/halloween/interactives/ghost-1.png": true,
    });
    const theme = themeWithAssets({
      "ghost-1": "events/halloween/interactives/ghost-1.png",
      unused: "events/halloween/interactives/unused.png",
    });

    const entries = await validateThemeAssetsAgainstWorkspace(
      theme,
      "/repo",
      checkPaths,
    );

    expect(entries).toEqual([
      {
        assetId: "ghost-1",
        path: "events/halloween/interactives/ghost-1.png",
        present: true,
      },
    ]);
    expect(checkPaths).toHaveBeenCalledWith("/repo", [
      "events/halloween/interactives/ghost-1.png",
    ]);
  });

  it("marks an asset missing when the workspace check reports it absent", async () => {
    const checkPaths = vi.fn().mockResolvedValue({
      "events/halloween/interactives/ghost-1.png": false,
    });
    const theme = themeWithAssets({
      "ghost-1": "events/halloween/interactives/ghost-1.png",
    });

    const entries = await validateThemeAssetsAgainstWorkspace(
      theme,
      "/repo",
      checkPaths,
    );

    expect(entries[0].present).toBe(false);
  });
});

describe("formatAssetValidationLine", () => {
  it("formats a present asset with a check mark and its filename", () => {
    expect(
      formatAssetValidationLine({
        assetId: "ghost-1",
        path: "events/halloween/interactives/ghost-1.png",
        present: true,
      }),
    ).toBe("✓ ghost-1.png");
  });

  it("formats a missing asset with a cross mark and its filename", () => {
    expect(
      formatAssetValidationLine({
        assetId: "missing-cat",
        path: "events/halloween/interactives/missing-cat.png",
        present: false,
      }),
    ).toBe("✕ missing-cat.png");
  });
});

describe("missingRequiredAssets", () => {
  it("returns only the entries that are absent", () => {
    const entries = [
      { assetId: "a", path: "a.png", present: true },
      { assetId: "b", path: "b.png", present: false },
    ];
    expect(missingRequiredAssets(entries).map((e) => e.assetId)).toEqual(["b"]);
  });
});
