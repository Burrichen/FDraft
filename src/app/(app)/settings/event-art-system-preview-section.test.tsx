import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import halloweenArtManifest from "../../../../public/events/halloween/manifest.json";
import { EventArtSystemPreviewSection } from "./event-art-system-preview-section";

beforeAll(async () => {
  await import("@/components/events/register-event-art");
});

afterEach(cleanup);

describe("EventArtSystemPreviewSection", () => {
  it("lists every registered event, including Christmas's placeholder scaffold, with no gameplay implied", () => {
    render(<EventArtSystemPreviewSection />);
    expect(screen.getByText("Halloween")).toBeInTheDocument();
    expect(screen.getByText("Christmas")).toBeInTheDocument();
    expect(
      screen.getByText(/does not enable any event for real use/i),
    ).toBeInTheDocument();
  });

  it("renders a live decoration surface preview for each event without crashing", () => {
    expect(() => render(<EventArtSystemPreviewSection />)).not.toThrow();
  });

  it("shows a slot-count summary derived from the real art pack, per event", () => {
    render(<EventArtSystemPreviewSection />);
    // Counted from the REAL shipped manifest rather than hardcoded, so
    // adding or removing an art slot (e.g. the Haunted button's skeleton)
    // doesn't fail a test that is only ever about "this summary reflects
    // the actual pack."
    const interactiveSlotCount = Object.keys(
      halloweenArtManifest.interactives,
    ).length;
    expect(interactiveSlotCount).toBeGreaterThan(0);
    expect(
      screen.getByText(new RegExp(`interactives: ${interactiveSlotCount}\\b`)),
    ).toBeInTheDocument();
  });
});
