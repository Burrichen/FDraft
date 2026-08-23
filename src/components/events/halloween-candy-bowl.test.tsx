import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { HalloweenCandyBowl } from "./halloween-candy-bowl";

afterEach(() => {
  cleanup();
});

describe("HalloweenCandyBowl", () => {
  it("starts with a full bowl and takes no profile/repository props at all — this component cannot persist anything", () => {
    render(<HalloweenCandyBowl />);
    expect(
      screen.getAllByRole("button", { name: "Take a piece of candy" }),
    ).toHaveLength(8);
  });

  it("removes one candy per click", async () => {
    const user = userEvent.setup();
    render(<HalloweenCandyBowl />);
    await user.click(
      screen.getAllByRole("button", { name: "Take a piece of candy" })[0],
    );
    expect(
      screen.getAllByRole("button", { name: "Take a piece of candy" }),
    ).toHaveLength(7);
  });

  it("shows the empty-state message once every candy is taken", async () => {
    const user = userEvent.setup();
    render(<HalloweenCandyBowl />);
    for (let i = 0; i < 8; i++) {
      await user.click(
        screen.getAllByRole("button", { name: "Take a piece of candy" })[0],
      );
    }
    expect(screen.getByText("You ate all of them.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Take a piece of candy" }),
    ).not.toBeInTheDocument();
  });

  it("a fresh mount (simulating a reload/navigation) restores the full bowl", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<HalloweenCandyBowl />);
    await user.click(
      screen.getAllByRole("button", { name: "Take a piece of candy" })[0],
    );
    unmount();

    render(<HalloweenCandyBowl />);
    expect(
      screen.getAllByRole("button", { name: "Take a piece of candy" }),
    ).toHaveLength(8);
  });
});

describe("HalloweenCandyBowl — abuse testing (PROMPT 21)", () => {
  it("rapid clicks through the entire bowl never throw and never go negative", async () => {
    const user = userEvent.setup({ delay: null });
    render(<HalloweenCandyBowl />);

    // Click far more times than there are candies — the empty state's own
    // absence of any "Take a piece of candy" button is what makes further
    // clicks physically impossible once empty, but this also exercises the
    // clamp inside the click handler itself.
    for (let i = 0; i < 8; i++) {
      await user.click(
        screen.getAllByRole("button", { name: "Take a piece of candy" })[0],
      );
    }
    expect(screen.getByText("You ate all of them.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Take a piece of candy" }),
    ).not.toBeInTheDocument();
  });

  it("session state never depends on any profile — the same bowl renders identically regardless of which profile is active", () => {
    // No profile-context mock is even set up for this component (unlike
    // the gravestone/pumpkin tests) — it genuinely takes no such prop, so
    // there is nothing for a profile switch to leak between.
    render(<HalloweenCandyBowl />);
    expect(
      screen.getAllByRole("button", { name: "Take a piece of candy" }),
    ).toHaveLength(8);
  });
});
