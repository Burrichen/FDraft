import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NewDraftForm } from "./new-draft-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/components/profiles/profile-provider", () => ({
  useProfileContext: () => ({
    activeProfile: { id: "profile-1", timezone: "UTC", settings: {} },
    repositories: {} as never,
  }),
}));

vi.mock("./actions", () => ({
  createDraftAction: vi.fn(async () => ({ error: null })),
}));

afterEach(() => {
  cleanup();
  push.mockReset();
});

describe("NewDraftForm — Random vs DIY mode", () => {
  it("defaults to Random and shows the random-configuration sections once a difficulty is picked", async () => {
    const user = userEvent.setup();
    render(
      <NewDraftForm
        activeWatchlistCount={10}
        challenges={[]}
        availableGenres={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Medium/ }));
    expect(
      screen.getByRole("heading", {
        name: "How do you want the list to be made?",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create draft" }),
    ).toBeInTheDocument();
  });

  it("switching to 'Build My Own Draft' hides random-only configuration and shows a Continue button instead", async () => {
    const user = userEvent.setup();
    render(
      <NewDraftForm
        activeWatchlistCount={10}
        challenges={[]}
        availableGenres={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Medium/ }));
    await user.click(screen.getByRole("radio", { name: /Build My Own Draft/ }));

    expect(
      screen.queryByRole("heading", {
        name: "How do you want the list to be made?",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create draft" }),
    ).not.toBeInTheDocument();
  });

  it("Continue navigates to the DIY selection screen with the chosen difficulty and deadline mode", async () => {
    const user = userEvent.setup();
    render(
      <NewDraftForm
        activeWatchlistCount={10}
        challenges={[]}
        availableGenres={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Medium/ }));
    await user.click(screen.getByRole("radio", { name: /Build My Own Draft/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(push).toHaveBeenCalledWith(
      "/drafts/new/diy?difficulty=medium&timeMode=calendar",
    );
  });

  it("switching back to Random restores the random-configuration sections", async () => {
    const user = userEvent.setup();
    render(
      <NewDraftForm
        activeWatchlistCount={10}
        challenges={[]}
        availableGenres={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Medium/ }));
    await user.click(screen.getByRole("radio", { name: /Build My Own Draft/ }));
    await user.click(
      screen.getByRole("radio", { name: /Roll My Draft For Me/ }),
    );

    expect(
      screen.getByRole("heading", {
        name: "How do you want the list to be made?",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create draft" }),
    ).toBeInTheDocument();
  });
});
