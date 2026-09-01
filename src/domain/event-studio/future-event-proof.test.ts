import { describe, expect, it } from "vitest";
import {
  fdraftThemeSchema,
  parseFDraftThemeText,
} from "@/domain/event-themes/fdraft-theme-schema";
import { getWorkspaceAssetFilters } from "@/domain/event-studio/workspace-asset";
import { extractPageScopedTheme } from "@/domain/event-studio/theme-export-scope";
import {
  addPlacement,
  createFixedPlacement,
} from "@/domain/event-studio/placement-ops";
import { getEventStudioPresets } from "@/components/events/event-studio-presets";
import { registerEventArt } from "@/components/events/event-art-registry";
import { parseEventArtPack } from "@/domain/events/event-art-pack";

const FUTURE_EVENT_ID = "carnival";

/**
 * The "Future Event Proof" (EVENT STUDIO — PHASE 7 §9) — registers a
 * brand-new, never-before-seen event id (never mentioned anywhere else
 * in this codebase, deliberately not Halloween/January/Christmas/
 * Frontier/Signal) purely through the same generic registration surface
 * a real future event would use, then exercises the Studio pipeline
 * against it with ZERO Studio code changes — proving `layouts`/`states`/
 * `assets`/`themeId`/`eventId` really are free-form, not a closed set
 * this codebase secretly assumes.
 */
describe("Future Event Proof — a brand-new event id needs zero Studio changes (EVENT STUDIO — PHASE 7 §9)", () => {
  it("registers into the shared Event Art API exactly like any real event, with no Studio-specific hook", () => {
    expect(() =>
      registerEventArt({
        eventId: FUTURE_EVENT_ID,
        displayName: "Carnival",
        artPack: parseEventArtPack({
          eventId: FUTURE_EVENT_ID,
          displayName: "Carnival",
          icons: {},
          decorations: {},
          modal: {},
          interactives: { "ferris-wheel": "interactives/ferris-wheel.png" },
          backgrounds: {},
        }),
      }),
    ).not.toThrow();
  });

  it("automatically appears in Event Studio's own preset list once registered", () => {
    registerEventArt({
      eventId: FUTURE_EVENT_ID,
      displayName: "Carnival",
      artPack: parseEventArtPack({
        eventId: FUTURE_EVENT_ID,
        displayName: "Carnival",
        icons: {},
        decorations: {},
        modal: {},
        interactives: {},
        backgrounds: {},
      }),
    });
    const presets = getEventStudioPresets();
    expect(presets.some((preset) => preset.id === FUTURE_EVENT_ID)).toBe(true);
  });

  it("the Asset Browser's event filter labels a brand-new event id sensibly, with no hardcoded map entry required", () => {
    const filters = getWorkspaceAssetFilters([
      {
        relativePath: `events/${FUTURE_EVENT_ID}/interactives/ferris-wheel.png`,
        eventId: FUTURE_EVENT_ID,
        category: "interactives",
        fileName: "ferris-wheel.png",
      },
    ]);
    const filter = filters.find((f) => f.id === FUTURE_EVENT_ID);
    expect(filter?.label).toBe("Carnival");
  });

  it("builds, validates, and exports a full theme file for the new event through the exact shared schema/pipeline", () => {
    const empty = fdraftThemeSchema.parse({
      schemaVersion: 1,
      themeId: FUTURE_EVENT_ID,
      eventId: FUTURE_EVENT_ID,
      scope: "event",
      assets: {
        "ferris-wheel": `events/${FUTURE_EVENT_ID}/interactives/ferris-wheel.png`,
      },
      layouts: {},
    });
    const withPlacement = addPlacement(
      empty,
      { pageId: "eventPage", stateId: "active", breakpointId: "desktop" },
      createFixedPlacement("wheel-1", "ferris-wheel"),
    );

    // Full-theme export.
    const exported = JSON.stringify(withPlacement);
    const reimported = parseFDraftThemeText(exported);
    expect(reimported.ok).toBe(true);

    // Page-scoped export — the exact same domain function every other
    // event's page export already goes through.
    const scoped = extractPageScopedTheme(withPlacement, "eventPage");
    expect(fdraftThemeSchema.safeParse(scoped).success).toBe(true);
    expect(scoped.assets["ferris-wheel"]).toBe(
      `events/${FUTURE_EVENT_ID}/interactives/ferris-wheel.png`,
    );
  });

  it("has no interaction registered yet — a legitimate, non-blocking state (interactionId stays null until one is added)", () => {
    const placement = createFixedPlacement("wheel-1", "ferris-wheel");
    expect(placement.interactionId).toBeNull();
    // The schema still validates fine with no interactionId — a future
    // event needs zero interaction-registry changes to be usable.
    const parsed = fdraftThemeSchema.safeParse({
      schemaVersion: 1,
      themeId: FUTURE_EVENT_ID,
      eventId: FUTURE_EVENT_ID,
      scope: "event",
      assets: {
        "ferris-wheel": `events/${FUTURE_EVENT_ID}/interactives/ferris-wheel.png`,
      },
      layouts: {
        eventPage: {
          states: {
            active: { breakpoints: { desktop: { placements: [placement] } } },
          },
        },
      },
    });
    expect(parsed.success).toBe(true);
  });
});
