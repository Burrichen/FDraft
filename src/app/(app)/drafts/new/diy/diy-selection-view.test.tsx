import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalDraftFromSelection } from "@/application/drafts/local-draft-service";
import { fetchLocalChallengeCandidates } from "@/application/drafts/local-fetch-context";
import type {
  FilmMetadataRecord,
  FilmRecord,
  WatchlistEntryRecord,
} from "@/repositories/records";
import { DiySelectionView } from "./diy-selection-view";

vi.mock("@/application/drafts/local-draft-service", () => ({
  createLocalDraftFromSelection: vi.fn(),
}));
vi.mock("@/application/drafts/local-fetch-context", () => ({
  fetchLocalChallengeCandidates: vi.fn(),
}));

const push = vi.fn();
const replace = vi.fn();
let searchParamValues: Record<string, string> = {
  difficulty: "baby",
  timeMode: "calendar",
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => ({
    get: (key: string) => searchParamValues[key] ?? null,
  }),
}));

function makeFilm(
  overrides: Partial<FilmRecord> & { id: string; title: string },
): FilmRecord {
  return {
    releaseYear: 2020,
    letterboxdSlug: null,
    letterboxdUri: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeEntry(
  overrides: Partial<WatchlistEntryRecord> & {
    id: string;
    filmId: string;
    dateAdded: string;
  },
): WatchlistEntryRecord {
  return {
    profileId: "profile-1",
    position: null,
    isActive: true,
    selectionWeight: 1,
    importSource: null,
    importId: null,
    removedAt: null,
    removedReason: null,
    createdAt: overrides.dateAdded,
    ...overrides,
  } as WatchlistEntryRecord;
}

const FILMS = ["Alpha", "Beta", "Gamma", "Delta", "Echo"].map((title, index) =>
  makeFilm({ id: `film-${index + 1}`, title }),
);
const ENTRIES = FILMS.map((film, index) =>
  makeEntry({
    id: `entry-${index + 1}`,
    filmId: film.id,
    dateAdded: `2024-0${index + 1}-01`,
  }),
);

const mockRepositories = {
  watchlist: {
    listActiveEntries: vi.fn(),
  },
  films: {
    getById: vi.fn(),
    getMetadataForFilms: vi.fn(),
  },
};

vi.mock("@/components/profiles/profile-provider", () => ({
  useProfileContext: () => ({
    activeProfile: { id: "profile-1", timezone: "UTC" },
    repositories: mockRepositories,
  }),
}));

function setUpRepositories(
  entries: WatchlistEntryRecord[] = ENTRIES,
  films: FilmRecord[] = FILMS,
) {
  (
    mockRepositories.watchlist.listActiveEntries as ReturnType<typeof vi.fn>
  ).mockResolvedValue(entries);
  (
    mockRepositories.films.getById as ReturnType<typeof vi.fn>
  ).mockImplementation(
    async (filmId: string) => films.find((film) => film.id === filmId) ?? null,
  );
  (
    mockRepositories.films.getMetadataForFilms as ReturnType<typeof vi.fn>
  ).mockResolvedValue(new Map<string, FilmMetadataRecord[]>());
}

afterEach(() => {
  cleanup();
  vi.mocked(createLocalDraftFromSelection).mockReset();
  vi.mocked(fetchLocalChallengeCandidates).mockReset();
  vi.mocked(mockRepositories.watchlist.listActiveEntries).mockReset();
  vi.mocked(mockRepositories.films.getById).mockReset();
  vi.mocked(mockRepositories.films.getMetadataForFilms).mockReset();
  push.mockReset();
  replace.mockReset();
  searchParamValues = { difficulty: "baby", timeMode: "calendar" };
});

describe("DiySelectionView", () => {
  it("only shows films the centralized eligibility check allows, never an ineligible candidate", async () => {
    setUpRepositories();
    vi.mocked(fetchLocalChallengeCandidates).mockResolvedValue(
      ENTRIES.slice(0, 3).map((entry) => ({
        watchlistEntryId: entry.id,
      })) as never,
    );
    render(<DiySelectionView />);

    await waitFor(() => expect(screen.getByText("Alpha")).toBeInTheDocument());
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("Gamma")).toBeInTheDocument();
    expect(screen.queryByText("Delta")).not.toBeInTheDocument();
    expect(screen.queryByText("Echo")).not.toBeInTheDocument();
  });

  it("toggles selection on click and keeps the confirm button disabled until the required count is reached", async () => {
    setUpRepositories();
    vi.mocked(fetchLocalChallengeCandidates).mockResolvedValue(
      ENTRIES.map((entry) => ({ watchlistEntryId: entry.id })) as never,
    );
    const user = userEvent.setup();
    render(<DiySelectionView />);

    await waitFor(() => expect(screen.getByText("Alpha")).toBeInTheDocument());
    const confirmButton = screen.getByRole("button", { name: "Create draft" });
    expect(confirmButton).toBeDisabled();
    const grid = screen.getByRole("list", { name: "Eligible films" });

    for (const title of ["Alpha", "Beta", "Gamma", "Delta", "Echo"]) {
      await user.click(
        within(grid).getByRole("button", { name: new RegExp(title) }),
      );
    }

    expect(screen.getByText("5 / 5 selected")).toBeInTheDocument();
    expect(confirmButton).not.toBeDisabled();

    await user.click(within(grid).getByRole("button", { name: /Alpha/ }));
    expect(screen.getByText("4 / 5 selected")).toBeInTheDocument();
    expect(confirmButton).toBeDisabled();
  });

  it("creates the draft with the selected entries and navigates to /drafts on success", async () => {
    setUpRepositories();
    vi.mocked(fetchLocalChallengeCandidates).mockResolvedValue(
      ENTRIES.map((entry) => ({ watchlistEntryId: entry.id })) as never,
    );
    vi.mocked(createLocalDraftFromSelection).mockResolvedValue({
      ok: true,
      draftId: "draft-1",
    });
    const user = userEvent.setup();
    render(<DiySelectionView />);

    await waitFor(() => expect(screen.getByText("Alpha")).toBeInTheDocument());
    const grid = screen.getByRole("list", { name: "Eligible films" });
    for (const title of ["Alpha", "Beta", "Gamma", "Delta", "Echo"]) {
      await user.click(
        within(grid).getByRole("button", { name: new RegExp(title) }),
      );
    }
    await user.click(screen.getByRole("button", { name: "Create draft" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/drafts"));
    expect(createLocalDraftFromSelection).toHaveBeenCalledWith(
      mockRepositories,
      expect.objectContaining({
        profileId: "profile-1",
        difficulty: "baby",
        timeMode: "calendar",
        watchlistEntryIds: expect.arrayContaining([
          "entry-1",
          "entry-2",
          "entry-3",
          "entry-4",
          "entry-5",
        ]),
      }),
    );
  });

  it("selecting a recommendation toggles the same selection state as the main grid, without independently mutating anything", async () => {
    setUpRepositories();
    vi.mocked(fetchLocalChallengeCandidates).mockResolvedValue(
      ENTRIES.map((entry) => ({ watchlistEntryId: entry.id })) as never,
    );
    const user = userEvent.setup();
    render(<DiySelectionView />);

    await waitFor(() => expect(screen.getByText("Alpha")).toBeInTheDocument());
    expect(screen.getByText("0 / 5 selected")).toBeInTheDocument();

    const summary = screen.getByText(
      "What movies have been on my watchlist the longest?",
    );
    await user.click(summary);
    const question = summary.closest("details");
    if (!question) throw new Error("expected a <details> ancestor");
    // "Alpha" was added earliest (2024-01-01) — it's the top recommendation
    // for this specific question (scoped so it can't collide with the
    // "highest rated" question's own, separately-rendered "Alpha" entry).
    await user.click(within(question).getByRole("button", { name: /Alpha/ }));

    expect(screen.getByText("1 / 5 selected")).toBeInTheDocument();
  });
});
