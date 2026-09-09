import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActiveDraftFilms } from "./active-draft-films";
import type { DraftFilmCardView } from "./draft-film-card";

vi.mock("@/components/watch-undo/watch-undo-provider", () => ({
  useWatchUndo: () => ({
    getRecord: () => undefined,
    getRecordForItem: () => undefined,
    clearUndo: vi.fn(),
    clearUndoForItem: vi.fn(),
    registerWatched: vi.fn(),
    listPendingEntryIds: () => [],
    getPendingArchivedDraftId: () => null,
  }),
  useIsWatchedThisSession: () => false,
  useIsWatchedThisSessionForItem: () => false,
}));

afterEach(cleanup);

function film(index: number, isCompleted = false): DraftFilmCardView {
  return {
    itemId: `item-${index}`,
    // `null` deliberately, matching `draft-film-card.test.tsx`'s own
    // reasoning — it keeps `WatchToggle` (which needs a profile context
    // irrelevant to progress arithmetic) from rendering at all.
    entryId: null,
    title: `Film ${index}`,
    releaseYear: 2000 + index,
    runtimeMinutes: null,
    letterboxdUri: null,
    posterUrl: null,
    averageRating: null,
    genres: null,
    isCompleted,
    challenge: null,
    hasNoMetadata: false,
    substitution: null,
    canEdit: false,
    source: "random",
    eventCategoryKey: null,
  };
}

/**
 * A Living Draft changes size (see docs/updates, "FDRAFT v1.2.1 — LIVING
 * DRAFTS" Part 2 §8), so nothing here may assume the slot count is fixed
 * at its difficulty's target.
 */
describe("ActiveDraftFilms — flexible draft size (§8)", () => {
  it("counts progress against the films currently in the draft", () => {
    // A Medium draft grown to 12 films with 3 watched: 3/12, never 3/10.
    const films = [
      ...Array.from({ length: 3 }, (_, i) => film(i, true)),
      ...Array.from({ length: 9 }, (_, i) => film(i + 3)),
    ];
    render(<ActiveDraftFilms films={films} />);

    expect(screen.getByText(/3\/12 watched/)).toBeInTheDocument();
    expect(screen.getByText(/25%/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "25",
    );
  });

  it("moves the denominator when the draft grows, rather than the percentage staying put", () => {
    const watched = [film(0, true), film(1, true)];
    const { rerender } = render(
      <ActiveDraftFilms films={[...watched, film(2), film(3)]} />,
    );
    expect(screen.getByText(/2\/4 watched · 50%/)).toBeInTheDocument();

    // One film added — the same two watches now represent less of the draft.
    rerender(
      <ActiveDraftFilms films={[...watched, film(2), film(3), film(4)]} />,
    );
    expect(screen.getByText(/2\/5 watched · 40%/)).toBeInTheDocument();
  });

  it("renders every film in the grid however many there are, up to the 30-film maximum", () => {
    const films = Array.from({ length: 30 }, (_, i) => film(i));
    render(<ActiveDraftFilms films={films} />);

    expect(screen.getByText(/0\/30 watched/)).toBeInTheDocument();
    // One list item per film — the responsive grid wraps them; nothing
    // truncates at the original difficulty's count.
    expect(screen.getAllByRole("listitem")).toHaveLength(30);
  });

  it("reports a fully watched grown draft as complete, not as overshooting", () => {
    const films = Array.from({ length: 11 }, (_, i) => film(i, true));
    render(<ActiveDraftFilms films={films} />);
    expect(screen.getByText(/11\/11 watched · 100%/)).toBeInTheDocument();
  });
});
