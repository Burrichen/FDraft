import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getEventSettings } from "@/application/events/event-settings-store";
import { HauntedSection } from "./haunted-section";

vi.mock("@/application/events/event-settings-store", () => ({
  getEventSettings: vi.fn(),
}));

const mockRepositories = {} as never;
vi.mock("@/components/profiles/profile-provider", () => ({
  useProfileContext: () => ({
    activeProfile: { id: "profile-1" },
    repositories: mockRepositories,
  }),
}));

afterEach(() => {
  cleanup();
  vi.mocked(getEventSettings).mockReset();
});

describe("HauntedSection — visibility", () => {
  it("renders nothing when Halloween is not the active event", async () => {
    vi.mocked(getEventSettings).mockResolvedValue({
      eventsEnabled: true,
      eventVisualsEnabled: true,
      activeEvent: "f-you-its-january",
      manuallyEnabledEvents: [],
    });
    const { container } = render(<HauntedSection />);
    await waitFor(() => expect(getEventSettings).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the Haunted button when Halloween is the active event", async () => {
    vi.mocked(getEventSettings).mockResolvedValue({
      eventsEnabled: true,
      eventVisualsEnabled: true,
      activeEvent: "halloween",
      manuallyEnabledEvents: ["halloween"],
    });
    render(<HauntedSection />);
    expect(
      await screen.findByRole("button", { name: /haunted/i }),
    ).toBeInTheDocument();
  });
});

describe("HauntedSection — first press / second press", () => {
  beforeEach(() => {
    vi.mocked(getEventSettings).mockResolvedValue({
      eventsEnabled: true,
      eventVisualsEnabled: true,
      activeEvent: "halloween",
      manuallyEnabledEvents: ["halloween"],
    });
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
    vi.mocked(getEventSettings).mockResolvedValue({
      eventsEnabled: true,
      eventVisualsEnabled: true,
      activeEvent: "halloween",
      manuallyEnabledEvents: ["halloween"],
    });
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
    vi.mocked(getEventSettings).mockResolvedValue({
      eventsEnabled: true,
      eventVisualsEnabled: true,
      activeEvent: "halloween",
      manuallyEnabledEvents: ["halloween"],
    });
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
