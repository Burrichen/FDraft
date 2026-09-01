import { describe, expect, it } from "vitest";
import { findSafeZoneOverlapWarnings, getSafeZones } from "./safe-zone-check";

const CANVAS_W = 1440;
const CANVAS_H = 900;

describe("getSafeZones", () => {
  it("defines exactly the nav/content/modal zones, matching SafeZoneOverlay's own geometry", () => {
    const zones = getSafeZones(CANVAS_W, CANVAS_H);
    expect(zones.map((z) => z.id).sort()).toEqual(["content", "modal", "nav"]);
    const nav = zones.find((z) => z.id === "nav")!;
    expect(nav.box).toEqual({ left: 0, top: 0, width: CANVAS_W, height: 64 });
  });

  it("caps the content zone's width at 1152px, centered, even on a wide canvas", () => {
    const [, content] = getSafeZones(CANVAS_W, CANVAS_H);
    expect(content.box.width).toBe(1152);
    expect(content.box.left).toBeCloseTo((CANVAS_W - 1152) / 2);
  });

  it("the content zone fills the full width on a narrower breakpoint", () => {
    const [, content] = getSafeZones(375, 812);
    expect(content.box.width).toBe(375);
    expect(content.box.left).toBe(0);
  });
});

describe("findSafeZoneOverlapWarnings", () => {
  it("warns when a placement box strongly overlaps the nav strip", () => {
    const warnings = findSafeZoneOverlapWarnings(
      { left: 0, top: 0, width: 100, height: 50 },
      CANVAS_W,
      CANVAS_H,
    );
    expect(warnings).toContain("Overlaps nav area");
  });

  it("does not warn for a placement fully outside every zone", () => {
    const warnings = findSafeZoneOverlapWarnings(
      { left: 1400, top: 850, width: 20, height: 20 },
      CANVAS_W,
      CANVAS_H,
    );
    expect(warnings).toEqual([]);
  });

  it("does not warn for only a light/glancing overlap below the threshold", () => {
    // Mostly outside the nav strip (height 64), only a sliver dips in.
    const warnings = findSafeZoneOverlapWarnings(
      { left: 0, top: 60, width: 100, height: 200 },
      CANVAS_W,
      CANVAS_H,
    );
    expect(warnings).not.toContain("Overlaps nav area");
  });

  it("warns using the exact worded example from the spec for the modal/content zone", () => {
    const [, , modal] = getSafeZones(CANVAS_W, CANVAS_H);
    const warnings = findSafeZoneOverlapWarnings(modal.box, CANVAS_W, CANVAS_H);
    expect(warnings).toContain("Overlaps film-card content area");
  });

  it("a zero-area box never warns", () => {
    expect(
      findSafeZoneOverlapWarnings(
        { left: 0, top: 0, width: 0, height: 0 },
        CANVAS_W,
        CANVAS_H,
      ),
    ).toEqual([]);
  });
});
