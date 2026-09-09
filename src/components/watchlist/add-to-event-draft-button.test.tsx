import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { addManualFilmToLocalDraft } from "@/application/drafts/local-draft-service";
import { MAX_DRAFT_FILMS } from "@/domain/drafts/living-draft";
import { AddToEventDraftButton } from "./add-to-event-draft-button";

vi.mock("@/application/drafts/local-draft-service", () => ({
  addManualFilmToLocalDraft: vi.fn(),
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
  vi.mocked(addManualFilmToLocalDraft).mockReset();
  vi.mocked(toast.error).mockReset();
  vi.mocked(toast.success).mockReset();
});

function renderButton(
  props: Partial<Parameters<typeof AddToEventDraftButton>[0]> = {},
) {
  return render(
    <AddToEventDraftButton
      entryId="entry-1"
      title="The Thing"
      eventDraftId="halloween-draft"
      eventName="Halloween"
      accentClassName="bg-halloween-pumpkin text-halloween-pumpkin-foreground"
      isInEventDraft={false}
      onAdded={props.onAdded ?? vi.fn()}
      {...props}
    />,
  );
}

/**
 * The Event half of "Add to Draft" (see docs/updates, "FDRAFT v1.2.1 —
 * LIVING DRAFTS" Part 3 §4/§5/§10). Eligibility is resolved by the page
 * through the shared Event service, so what matters here is that the
 * control is unmistakably about the EVENT Draft.
 */
describe("AddToEventDraftButton (§4/§5)", () => {
  it("carries the Event's own accent, and names the Event in its label", () => {
    renderButton();
    const button = screen.getByRole("button", {
      name: 'Add "The Thing" to your Halloween draft',
    });
    // Distinguished from the normal action by colour, not by a second icon
    // vocabulary.
    expect(button.className).toContain("bg-halloween-pumpkin");
    expect(button.querySelector("svg")).not.toBeNull();
  });

  it("asks first, naming the Event Draft it would change", async () => {
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole("button", { name: /^Add "The Thing"/ }));
    expect(
      screen.getByRole("heading", { name: "Add to Halloween Draft?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/It'll count toward that draft, not your normal one/),
    ).toBeInTheDocument();
    expect(addManualFilmToLocalDraft).not.toHaveBeenCalled();
  });

  it("adds to the EVENT draft once confirmed", async () => {
    const user = userEvent.setup();
    const onAdded = vi.fn();
    vi.mocked(addManualFilmToLocalDraft).mockResolvedValue({
      ok: true,
      draftItemId: "item-1",
    });
    renderButton({ onAdded });

    await user.click(screen.getByRole("button", { name: /^Add "The Thing"/ }));
    await user.click(screen.getByRole("button", { name: "Add to Draft" }));

    // The event draft's id, never the normal draft's — the service derives
    // `entrySource: "event"` from that draft itself.
    expect(addManualFilmToLocalDraft).toHaveBeenCalledWith(mockRepositories, {
      profileId: "profile-1",
      draftId: "halloween-draft",
      watchlistEntryId: "entry-1",
    });
    expect(onAdded).toHaveBeenCalledWith("entry-1");
    expect(vi.mocked(toast.success).mock.calls[0][0]).toMatch(
      /Halloween draft/,
    );
  });

  it("cancelling changes nothing", async () => {
    const user = userEvent.setup();
    const onAdded = vi.fn();
    renderButton({ onAdded });

    await user.click(screen.getByRole("button", { name: /^Add "The Thing"/ }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(addManualFilmToLocalDraft).not.toHaveBeenCalled();
    expect(onAdded).not.toHaveBeenCalled();
  });

  it("surfaces a refusal from the mutation — the Event's boundary is enforced there too", async () => {
    const user = userEvent.setup();
    vi.mocked(addManualFilmToLocalDraft).mockResolvedValue({
      ok: false,
      error: "film_not_eligible_for_event",
      message: "This film isn't eligible for this event's draft.",
    });
    renderButton();

    await user.click(screen.getByRole("button", { name: /^Add "The Thing"/ }));
    await user.click(screen.getByRole("button", { name: "Add to Draft" }));
    expect(vi.mocked(toast.error).mock.calls[0][0]).toBe(
      "This film isn't eligible for this event's draft.",
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("respects the 30-film maximum on an Event Draft (§10)", async () => {
    const user = userEvent.setup();
    renderButton({ eventDraftIsFull: true });

    const button = screen.getByRole("button", {
      name: new RegExp(
        `Can't add "The Thing" to your Halloween draft.*maximum of ${MAX_DRAFT_FILMS} films`,
      ),
    });
    expect(button).toHaveAttribute("aria-disabled", "true");
    await user.click(button);
    expect(addManualFilmToLocalDraft).not.toHaveBeenCalled();
    expect(vi.mocked(toast.error).mock.calls[0][0]).toMatch(
      new RegExp(`Halloween draft.*maximum of ${MAX_DRAFT_FILMS}`),
    );
  });

  it("shows a plain accented status for a film already in the Event Draft", () => {
    renderButton({ isInEventDraft: true });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("The Thing is already in your Halloween draft"),
    ).toBeInTheDocument();
  });
});
