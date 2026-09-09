import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { undoLastDraftMutation } from "@/application/drafts/living-draft-mutations";
import { UndoDraftChangeButton } from "./undo-draft-change-button";

vi.mock("@/application/drafts/living-draft-mutations", () => ({
  undoLastDraftMutation: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
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
  vi.mocked(undoLastDraftMutation).mockReset();
  vi.mocked(toast.error).mockReset();
  vi.mocked(toast.success).mockReset();
});

/**
 * The Draft page's one Undo control (see docs/updates, "FDRAFT v1.2.1 —
 * LIVING DRAFTS" Part 2 §5-§7) — one button over the generic mutation
 * history, never an undo affordance per action, and never a change-history
 * panel.
 */
describe("UndoDraftChangeButton", () => {
  it("renders nothing when there is no reversible change", () => {
    const { container } = render(
      <UndoDraftChangeButton
        draftId="draft-1"
        change={null}
        onUndone={vi.fn()}
      />,
    );
    // Not a disabled button that never becomes usable — nothing at all.
    expect(container).toBeEmptyDOMElement();
  });

  it("names the addition it would reverse", () => {
    render(
      <UndoDraftChangeButton
        draftId="draft-1"
        change={{ kind: "add", filmTitle: "Possession" }}
        onUndone={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: 'Undo adding "Possession"' }),
    ).toHaveTextContent("Undo last change");
  });

  it("names a swap differently from an addition, so the two aren't confused", () => {
    render(
      <UndoDraftChangeButton
        draftId="draft-1"
        change={{ kind: "replace", filmTitle: "The Thing" }}
        onUndone={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: 'Undo swapping in "The Thing"' }),
    ).toBeInTheDocument();
  });

  it("undoes on a single press and hands the removed film's ids back to the page", async () => {
    const user = userEvent.setup();
    const onUndone = vi.fn();
    vi.mocked(undoLastDraftMutation).mockResolvedValue({
      ok: true,
      kind: "add",
      draftItemId: "item-9",
      watchlistEntryId: "entry-9",
      clearedWatchedState: false,
    });
    render(
      <UndoDraftChangeButton
        draftId="draft-1"
        change={{ kind: "add", filmTitle: "Possession" }}
        onUndone={onUndone}
      />,
    );

    // No confirmation step: undoing is free and re-addable.
    await user.click(screen.getByRole("button", { name: /^Undo adding/ }));

    expect(undoLastDraftMutation).toHaveBeenCalledWith(mockRepositories, {
      profileId: "profile-1",
      draftId: "draft-1",
    });
    // The ids the page needs to clear a now-invalid session watch-undo.
    expect(onUndone).toHaveBeenCalledWith({
      watchlistEntryId: "entry-9",
      draftItemId: "item-9",
    });
    expect(vi.mocked(toast.success).mock.calls[0][0]).toMatch(
      /Removed "Possession" from your draft/,
    );
  });

  it("says so when the undo also had to clear a watched status (§6)", async () => {
    const user = userEvent.setup();
    vi.mocked(undoLastDraftMutation).mockResolvedValue({
      ok: true,
      kind: "add",
      draftItemId: "item-9",
      watchlistEntryId: "entry-9",
      clearedWatchedState: true,
    });
    render(
      <UndoDraftChangeButton
        draftId="draft-1"
        change={{ kind: "add", filmTitle: "Possession" }}
        onUndone={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^Undo adding/ }));
    expect(vi.mocked(toast.success).mock.calls[0][0]).toMatch(
      /watched status was cleared/,
    );
  });

  it("reports a refusal and tells the page nothing changed", async () => {
    const user = userEvent.setup();
    const onUndone = vi.fn();
    vi.mocked(undoLastDraftMutation).mockResolvedValue({
      ok: false,
      error: "item_missing",
      message: "That change can no longer be undone.",
    });
    render(
      <UndoDraftChangeButton
        draftId="draft-1"
        change={{ kind: "add", filmTitle: "Possession" }}
        onUndone={onUndone}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^Undo adding/ }));
    expect(vi.mocked(toast.error).mock.calls[0][0]).toBe(
      "That change can no longer be undone.",
    );
    expect(onUndone).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
