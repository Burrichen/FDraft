import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { addManualFilmToLocalDraft } from "@/application/drafts/local-draft-service";
import { MAX_DRAFT_FILMS } from "@/domain/drafts/living-draft";
import { AddToDraftButton } from "./add-to-draft-button";

vi.mock("@/application/drafts/local-draft-service", () => ({
  addManualFilmToLocalDraft: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
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
  vi.mocked(addManualFilmToLocalDraft).mockReset();
  vi.mocked(toast.error).mockReset();
  vi.mocked(toast.success).mockReset();
  push.mockReset();
});

function renderButton(props: Partial<Parameters<typeof AddToDraftButton>[0]>) {
  return render(
    <AddToDraftButton
      entryId="entry-1"
      title="The Thing"
      activeDraftId="draft-1"
      isInDraft={false}
      onAdded={props.onAdded ?? vi.fn()}
      {...props}
    />,
  );
}

/**
 * The Watchlist card's "Add to Draft" control (see docs/updates, "FDRAFT
 * v1.2.1 — LIVING DRAFTS" Part 2 §1/§2/§4). Its defining property is that
 * a single click never changes anything — it asks first, and the question
 * names the film.
 */
describe("AddToDraftButton — the icon itself (§1)", () => {
  it("renders as one labelled icon control on a normal card", () => {
    renderButton({});
    const button = screen.getByRole("button", {
      name: 'Add "The Thing" to your active draft',
    });
    // An icon button, not a text button: the accessible name carries the
    // meaning, and the visible content is the icon alone.
    expect(button.textContent).toBe("");
    expect(button.querySelector("svg")).not.toBeNull();
  });

  it("shows the status badge, not any button, for a film already in the draft", () => {
    renderButton({ isInDraft: true });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("The Thing is already in your active draft"),
    ).toBeInTheDocument();
  });
});

describe("AddToDraftButton — with an active draft (§2)", () => {
  it("asks for confirmation, naming the film, before changing anything", async () => {
    const user = userEvent.setup();
    renderButton({});

    await user.click(screen.getByRole("button", { name: /^Add "The Thing"/ }));
    expect(
      screen.getByRole("heading", { name: "Add to Draft?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Add "The Thing" to your current draft/),
    ).toBeInTheDocument();
    // Nothing has happened yet — this is the whole point of the step.
    expect(addManualFilmToLocalDraft).not.toHaveBeenCalled();
  });

  it("adds the film once confirmed, and reports it", async () => {
    const user = userEvent.setup();
    const onAdded = vi.fn();
    vi.mocked(addManualFilmToLocalDraft).mockResolvedValue({
      ok: true,
      draftItemId: "item-1",
    });
    renderButton({ onAdded });

    await user.click(screen.getByRole("button", { name: /^Add "The Thing"/ }));
    await user.click(screen.getByRole("button", { name: "Add to Draft" }));

    expect(addManualFilmToLocalDraft).toHaveBeenCalledWith(mockRepositories, {
      profileId: "profile-1",
      draftId: "draft-1",
      watchlistEntryId: "entry-1",
    });
    expect(onAdded).toHaveBeenCalledWith("entry-1");
    expect(vi.mocked(toast.success).mock.calls[0][0]).toMatch(/The Thing/);
  });

  it("cancelling changes nothing at all", async () => {
    const user = userEvent.setup();
    const onAdded = vi.fn();
    renderButton({ onAdded });

    await user.click(screen.getByRole("button", { name: /^Add "The Thing"/ }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(addManualFilmToLocalDraft).not.toHaveBeenCalled();
    expect(onAdded).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("heading", { name: "Add to Draft?" }),
    ).not.toBeInTheDocument();
  });

  it("surfaces a refusal from the mutation rather than claiming success", async () => {
    const user = userEvent.setup();
    const onAdded = vi.fn();
    vi.mocked(addManualFilmToLocalDraft).mockResolvedValue({
      ok: false,
      error: "already_in_draft",
      message: "This film is already in the draft.",
    });
    renderButton({ onAdded });

    await user.click(screen.getByRole("button", { name: /^Add "The Thing"/ }));
    await user.click(screen.getByRole("button", { name: "Add to Draft" }));

    expect(vi.mocked(toast.error).mock.calls[0][0]).toBe(
      "This film is already in the draft.",
    );
    expect(onAdded).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe("AddToDraftButton — refusal states (§2/§7)", () => {
  it("names the 30-film maximum when the draft is full, and never attempts the add", async () => {
    const user = userEvent.setup();
    renderButton({ draftIsFull: true });

    const button = screen.getByRole("button", {
      name: new RegExp(
        `Can't add "The Thing".*maximum of ${MAX_DRAFT_FILMS} films`,
      ),
    });
    expect(button).toHaveAttribute("aria-disabled", "true");

    // Tapping explains rather than doing nothing — the only route to the
    // reason on a touch device.
    await user.click(button);
    expect(addManualFilmToLocalDraft).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("heading", { name: "Add to Draft?" }),
    ).not.toBeInTheDocument();
    expect(vi.mocked(toast.error).mock.calls[0][0]).toMatch(
      new RegExp(`maximum of ${MAX_DRAFT_FILMS} films`),
    );
  });

  it("says the film isn't available when it's outside the manual-selection pool", async () => {
    const user = userEvent.setup();
    renderButton({ isEligible: false });

    await user.click(
      screen.getByRole("button", {
        name: /Can't add "The Thing".*isn't available to draft/,
      }),
    );
    expect(addManualFilmToLocalDraft).not.toHaveBeenCalled();
    expect(vi.mocked(toast.error).mock.calls[0][0]).toMatch(
      /isn't available to draft/,
    );
  });

  it("reports a full draft ahead of an ineligible film, matching the order the mutation checks them", () => {
    renderButton({ draftIsFull: true, isEligible: false });
    expect(
      screen.getByRole("button", { name: /maximum of/ }),
    ).toBeInTheDocument();
  });
});

describe("AddToDraftButton — with no active draft (§4)", () => {
  it("offers to start a draft with this film, and says so plainly", async () => {
    const user = userEvent.setup();
    renderButton({ activeDraftId: null });

    await user.click(
      screen.getByRole("button", {
        name: 'Start a new draft with "The Thing"',
      }),
    );
    expect(
      screen.getByRole("heading", { name: "Start a draft with this film?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Start one with "The Thing" already included/),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("hands off to the ordinary create-draft flow, carrying the chosen film", async () => {
    const user = userEvent.setup();
    renderButton({ activeDraftId: null });

    await user.click(
      screen.getByRole("button", { name: /^Start a new draft/ }),
    );
    await user.click(screen.getByRole("button", { name: "Start a draft" }));

    expect(push).toHaveBeenCalledWith("/drafts/new?startWith=entry-1");
    // Never a direct mutation — the draft is created by the normal flow.
    expect(addManualFilmToLocalDraft).not.toHaveBeenCalled();
  });

  it("cancelling the create offer navigates nowhere", async () => {
    const user = userEvent.setup();
    renderButton({ activeDraftId: null });

    await user.click(
      screen.getByRole("button", { name: /^Start a new draft/ }),
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(push).not.toHaveBeenCalled();
  });

  it("ignores capacity when there is no draft to be full", () => {
    renderButton({ activeDraftId: null, draftIsFull: true });
    expect(
      screen.getByRole("button", {
        name: /^Start a new draft with "The Thing"/,
      }),
    ).not.toHaveAttribute("aria-disabled");
  });

  it("still refuses a film the app can't draft, rather than offering a dead end", async () => {
    // `createLocalDraft` rejects an unusable starting film outright, so
    // offering to start a draft with one would go nowhere.
    const user = userEvent.setup();
    renderButton({ activeDraftId: null, isEligible: false });
    const button = screen.getByRole("button", {
      name: /Can't start a new draft with "The Thing"/,
    });
    expect(button).toHaveAttribute("aria-disabled", "true");
    await user.click(button);
    expect(push).not.toHaveBeenCalled();
  });
});
