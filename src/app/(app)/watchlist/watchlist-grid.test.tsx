import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WatchlistFilmCardView } from "@/components/watchlist/types";
import { WatchlistGrid } from "./watchlist-grid";

vi.mock("@/components/profiles/profile-provider", () => ({
  useProfileContext: () => ({
    activeProfile: { id: "profile-1" },
    repositories: {} as never,
  }),
}));

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

function film(entryId: string, title: string): WatchlistFilmCardView {
  return {
    entryId,
    filmId: `film-${entryId}`,
    title,
    dateAdded: "2026-01-01",
    releaseYear: 2020,
    runtimeMinutes: null,
    letterboxdUri: null,
    posterUrl: null,
    averageRating: null,
    genres: null,
    hasMetadata: false,
  };
}

const FILMS = [film("entry-1", "The Thing"), film("entry-2", "Paddington")];

function renderGrid(
  overrides: Partial<Parameters<typeof WatchlistGrid>[0]> = {},
) {
  return render(
    <WatchlistGrid
      films={FILMS}
      hasImportedBefore
      hasActiveFilters={false}
      onResetFilters={vi.fn()}
      activeDraftId={null}
      entryIdsInDraft={new Set()}
      activeDraftIsFull={false}
      eligibleEntryIds={new Set(["entry-1", "entry-2"])}
      eventDraft={null}
      eventDraftEntryIds={new Set()}
      eventDraftIsFull={false}
      eventEligibleEntryIds={new Set()}
      onAddedToEventDraft={vi.fn()}
      onAddedToDraft={vi.fn()}
      {...overrides}
    />,
  );
}

const HALLOWEEN_DRAFT = {
  draftId: "halloween-draft",
  eventName: "Halloween",
  accentClassName: "bg-halloween-pumpkin",
};

/**
 * The wiring no unit test of either button reaches: which cards get an
 * Event action at all (see docs/updates, "FDRAFT v1.2.1 — LIVING DRAFTS"
 * Part 3 §4). Getting this wrong either hides the feature entirely or
 * offers every film to an Event that would refuse it.
 */
describe("WatchlistGrid — Event Add gating (§4)", () => {
  it("offers no Event action when there is no Event Draft accepting additions", () => {
    renderGrid();
    expect(
      screen.queryByRole("button", { name: /Halloween draft/ }),
    ).not.toBeInTheDocument();
  });

  it("offers the Event action only for films that Event's own rules accept", () => {
    renderGrid({
      eventDraft: HALLOWEEN_DRAFT,
      eventEligibleEntryIds: new Set(["entry-1"]),
    });

    expect(
      screen.getByRole("button", {
        name: 'Add "The Thing" to your Halloween draft',
      }),
    ).toBeInTheDocument();
    // Paddington isn't in the eligible set, so it gets no Event route at
    // all — not a disabled one to argue with.
    expect(
      screen.queryByRole("button", { name: /Paddington.*Halloween/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps the normal action available alongside the Event one", () => {
    renderGrid({
      activeDraftId: "normal-draft",
      eventDraft: HALLOWEEN_DRAFT,
      eventEligibleEntryIds: new Set(["entry-1"]),
    });

    // Both slots are independently addable — the dual-draft architecture.
    expect(
      screen.getByRole("button", {
        name: 'Add "The Thing" to your active draft',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: 'Add "The Thing" to your Halloween draft',
      }),
    ).toBeInTheDocument();
  });

  it("shows the Event status for a film already in the Event Draft, even so", () => {
    renderGrid({
      eventDraft: HALLOWEEN_DRAFT,
      eventDraftEntryIds: new Set(["entry-1"]),
      // Deliberately NOT in the eligible set: eligibility is moot for a
      // film that is already in, and its status must not vanish.
      eventEligibleEntryIds: new Set(),
    });

    expect(
      screen.getByLabelText("The Thing is already in your Halloween draft"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /Add "The Thing" to your Halloween/,
      }),
    ).not.toBeInTheDocument();
  });

  it("marks the Event action unavailable when the Event Draft is full (§10)", () => {
    renderGrid({
      eventDraft: HALLOWEEN_DRAFT,
      eventEligibleEntryIds: new Set(["entry-1"]),
      eventDraftIsFull: true,
    });
    expect(
      screen.getByRole("button", {
        name: /Can't add "The Thing" to your Halloween draft/,
      }),
    ).toHaveAttribute("aria-disabled", "true");
  });
});
