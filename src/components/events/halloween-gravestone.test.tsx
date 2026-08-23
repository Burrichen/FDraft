import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HalloweenGravestone } from "./halloween-gravestone";

const LONG_NAME = "Alexandria the Great Watcher of Very Long Names Indeed";
let mockActiveProfile: { displayName: string } | null = {
  displayName: LONG_NAME,
};

vi.mock("@/components/profiles/profile-provider", () => ({
  useProfileContext: () => ({ activeProfile: mockActiveProfile }),
}));

beforeEach(() => {
  mockActiveProfile = { displayName: LONG_NAME };
});

afterEach(() => {
  cleanup();
});

describe("HalloweenGravestone", () => {
  it("shows the non-spoiler label before any clicks", () => {
    render(<HalloweenGravestone />);
    expect(
      screen.getByRole("button", { name: "Old gravestone" }),
    ).toBeInTheDocument();
  });

  it("still shows the non-spoiler label after one or two clicks", async () => {
    const user = userEvent.setup();
    render(<HalloweenGravestone />);
    const button = screen.getByRole("button", { name: "Old gravestone" });

    await user.click(button);
    expect(
      screen.getByRole("button", { name: "Old gravestone" }),
    ).toBeInTheDocument();

    await user.click(button);
    expect(
      screen.getByRole("button", { name: "Old gravestone" }),
    ).toBeInTheDocument();
  });

  it("reveals the current profile display name on the third click, including a long name", async () => {
    const user = userEvent.setup();
    render(<HalloweenGravestone />);
    const button = screen.getByRole("button", { name: "Old gravestone" });

    await user.click(button);
    await user.click(button);
    await user.click(button);

    expect(
      screen.getByRole("button", {
        name: "Alexandria the Great Watcher of Very Long Names Indeed",
      }),
    ).toBeInTheDocument();
  });

  it("does not advance further, or change the revealed name, on a fourth click", async () => {
    const user = userEvent.setup();
    render(<HalloweenGravestone />);
    const button = screen.getByRole("button", { name: "Old gravestone" });
    await user.click(button);
    await user.click(button);
    await user.click(button);
    // The button disables itself once revealed.
    expect(button).toBeDisabled();
  });

  it("a fresh mount (simulating a reload) starts back at zero clicks", () => {
    const { unmount } = render(<HalloweenGravestone />);
    unmount();
    render(<HalloweenGravestone />);
    expect(
      screen.getByRole("button", { name: "Old gravestone" }),
    ).toBeInTheDocument();
  });

  it("renders nothing without an active profile", () => {
    mockActiveProfile = null;
    const { container } = render(<HalloweenGravestone />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("HalloweenGravestone — abuse testing (PROMPT 21)", () => {
  it("rapid-fire clicks still reveal after exactly the third, never earlier, never a race", async () => {
    const user = userEvent.setup({ delay: null });
    render(<HalloweenGravestone />);
    const button = screen.getByRole("button", { name: "Old gravestone" });

    // Fire all three clicks back-to-back with no waiting in between.
    await user.click(button);
    await user.click(button);
    await user.click(button);

    expect(screen.getByRole("button", { name: LONG_NAME })).toBeInTheDocument();
  });

  it("many rapid clicks after reveal never throw or change the revealed name (button is disabled)", async () => {
    const user = userEvent.setup({ delay: null });
    render(<HalloweenGravestone />);
    const button = screen.getByRole("button", { name: "Old gravestone" });
    await user.click(button);
    await user.click(button);
    await user.click(button);
    expect(button).toBeDisabled();
    // Further clicks on a disabled button are inert — confirm no crash and
    // the name is unchanged.
    for (let i = 0; i < 10; i++) {
      await user.click(button);
    }
    expect(screen.getByRole("button", { name: LONG_NAME })).toBeInTheDocument();
  });

  it("a profile switch that keys/remounts the component (see halloween-page-client.tsx) starts the NEW profile at zero clicks, never showing a leftover reveal", () => {
    function KeyedHarness({ profileId }: { profileId: string }) {
      return (
        <div key={profileId}>
          <HalloweenGravestone />
        </div>
      );
    }

    mockActiveProfile = { displayName: "Profile A" };
    const { rerender } = render(<KeyedHarness profileId="profile-a" />);
    // Reveal it for Profile A.
    const buttonA = screen.getByRole("button", { name: "Old gravestone" });
    buttonA.click();
    buttonA.click();
    buttonA.click();

    // Switch to Profile B WITHOUT navigating — same pattern
    // `HalloweenPageClient` uses (`key={activeProfile?.id}`), simulating
    // `switchToProfile` on the same page.
    mockActiveProfile = { displayName: "Profile B" };
    rerender(<KeyedHarness profileId="profile-b" />);

    // Profile B's gravestone starts fresh — non-spoiler label, not
    // Profile A's already-revealed name.
    expect(
      screen.getByRole("button", { name: "Old gravestone" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Profile A")).not.toBeInTheDocument();
  });
});
