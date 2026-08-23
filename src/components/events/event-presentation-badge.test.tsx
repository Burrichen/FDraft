import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { F_YOU_ITS_JANUARY_EVENT_ID } from "@/domain/events/event-registry";
import { EventPresentationBadge } from "./event-presentation-badge";
import * as eventVisualThemes from "./event-visual-themes";

describe("EventPresentationBadge", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders nothing when Event visuals are disabled, even for a themed active event", () => {
    const { container } = render(
      <EventPresentationBadge
        sourceEventId={F_YOU_ITS_JANUARY_EVENT_ID}
        eventVisualsEnabled={false}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a normal, non-event draft", () => {
    const { container } = render(
      <EventPresentationBadge
        sourceEventId={null}
        eventVisualsEnabled={true}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for an unknown/removed event id — safe fallback, never a crash", () => {
    const { container } = render(
      <EventPresentationBadge
        sourceEventId="not-a-real-event"
        eventVisualsEnabled={true}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the event's name and themed icon when visuals are enabled", () => {
    render(
      <EventPresentationBadge
        sourceEventId={F_YOU_ITS_JANUARY_EVENT_ID}
        eventVisualsEnabled={true}
      />,
    );
    expect(screen.getByText("F* You, It's January!")).toBeInTheDocument();
    // The themed icon renders as an svg, aria-hidden (decorative — the
    // text label alone already conveys the event's identity).
    const badge = screen.getByText("F* You, It's January!").closest("span");
    expect(badge?.querySelector("svg")).toBeInTheDocument();
  });

  it("falls back to a plain name badge, no icon, for an event with no recognized visual theme", () => {
    // Every currently-registered event happens to have a visual theme
    // today — this exercises the badge's own fallback path directly
    // (rather than depending on a real themeless event existing) so the
    // "no icon, still shows the name" guarantee stays covered regardless.
    const spy = vi
      .spyOn(eventVisualThemes, "resolveEventTheme")
      .mockReturnValue(undefined);
    try {
      render(
        <EventPresentationBadge
          sourceEventId={F_YOU_ITS_JANUARY_EVENT_ID}
          eventVisualsEnabled={true}
        />,
      );
      expect(screen.getByText("F* You, It's January!")).toBeInTheDocument();
      const badge = screen.getByText("F* You, It's January!").closest("span");
      expect(badge?.querySelector("svg")).not.toBeInTheDocument();
    } finally {
      spy.mockRestore();
    }
  });
});
