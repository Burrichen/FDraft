import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  fdraftThemeSchema,
  parseFDraftThemeText,
} from "@/domain/event-themes/fdraft-theme-schema";
import { resolveFixedPlacement } from "@/domain/event-themes/fdraft-theme-resolve";
import {
  addPlacement,
  createFixedPlacement,
} from "@/domain/event-studio/placement-ops";
import { extractPageScopedTheme } from "@/domain/event-studio/theme-export-scope";
import {
  filterWorkspaceAssetsByFilter,
  getWorkspaceAssetFilters,
  type WorkspaceAssetEntry,
} from "@/domain/event-studio/workspace-asset";

const LOC = {
  pageId: "eventPage",
  stateId: "active",
  breakpointId: "desktop" as const,
};

/**
 * The Portability Test (see docs/updates, "EVENT STUDIO — PHASE 9" §18)
 * — automated as a real, throwaway scratch directory standing in for
 * "a clean project environment containing only tracked/project files"
 * (never writing into THIS repo's own `public/events/`, which would
 * leave a stray fixture behind). Proves the actual claim: once a theme
 * references a project-relative asset path, resolving/rendering it
 * needs NOTHING beyond that one self-contained folder tree — no
 * original source-image location, no FDraft (Dev) local database, no
 * external service.
 */
describe("Project portability (EVENT STUDIO — PHASE 9 §18)", () => {
  it("a theme + its referenced asset are fully self-contained inside one project folder", () => {
    const scratchRoot = mkdtempSync(join(tmpdir(), "fdraft-portability-test-"));
    try {
      // Simulate "Import Image" having already copied the file into the
      // project (the actual copy is a Rust command, tested separately in
      // `src-tauri/src/lib.rs`'s own `copy_event_art_asset_*` tests) —
      // this test's job is proving the RESULT is self-contained, not
      // re-testing the copy mechanism itself.
      const decorationsDir = join(
        scratchRoot,
        "public",
        "events",
        "halloween",
        "decorations",
      );
      mkdirSync(decorationsDir, { recursive: true });
      writeFileSync(join(decorationsDir, "studio-test.png"), "fake-png-bytes");

      const themesDir = join(scratchRoot, "public", "event-themes");
      mkdirSync(themesDir, { recursive: true });

      const empty = fdraftThemeSchema.parse({
        schemaVersion: 1,
        themeId: "halloween",
        eventId: "halloween",
        scope: "event",
        assets: {
          "studio-test": "events/halloween/decorations/studio-test.png",
        },
        layouts: {},
      });
      const withPlacement = addPlacement(
        empty,
        LOC,
        createFixedPlacement("studio-test-1", "studio-test"),
      );

      // "Export theme" — writes the exact bytes a real "Export to FDraft
      // Repo"/`theme:apply` would write, straight to the scratch
      // project's own canonical location.
      writeFileSync(
        join(themesDir, "halloween.fdraft-theme"),
        JSON.stringify(withPlacement, null, 2),
      );

      // --- "simulate a clean project environment" ---
      // Read back ONLY from files under `scratchRoot` from here on —
      // nothing from the real repo, nothing from an original source
      // image path, nothing from any database.
      const exportedText = readFileSync(
        join(themesDir, "halloween.fdraft-theme"),
        "utf-8",
      );

      const parsed = parseFDraftThemeText(exportedText);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;

      const placement =
        parsed.theme.layouts.eventPage!.states.active!.breakpoints.desktop!
          .placements[0]!;
      expect(placement.kind).toBe("fixed");
      const resolved = resolveFixedPlacement(
        parsed.theme,
        placement as Extract<typeof placement, { kind: "fixed" }>,
      );
      expect(resolved?.assetPath).toBe(
        "/events/halloween/decorations/studio-test.png",
      );

      // The resolved path, stripped of its leading slash, resolves to a
      // REAL file inside the scratch project — nowhere else.
      const resolvedFile = join(
        scratchRoot,
        "public",
        resolved!.assetPath!.replace(/^\//, ""),
      );
      expect(existsSync(resolvedFile)).toBe(true);

      // Page-scoped export (what "Export Current Page" produces) is
      // ALSO fully self-contained — same asset, same project-relative
      // path, no wider dependency introduced.
      const scoped = extractPageScopedTheme(parsed.theme, "eventPage");
      expect(Object.values(scoped.assets)).toEqual([
        "events/halloween/decorations/studio-test.png",
      ]);
    } finally {
      rmSync(scratchRoot, { recursive: true, force: true });
    }
  });
});

/**
 * Christmas exercises the exact same asset-workflow machinery Halloween
 * does (see docs/updates, "EVENT STUDIO — PHASE 9" §19) — proven here at
 * the domain layer (the same pure functions the real Asset Browser calls
 * for its Halloween filter already share with Christmas, with zero
 * per-event branching anywhere in this code).
 */
describe("Christmas import workflow parity (EVENT STUDIO — PHASE 9 §19)", () => {
  it("a freshly-imported Christmas asset is picked up by the Christmas filter exactly like Halloween's own", () => {
    const assets: WorkspaceAssetEntry[] = [
      {
        relativePath: "events/halloween/decorations/pumpkin.png",
        eventId: "halloween",
        category: "decorations",
        fileName: "pumpkin.png",
      },
      // The newly "imported" Christmas asset.
      {
        relativePath: "events/christmas/decorations/tinsel.png",
        eventId: "christmas",
        category: "decorations",
        fileName: "tinsel.png",
      },
    ];

    const filters = getWorkspaceAssetFilters(assets);
    const christmasFilter = filters.find((f) => f.label === "Christmas");
    expect(christmasFilter).toBeDefined();

    const christmasOnly = filterWorkspaceAssetsByFilter(
      assets,
      christmasFilter!.id,
    );
    expect(christmasOnly).toEqual([assets[1]]);
  });

  it("builds and validates a Christmas theme referencing the newly imported asset, through the exact same schema Halloween uses", () => {
    const empty = fdraftThemeSchema.parse({
      schemaVersion: 1,
      themeId: "christmas",
      eventId: "christmas",
      scope: "event",
      assets: { tinsel: "events/christmas/decorations/tinsel.png" },
      layouts: {},
    });
    const withPlacement = addPlacement(
      empty,
      LOC,
      createFixedPlacement("tinsel-1", "tinsel"),
    );

    const exported = JSON.stringify(withPlacement);
    const reimported = parseFDraftThemeText(exported);
    expect(reimported.ok).toBe(true);
  });
});
