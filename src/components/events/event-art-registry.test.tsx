import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseEventArtPack } from "@/domain/events/event-art-pack";
import {
  EventDecorationSurface,
  getEventArtPack,
  getEventArtRegistration,
  getEventDecorationSurface,
  getEventNavIcon,
  listRegisteredEventIds,
  registerEventArt,
  type EventArtRegistration,
} from "./event-art-registry";

function fakeRegistration(
  eventId: string,
  overrides: Partial<EventArtRegistration> = {},
): EventArtRegistration {
  return {
    eventId,
    displayName: eventId,
    artPack: parseEventArtPack({
      eventId,
      displayName: eventId,
      interactives: { thing: "interactives/thing.png" },
    }),
    ...overrides,
  };
}

afterEach(cleanup);

describe("event art registry — generic, multi-event lookup", () => {
  beforeEach(() => {
    registerEventArt(fakeRegistration("test-event-a"));
    registerEventArt(
      fakeRegistration("test-event-b", {
        decorationRegistry: { ghost: () => <span data-testid="ghost" /> },
        surfaces: {
          page: {
            layout: {
              "mid-right": {
                slot: "mid-right",
                visibleFrom: "base",
                variants: [{ assetId: "ghost", weight: 1 }],
              },
            },
            positions: { "mid-right": "absolute top-1/2 right-4" },
          },
        },
      }),
    );
  });

  it("resolves a registered event's art pack", () => {
    expect(getEventArtPack("test-event-a")?.eventId).toBe("test-event-a");
  });

  it("returns undefined, never throws, for an unregistered event id", () => {
    expect(getEventArtPack("nonexistent-event")).toBeUndefined();
    expect(getEventArtRegistration("nonexistent-event")).toBeUndefined();
    expect(getEventNavIcon("nonexistent-event")).toBeUndefined();
    expect(
      getEventDecorationSurface("nonexistent-event", "page"),
    ).toBeUndefined();
  });

  it("returns undefined for a nav icon that was never registered for a real event", () => {
    expect(getEventNavIcon("test-event-a")).toBeUndefined();
  });

  it("returns undefined for a surface key an event never registered", () => {
    expect(getEventDecorationSurface("test-event-b", "modal")).toBeUndefined();
    expect(getEventDecorationSurface("test-event-b", "page")).toBeDefined();
  });

  it("lists every currently-registered event id, generically — no event name hardcoded here", () => {
    const ids = listRegisteredEventIds();
    expect(ids).toContain("test-event-a");
    expect(ids).toContain("test-event-b");
  });

  it("EventDecorationSurface renders the correct event's registered decoration", () => {
    const { getByTestId } = render(
      <EventDecorationSurface eventId="test-event-b" surfaceKey="page" />,
    );
    expect(getByTestId("ghost")).toBeInTheDocument();
  });

  it("EventDecorationSurface degrades safely (renders null) for an unregistered event", () => {
    const { container } = render(
      <EventDecorationSurface eventId="nonexistent-event" surfaceKey="page" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("EventDecorationSurface degrades safely for a registered event with no decoration registry at all", () => {
    const { container } = render(
      <EventDecorationSurface eventId="test-event-a" surfaceKey="page" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("EventDecorationSurface degrades safely for a surface key that doesn't exist on that event", () => {
    const { container } = render(
      <EventDecorationSurface eventId="test-event-b" surfaceKey="modal" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("the real, registered Halloween and Christmas art (proves the API works for more than one event)", () => {
  beforeEach(async () => {
    await import("./register-event-art");
  });

  it("Halloween is registered with a real nav icon and every real surface", () => {
    expect(getEventArtPack("halloween")?.eventId).toBe("halloween");
    expect(getEventNavIcon("halloween")).toBeDefined();
    expect(getEventDecorationSurface("halloween", "page")).toBeDefined();
    expect(getEventDecorationSurface("halloween", "modal")).toBeDefined();
    expect(getEventDecorationSurface("halloween", "ambient")).toBeDefined();
  });

  it("Christmas (a placeholder scaffold, never wired into any real page) is registered too, through the exact same API", () => {
    expect(getEventArtPack("christmas")?.eventId).toBe("christmas");
    expect(getEventNavIcon("christmas")).toBeDefined();
    expect(getEventDecorationSurface("christmas", "page")).toBeDefined();
  });

  it("Christmas only registered a 'page' surface (unlike Halloween's page/modal/ambient three) — different events can register a different surface set with no shared assumption forcing parity", () => {
    expect(getEventDecorationSurface("christmas", "modal")).toBeUndefined();
    expect(getEventDecorationSurface("christmas", "ambient")).toBeUndefined();
    expect(getEventDecorationSurface("christmas", "page")).toBeDefined();
  });
});
