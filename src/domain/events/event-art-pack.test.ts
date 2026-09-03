import { describe, expect, it } from "vitest";
import halloweenManifest from "../../../public/events/halloween/manifest.json";
import christmasManifest from "../../../public/events/christmas/manifest.json";
import {
  parseEventArtPack,
  resolveEventArtPath,
  resolveInteractiveAssetPath,
} from "./event-art-pack";

describe("parseEventArtPack", () => {
  it("parses a minimal, mostly-empty pack, defaulting absent categories to {}", () => {
    const pack = parseEventArtPack({
      eventId: "test-event",
      displayName: "Test Event",
      interactives: { thing: "interactives/thing.png" },
    });
    expect(pack.icons).toEqual({});
    expect(pack.decorations).toEqual({});
    expect(pack.modal).toEqual({});
    expect(pack.backgrounds).toEqual({});
    expect(pack.interactives).toEqual({ thing: "interactives/thing.png" });
  });

  it("throws on a malformed pack (missing eventId)", () => {
    expect(() => parseEventArtPack({ displayName: "No id" })).toThrow();
  });

  it("throws on a non-string slot value", () => {
    expect(() =>
      parseEventArtPack({
        eventId: "bad",
        displayName: "Bad",
        interactives: { thing: 123 },
      }),
    ).toThrow();
  });
});

describe("resolveEventArtPath", () => {
  const pack = parseEventArtPack({
    eventId: "spooky",
    displayName: "Spooky",
    interactives: { pumpkin: "interactives/pumpkin.png" },
  });

  it("builds the full servable URL, prefixed with the event id", () => {
    expect(resolveEventArtPath(pack, "interactives", "pumpkin")).toBe(
      "/events/spooky/interactives/pumpkin.png",
    );
  });

  it("throws a clear error for an undeclared slot", () => {
    expect(() => resolveEventArtPath(pack, "interactives", "ghost")).toThrow(
      /spooky.*interactives\.ghost/,
    );
  });

  it("throws for a category that's a valid category name but has no matching slot", () => {
    expect(() => resolveEventArtPath(pack, "modal", "ghost")).toThrow();
  });
});

describe("resolveInteractiveAssetPath", () => {
  type LightState = "off" | "on";
  const pack = parseEventArtPack({
    eventId: "lamp-event",
    displayName: "Lamp Event",
    interactives: {
      "lamp-off": "interactives/lamp-off.png",
      "lamp-on": "interactives/lamp-on.png",
    },
  });
  const slotByState: Record<LightState, string> = {
    off: "lamp-off",
    on: "lamp-on",
  };

  it("resolves the path for the given state via the caller's own state-to-slot map", () => {
    expect(
      resolveInteractiveAssetPath(pack, "interactives", slotByState, "on"),
    ).toBe("/events/lamp-event/interactives/lamp-on.png");
    expect(
      resolveInteractiveAssetPath(pack, "interactives", slotByState, "off"),
    ).toBe("/events/lamp-event/interactives/lamp-off.png");
  });

  it("makes no assumption about how many states an interactive prop has — a single-state map works too", () => {
    const singleState: Record<"only", string> = { only: "lamp-on" };
    expect(
      resolveInteractiveAssetPath(pack, "interactives", singleState, "only"),
    ).toBe("/events/lamp-event/interactives/lamp-on.png");
  });
});

describe("the real, bundled art packs", () => {
  it("Halloween's manifest.json parses and every currently-used slot resolves", () => {
    const pack = parseEventArtPack(halloweenManifest);
    expect(pack.eventId).toBe("halloween");
    for (const slot of [
      "pumpkin-uncarved",
      "pumpkin-carved",
      "pumpkin-lit",
      "pumpkin-rotting",
      "gravestone-base",
      "gravestone-moss-overlay",
      "candy-bowl-full",
      "candy-bowl-medium",
      "candy-bowl-low",
      "candy-bowl-empty",
    ]) {
      expect(resolveEventArtPath(pack, "interactives", slot)).toBe(
        `/events/halloween/${pack.interactives[slot]}`,
      );
    }
    // "ghost" now points at the real `ghost_01.png` asset (see
    // docs/updates, "HALLOWEEN EVENT ART REWORK") — the old `ghost.png`
    // file no longer exists on disk since it was replaced by the two
    // supplied `ghost_01`/`ghost_02` illustrations.
    expect(resolveEventArtPath(pack, "modal", "ghost")).toBe(
      "/events/halloween/modal/ghost_01.png",
    );
    for (const [slot, file] of [
      ["ghost-01", "ghost_01.png"],
      ["ghost-02", "ghost_02.png"],
      ["full-moon", "moon.png"],
      ["cyndaquil", "cyndaquil_halloween.png"],
    ] as const) {
      expect(resolveEventArtPath(pack, "modal", slot)).toBe(
        `/events/halloween/modal/${file}`,
      );
    }
  });

  it("Christmas's scaffold manifest.json parses and its placeholder slots resolve, proving the same system works for a second event with zero code branches", () => {
    const pack = parseEventArtPack(christmasManifest);
    expect(pack.eventId).toBe("christmas");
    for (const slot of [
      "christmas-tree",
      "presents",
      "snowman",
      "stocking",
      "candy-canes",
    ]) {
      expect(resolveEventArtPath(pack, "interactives", slot)).toMatch(
        /^\/events\/christmas\/interactives\//,
      );
    }
    expect(resolveEventArtPath(pack, "decorations", "fairy-lights")).toBe(
      "/events/christmas/decorations/fairy-lights.png",
    );
  });
});
