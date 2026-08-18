import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { abandonLocalDraft } from "@/application/drafts/local-draft-service";
import { RegenerateDraftButton } from "./regenerate-draft-button";

vi.mock("@/application/drafts/local-draft-service", () => ({
  abandonLocalDraft: vi.fn(),
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
  vi.mocked(abandonLocalDraft).mockReset();
});

describe("RegenerateDraftButton", () => {
  it("requires an explicit confirmation before calling abandonLocalDraft", async () => {
    const user = userEvent.setup();
    const onRegenerated = vi.fn();
    render(
      <RegenerateDraftButton draftId="draft-1" onRegenerated={onRegenerated} />,
    );

    await user.click(screen.getByRole("button", { name: "Regenerate Draft" }));
    expect(
      screen.getByRole("heading", { name: "Regenerate this draft?" }),
    ).toBeInTheDocument();
    expect(abandonLocalDraft).not.toHaveBeenCalled();
  });

  it("explains that the draft is deleted, no points are awarded, watches are reverted, and the page resets", async () => {
    const user = userEvent.setup();
    render(<RegenerateDraftButton draftId="draft-1" onRegenerated={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Regenerate Draft" }));

    const description = screen.getByText(
      /permanently deletes your current draft/,
    );
    expect(description.textContent).toMatch(
      /permanently deletes your current draft/i,
    );
    expect(description.textContent).toMatch(
      /no lifetime, event, or other points/i,
    );
    expect(description.textContent).toMatch(
      /returned to your active watchlist/i,
    );
    expect(description.textContent).toMatch(/return to its normal state/i);
  });

  it("cancelling never calls abandonLocalDraft", async () => {
    const user = userEvent.setup();
    render(<RegenerateDraftButton draftId="draft-1" onRegenerated={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Regenerate Draft" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(abandonLocalDraft).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("heading", { name: "Regenerate this draft?" }),
    ).not.toBeInTheDocument();
  });

  it("confirming calls abandonLocalDraft with the right ids and forwards the reverted entries", async () => {
    vi.mocked(abandonLocalDraft).mockResolvedValue({
      ok: true,
      result: { revertedWatchlistEntryIds: ["entry-1", "entry-2"] },
    });
    const user = userEvent.setup();
    const onRegenerated = vi.fn();
    render(
      <RegenerateDraftButton draftId="draft-1" onRegenerated={onRegenerated} />,
    );
    await user.click(screen.getByRole("button", { name: "Regenerate Draft" }));
    await user.click(
      screen.getByRole("button", { name: "Regenerate draft permanently" }),
    );

    await waitFor(() =>
      expect(onRegenerated).toHaveBeenCalledWith(["entry-1", "entry-2"]),
    );
    expect(abandonLocalDraft).toHaveBeenCalledWith(mockRepositories, {
      profileId: "profile-1",
      draftId: "draft-1",
    });
    expect(
      screen.queryByRole("heading", { name: "Regenerate this draft?" }),
    ).not.toBeInTheDocument();
  });

  it("shows the service's error message and keeps the dialog open on failure", async () => {
    vi.mocked(abandonLocalDraft).mockResolvedValue({
      ok: false,
      error: "not_active",
      message: "Only an active draft can be regenerated.",
    });
    const user = userEvent.setup();
    const onRegenerated = vi.fn();
    render(
      <RegenerateDraftButton draftId="draft-1" onRegenerated={onRegenerated} />,
    );
    await user.click(screen.getByRole("button", { name: "Regenerate Draft" }));
    await user.click(
      screen.getByRole("button", { name: "Regenerate draft permanently" }),
    );

    await waitFor(() => expect(abandonLocalDraft).toHaveBeenCalled());
    expect(onRegenerated).not.toHaveBeenCalled();
  });
});
