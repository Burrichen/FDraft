import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
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
    expect(screen.getByText(/interactives: 10/)).toBeInTheDocument();
  });
});
