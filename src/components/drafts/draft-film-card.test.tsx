import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WatchUndoProvider } from "@/components/watch-undo/watch-undo-provider";
import { DraftFilmCard, type DraftFilmCardView } from "./draft-film-card";

afterEach(() => {
  cleanup();
});

function baseFilm(
  overrides: Partial<DraftFilmCardView> = {},
): DraftFilmCardView {
  return {
    itemId: "item-1",
    // `null` deliberately — keeps `WatchToggle` (which needs a profile
    // context this test doesn't set up) from rendering at all.
    entryId: null,
    title: "Some Film",
    releaseYear: 2020,
    runtimeMinutes: 100,
    letterboxdUri: null,
    posterUrl: null,
    averageRating: null,
    genres: null,
    isCompleted: false,
    challenge: null,
    hasNoMetadata: false,
    substitution: null,
    canEdit: false,
    ...overrides,
  };
}

function renderCard(
  film: DraftFilmCardView,
  handlers: {
    onManualReplace?: (itemId: string) => void;
    onSlotReroll?: (itemId: string) => Promise<void>;
  } = {},
) {
  return render(
    <WatchUndoProvider>
      <DraftFilmCard film={film} {...handlers} />
    </WatchUndoProvider>,
  );
}

describe("DraftFilmCard — editable random slot controls (v1.1.3)", () => {
  it("shows neither the replace nor the reroll icon when canEdit is false", () => {
    renderCard(baseFilm({ canEdit: false }), {
      onManualReplace: vi.fn(),
      onSlotReroll: vi.fn(),
    });
    expect(
      screen.queryByRole("button", { name: /replace some film/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /re-roll some film/i }),
    ).not.toBeInTheDocument();
  });

  it("shows both icons for an editable random slot and invokes the right handler on click", async () => {
    const user = userEvent.setup();
    const onManualReplace = vi.fn();
    const onSlotReroll = vi.fn().mockResolvedValue(undefined);
    renderCard(baseFilm({ canEdit: true }), {
      onManualReplace,
      onSlotReroll,
    });

    await user.click(
      screen.getByRole("button", { name: /replace some film/i }),
    );
    expect(onManualReplace).toHaveBeenCalledWith("item-1");
    expect(onSlotReroll).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: /re-roll some film/i }),
    );
    expect(onSlotReroll).toHaveBeenCalledWith("item-1");
  });

  it("acts immediately, without confirmation, when the slot is unwatched", async () => {
    const user = userEvent.setup();
    const onSlotReroll = vi.fn().mockResolvedValue(undefined);
    renderCard(baseFilm({ canEdit: true, isCompleted: false }), {
      onSlotReroll,
    });

    await user.click(
      screen.getByRole("button", { name: /re-roll some film/i }),
    );
    expect(onSlotReroll).toHaveBeenCalledWith("item-1");
    expect(
      screen.queryByRole("heading", { name: /replace a watched film/i }),
    ).not.toBeInTheDocument();
  });

  it("asks for confirmation before replacing an already-watched slot, and does nothing on Cancel", async () => {
    const user = userEvent.setup();
    const onSlotReroll = vi.fn().mockResolvedValue(undefined);
    renderCard(baseFilm({ canEdit: true, isCompleted: true }), {
      onSlotReroll,
    });

    await user.click(
      screen.getByRole("button", { name: /re-roll some film/i }),
    );
    expect(
      screen.getByRole("heading", { name: /replace a watched film/i }),
    ).toBeInTheDocument();
    expect(onSlotReroll).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onSlotReroll).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("heading", { name: /replace a watched film/i }),
    ).not.toBeInTheDocument();
  });

  it("proceeds with the reroll after confirming on an already-watched slot", async () => {
    const user = userEvent.setup();
    const onSlotReroll = vi.fn().mockResolvedValue(undefined);
    renderCard(baseFilm({ canEdit: true, isCompleted: true }), {
      onSlotReroll,
    });

    await user.click(
      screen.getByRole("button", { name: /re-roll some film/i }),
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(onSlotReroll).toHaveBeenCalledWith("item-1");
  });
});
