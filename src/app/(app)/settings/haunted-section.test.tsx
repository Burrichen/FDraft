import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventOccurrenceStatus } from "@/application/events/event-discovery";
import { HALLOWEEN_ART } from "@/components/events/halloween-art";
import halloweenArtManifest from "../../../../public/events/halloween/manifest.json";
import { HauntedSection } from "./haunted-section";

let mockStatuses: EventOccurrenceStatus[] = [];

vi.mock("@/components/events/event-discovery-provider", () => ({
  useEventDiscovery: () => ({
    result: {
      statuses: mockStatuses,
      eventVisualsEnabled: true,
      now: new Date(0),
    },
    isLoading: false,
    refresh: vi.fn(),
  }),
}));

function halloweenStatus(
  overrides: Partial<EventOccurrenceStatus> = {},
): EventOccurrenceStatus {
  return {
    event: { id: "halloween" } as EventOccurrenceStatus["event"],
    occurrenceKey: "halloween:2026",
    available: true,
    manuallyEnabled: false,
    participation: "joined",
    endingAcknowledged: false,
    endingStingerAcknowledged: false,
    manualActivationEnded: false,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  mockStatuses = [];
});

describe("HauntedSection — visibility", () => {
  it("renders nothing when Halloween is not the active event", async () => {
    mockStatuses = [
      halloweenStatus({ participation: "unanswered" }),
      {
        event: { id: "f-you-its-january" } as EventOccurrenceStatus["event"],
        occurrenceKey: "f-you-its-january:2026",
        available: true,
        manuallyEnabled: false,
        participation: "joined",
        endingAcknowledged: false,
        endingStingerAcknowledged: false,
        manualActivationEnded: false,
      },
    ];
    const { container } = render(<HauntedSection />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("renders the Haunted button when Halloween is the active event", async () => {
    mockStatuses = [halloweenStatus()];
    render(<HauntedSection />);
    expect(
      await screen.findByRole("button", { name: /haunted/i }),
    ).toBeInTheDocument();
  });

  it("renders nothing once Halloween's window has closed, even though it was joined", async () => {
    mockStatuses = [halloweenStatus({ available: false })];
    const { container } = render(<HauntedSection />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});

describe("HauntedSection — first press / second press", () => {
  beforeEach(() => {
    mockStatuses = [halloweenStatus()];
  });

  it("the first press shows the exact warning copy and does not trigger the overlay", async () => {
    const user = userEvent.setup();
    render(<HauntedSection />);
    const button = await screen.findByRole("button", { name: /haunted/i });

    await user.click(button);

    expect(
      screen.getByText("There is no going back. Don't do it."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("the second press mounts the jumpscare overlay", async () => {
    const user = userEvent.setup();
    render(<HauntedSection />);
    const button = await screen.findByRole("button", { name: /haunted/i });

    await user.click(button);
    await user.click(button);

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("the button is exhausted/disabled after one full trigger, preventing a repeat this session", async () => {
    const user = userEvent.setup();
    render(<HauntedSection />);
    const button = await screen.findByRole("button", { name: /haunted/i });

    await user.click(button);
    await user.click(button);

    expect(button).toBeDisabled();
  });

  it("a fresh mount (simulating a reload) resets armed/triggered back to their initial state", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<HauntedSection />);
    const button = await screen.findByRole("button", { name: /haunted/i });
    await user.click(button);
    unmount();

    render(<HauntedSection />);
    const freshButton = await screen.findByRole("button", { name: /haunted/i });
    expect(freshButton).not.toBeDisabled();
    expect(
      screen.queryByText("There is no going back. Don't do it."),
    ).not.toBeInTheDocument();
  });
});

describe("HauntedSection — overlay lifecycle", () => {
  beforeEach(() => {
    mockStatuses = [halloweenStatus()];
  });

  it("stays visible well past a premature/short dismiss, then auto-dismisses by ~3 seconds", async () => {
    const user = userEvent.setup();
    render(<HauntedSection />);
    const button = await screen.findByRole("button", { name: /haunted/i });
    await user.click(button);
    await user.click(button);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    // Still visible well past a premature/short dismiss — the skull must
    // stay up for close to the full ~3 seconds, not vanish early.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    await waitFor(
      () => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
      { timeout: 3000 },
    );
  }, 10000);

  it("Escape dismisses the overlay early", async () => {
    const user = userEvent.setup();
    render(<HauntedSection />);
    const button = await screen.findByRole("button", { name: /haunted/i });
    await user.click(button);
    await user.click(button);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
  });
});

describe("HauntedSection — abuse testing (PROMPT 21)", () => {
  beforeEach(() => {
    mockStatuses = [halloweenStatus()];
  });

  it("repeated clicks on the disabled button after triggering do nothing — no second overlay, no crash", async () => {
    const user = userEvent.setup({ delay: null });
    render(<HauntedSection />);
    const button = await screen.findByRole("button", { name: /haunted/i });
    await user.click(button);
    await user.click(button);
    expect(button).toBeDisabled();

    for (let i = 0; i < 5; i++) {
      await user.click(button);
    }
    // Still exactly one overlay in the document, not several stacked.
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
  });

  it("unmounting mid-overlay (a route change away from Settings) cleans up its timers without throwing or leaking", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<HauntedSection />);
    const button = await screen.findByRole("button", { name: /haunted/i });
    await user.click(button);
    await user.click(button);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    // Unmount while the overlay's internal timers are still pending —
    // must not throw (a dangling `setState` on an unmounted component, or
    // an uncleared timer touching a removed DOM node, would surface here).
    expect(() => unmount()).not.toThrow();

    // Letting the overlay's own internal timers naturally elapse afterward
    // must not throw either (confirms the effect cleanups actually ran).
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }, 10000);

  it("the overlay respects prefers-reduced-motion by zeroing its own transition duration, never removing the fade class entirely", async () => {
    const user = userEvent.setup();
    render(<HauntedSection />);
    const button = await screen.findByRole("button", { name: /haunted/i });
    await user.click(button);
    await user.click(button);

    const overlay = screen.getByRole("alertdialog");
    expect(overlay.className).toContain("motion-reduce:duration-0");
  });

  it("the window losing focus while the overlay is visible does not crash or change its state", async () => {
    const user = userEvent.setup();
    render(<HauntedSection />);
    const button = await screen.findByRole("button", { name: /haunted/i });
    await user.click(button);
    await user.click(button);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    expect(() => window.dispatchEvent(new Event("blur"))).not.toThrow();
    expect(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    ).not.toThrow();
    // Still showing — losing focus doesn't dismiss or restart it.
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
});

/**
 * Covers docs/updates, "FDRAFT UPDATE 1 — REPLACEABLE HAUNTED-BUTTON
 * SKELETON ASSET" §9 — the skeleton is now one ordinary, hand-replaceable
 * bundled PNG rather than an inline SVG drawn in the overlay component.
 * The first-click warning, the second-click effect, the ~3s timing, the
 * fade, Escape and reduced-motion behaviour are all asserted unchanged by
 * the describes above; these tests are about the ASSET.
 */
describe("HauntedSection — the skeleton is a replaceable static asset", () => {
  beforeEach(() => {
    mockStatuses = [halloweenStatus()];
  });

  async function trigger() {
    const user = userEvent.setup();
    render(<HauntedSection />);
    const button = await screen.findByRole("button", { name: /haunted/i });
    await user.click(button);
    await user.click(button);
    return screen.getByRole("alertdialog");
  }

  it("renders the canonical bundled PNG, by path, and nothing drawn in code", async () => {
    const overlay = await trigger();

    const image = screen.getByTestId("haunted-button-skeleton");
    expect(image.tagName).toBe("IMG");
    expect(image).toHaveAttribute(
      "src",
      "/events/halloween/interactives/haunted-button-skeleton.png",
    );
    // The overlay's whole visual content is that one image — no inline
    // <svg> skull drawn in code any more (§8: no competing asset source),
    // and no base64 data URI.
    expect(overlay.querySelector("svg")).toBeNull();
    expect(image.getAttribute("src")).not.toMatch(/^data:/);
  });

  it("takes that path from the art pack, so replacing the file needs no code change", async () => {
    await trigger();

    // The rendered `src` is derived from `public/events/halloween/
    // manifest.json`, never a literal string in a component — which is
    // what makes "overwrite the PNG, rebuild, see the new image" true
    // with no code edit. Asserted against the REAL shipped manifest.
    const declaredPath = (
      halloweenArtManifest.interactives as Record<string, string>
    )["haunted-button-skeleton"];
    expect(declaredPath).toBe("interactives/haunted-button-skeleton.png");
    expect(screen.getByTestId("haunted-button-skeleton")).toHaveAttribute(
      "src",
      `/events/halloween/${declaredPath}`,
    );
    expect(HALLOWEEN_ART.hauntedButtonSkeleton).toBe(
      `/events/halloween/${declaredPath}`,
    );
  });

  it("the file it points at genuinely ships in the build", () => {
    // Guards the one failure this indirection can still have: a manifest
    // entry whose file was never added (or was deleted). `EventArtImage`
    // would hide it silently at runtime, so catch it here instead.
    const onDisk = join(
      process.cwd(),
      "public",
      HALLOWEEN_ART.hauntedButtonSkeleton.replace(/^\//, ""),
    );
    expect(existsSync(onDisk)).toBe(true);
    expect(statSync(onDisk).size).toBeGreaterThan(0);
  });

  it("the program supplies the full-window black background, not the image", async () => {
    const overlay = await trigger();

    // §4 — a replacement PNG must never be required to carry its own
    // black background.
    expect(overlay.className).toContain("bg-black");
    expect(overlay.className).toContain("fixed");
    expect(overlay.className).toContain("inset-0");
    const image = screen.getByTestId("haunted-button-skeleton");
    expect(image.className).not.toContain("bg-black");
  });

  it("scales the image to fit without stretching an arbitrary replacement", async () => {
    await trigger();

    const image = screen.getByTestId("haunted-button-skeleton");
    // §5 — contain + auto sizing under max bounds; never `object-cover`,
    // never a fixed width/height that would distort or crop a future
    // image of a different aspect ratio.
    expect(image.className).toContain("object-contain");
    expect(image.className).toContain("h-auto");
    expect(image.className).toContain("w-auto");
    expect(image.className).toMatch(/max-h-\[/);
    expect(image.className).toMatch(/max-w-\[/);
    expect(image.className).not.toContain("object-cover");
    expect(image).not.toHaveAttribute("width");
    expect(image).not.toHaveAttribute("height");
  });

  it("recovers on schedule even when the image fails to load — never trapping the user on a black screen", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const overlay = await trigger();

    // Simulate the asset being missing/corrupt on disk (§7).
    fireEvent.error(screen.getByTestId("haunted-button-skeleton"));

    // The image is hidden rather than shown broken, and the failure is
    // logged — but the overlay is still up and still on its own timer.
    expect(
      screen.queryByTestId("haunted-button-skeleton"),
    ).not.toBeInTheDocument();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("haunted-button-skeleton.png"),
    );
    expect(overlay).toBeInTheDocument();

    // The normal duration still elapses and dismisses it.
    await waitFor(
      () => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
      { timeout: 5000 },
    );
    warn.mockRestore();
  }, 10000);
});
