import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EventArtImage } from "./event-art-image";

afterEach(cleanup);

describe("EventArtImage", () => {
  it("renders a decorative, aria-hidden image by default", () => {
    render(
      <EventArtImage src="/events/halloween/interactives/pumpkin-lit.png" />,
    );
    const img = screen.getByRole("presentation", { hidden: true });
    expect(img).toHaveAttribute(
      "src",
      "/events/halloween/interactives/pumpkin-lit.png",
    );
    expect(img).toHaveAttribute("aria-hidden", "true");
    expect(img).toHaveAttribute("draggable", "false");
  });

  it("stops being aria-hidden once given a real alt", () => {
    render(
      <EventArtImage
        src="/events/halloween/interactives/ghost.png"
        alt="A friendly ghost"
      />,
    );
    const img = screen.getByRole("img", { name: "A friendly ghost" });
    expect(img).not.toHaveAttribute("aria-hidden");
  });

  it("hides itself (renders nothing) if the underlying file fails to load, instead of a broken-image icon", () => {
    render(<EventArtImage src="/events/halloween/interactives/missing.png" />);
    const img = screen.getByRole("presentation", { hidden: true });

    fireEvent.error(img);

    expect(
      screen.queryByRole("presentation", { hidden: true }),
    ).not.toBeInTheDocument();
  });
});
