import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiyFilmPickerSheet } from "./diy-film-picker-sheet";
import type { DiySelectableFilmView } from "./diy-film-card";

afterEach(cleanup);

const FILMS: DiySelectableFilmView[] = [
  {
    entryId: "entry-1",
    filmId: "film-1",
    title: "Alpha",
    releaseYear: 2020,
    runtimeMinutes: 100,
    posterUrl: null,
    averageRating: null,
    dateAdded: "2024-01-01",
    genres: null,
  },
  {
    entryId: "entry-2",
    filmId: "film-2",
    title: "Beta",
    releaseYear: 2021,
    runtimeMinutes: 90,
    posterUrl: null,
    averageRating: null,
    dateAdded: "2024-01-02",
    genres: null,
  },
];

function renderSheet(
  overrides: Partial<Parameters<typeof DiyFilmPickerSheet>[0]> = {},
) {
  return render(
    <DiyFilmPickerSheet
      open
      onOpenChange={vi.fn()}
      films={FILMS}
      excludedEntryIds={new Set()}
      selectedEntryId={null}
      slotLabel="slot 1 of 1"
      onConfirm={vi.fn()}
      {...overrides}
    />,
  );
}

describe("DiyFilmPickerSheet", () => {
  it("is single-select — picking a second film replaces the first, not both", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.click(screen.getByRole("button", { name: /Alpha/ }));
    await user.click(screen.getByRole("button", { name: /Beta/ }));

    expect(screen.getByRole("button", { name: /Alpha/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: /Beta/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("clicking the already-selected film deselects it", async () => {
    const user = userEvent.setup();
    renderSheet();
    const alpha = screen.getByRole("button", { name: /Alpha/ });
    await user.click(alpha);
    expect(alpha).toHaveAttribute("aria-pressed", "true");
    await user.click(alpha);
    expect(alpha).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
  });

  it("search narrows the list to matching titles only", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.type(
      screen.getByRole("searchbox", { name: "Search your watchlist by title" }),
      "alph",
    );
    expect(screen.getByRole("button", { name: /Alpha/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Beta/ }),
    ).not.toBeInTheDocument();
  });

  it("pre-selects the slot's existing pick when opened, and lets it be replaced", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderSheet({ selectedEntryId: "entry-1", onConfirm });
    expect(screen.getByRole("button", { name: /Alpha/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: /Beta/ }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledWith("entry-2");
  });

  it("excludes films already claimed by another slot", () => {
    renderSheet({ excludedEntryIds: new Set(["entry-2"]) });
    expect(screen.getByRole("button", { name: /Alpha/ })).toBeInTheDocument();
    expect(screen.queryByText(/Beta/)).not.toBeInTheDocument();
  });

  it("still offers this slot's OWN current pick even though it's technically 'claimed' by this same slot", () => {
    renderSheet({
      selectedEntryId: "entry-1",
      excludedEntryIds: new Set(["entry-1"]),
    });
    expect(screen.getByRole("button", { name: /Alpha/ })).toBeInTheDocument();
  });

  it("cancel never calls onConfirm", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderSheet({ onConfirm });
    await user.click(screen.getByRole("button", { name: /Alpha/ }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
