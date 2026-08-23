import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WatchUndoProvider } from "@/components/watch-undo/watch-undo-provider";
import { DraftFilmCard, type DraftFilmCardView } from "./draft-film-card";

const mockRepositories = {} as never;

vi.mock("@/components/profiles/profile-provider", () => ({
  useProfileContext: () => ({
    activeProfile: { id: "profile-1", timezone: "UTC" },
    repositories: mockRepositories,
  }),
}));

vi.mock("@/application/watchlist/local-watchlist-service", () => ({
  markLocalDraftItemWatchedWithoutEntry: vi.fn(),
  undoLocalFilmWatched: vi.fn(),
}));

vi.mock("@/application/drafts/local-draft-service", () => ({
  archiveLocalDraftIfResolved: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

function halloweenFilm(
  overrides: Partial<DraftFilmCardView> = {},
): DraftFilmCardView {
  return {
    itemId: "item-1",
    entryId: null,
    title: "The Exorcist",
    releaseYear: 1973,
    runtimeMinutes: 122,
    letterboxdUri: null,
    posterUrl: null,
    averageRating: null,
    genres: null,
    isCompleted: false,
    challenge: null,
    hasNoMetadata: false,
    substitution: null,
    canEdit: false,
    source: "horror",
    ...overrides,
  };
}

function renderCard(film: DraftFilmCardView) {
  return render(
    <WatchUndoProvider>
      <DraftFilmCard film={film} />
    </WatchUndoProvider>,
  );
}

describe("DraftFilmCard — Halloween pool identification (Prompt 19)", () => {
  it("shows a Halloween-Adjacent badge for that source", () => {
    renderCard(
      halloweenFilm({ source: "halloween-adjacent", entryId: "entry-1" }),
    );
    expect(screen.getByText("Halloween-Adjacent")).toBeInTheDocument();
  });

  it("shows a Horror badge for that source", () => {
    renderCard(halloweenFilm({ source: "horror" }));
    expect(screen.getByText("Horror")).toBeInTheDocument();
  });

  it("shows a Kitsch badge for that source", () => {
    renderCard(halloweenFilm({ source: "kitsch" }));
    expect(screen.getByText("Kitsch")).toBeInTheDocument();
  });

  it("shows no pool badge for a normal random item", () => {
    renderCard(halloweenFilm({ source: "random" }));
    expect(screen.queryByText("Horror")).not.toBeInTheDocument();
    expect(screen.queryByText("Kitsch")).not.toBeInTheDocument();
    expect(screen.queryByText("Halloween-Adjacent")).not.toBeInTheDocument();
  });

  it("renders a watch control for a Horror item with no watchlist entry (entryId: null)", () => {
    renderCard(
      halloweenFilm({ source: "horror", entryId: null, isCompleted: false }),
    );
    expect(
      screen.getByRole("button", { name: /mark "the exorcist" as watched/i }),
    ).toBeInTheDocument();
  });

  it("renders no watch control for a completed non-session item with no watchlist entry", () => {
    renderCard(
      halloweenFilm({ source: "horror", entryId: null, isCompleted: true }),
    );
    // No pending session-undo record exists — falls back to the plain
    // checkmark badge, same as any other completed-in-an-earlier-session item.
    expect(
      screen.queryByRole("button", { name: /undo marking/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /mark "the exorcist" as watched/i }),
    ).not.toBeInTheDocument();
  });
});
