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
import { getDiyEligibleFilms } from "@/application/drafts/local-diy-candidates";
import type { DiySelectableFilmView } from "@/components/drafts/diy/diy-film-card";
import { DiySelectionView } from "./diy-selection-view";

vi.mock("@/application/drafts/local-draft-service", () => ({
  createLocalDraftFromSelection: vi.fn(),
}));
vi.mock("@/application/drafts/local-diy-candidates", () => ({
  getDiyEligibleFilms: vi.fn(),
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

const mockRepositories = {};

vi.mock("@/components/profiles/profile-provider", () => ({
  useProfileContext: () => ({
    activeProfile: { id: "profile-1", timezone: "UTC" },
    repositories: mockRepositories,
  }),
}));

function makeFilm(
  overrides: Partial<DiySelectableFilmView> & {
    entryId: string;
    title: string;
  },
): DiySelectableFilmView {
  return {
    filmId: `film-${overrides.entryId}`,
    releaseYear: 2020,
    runtimeMinutes: 100,
    posterUrl: null,
    averageRating: null,
    dateAdded: "2024-01-01",
    genres: null,
    ...overrides,
  };
}

const FIVE_FILMS: DiySelectableFilmView[] = [
  "Alpha",
  "Beta",
  "Gamma",
  "Delta",
  "Echo",
].map((title, index) =>
  makeFilm({
    entryId: `entry-${index + 1}`,
    title,
    dateAdded: `2024-0${index + 1}-01`,
  }),
);

afterEach(() => {
  cleanup();
  vi.mocked(createLocalDraftFromSelection).mockReset();
  vi.mocked(getDiyEligibleFilms).mockReset();
  push.mockReset();
  replace.mockReset();
  searchParamValues = { difficulty: "baby", timeMode: "calendar" };
});

describe("DiySelectionView", () => {
  it("renders exactly the films the canonical eligible-candidate set returns — no separate eligibility logic of its own", async () => {
    vi.mocked(getDiyEligibleFilms).mockResolvedValue(FIVE_FILMS.slice(0, 3));
    render(<DiySelectionView />);

    await waitFor(() => expect(screen.getByText("Alpha")).toBeInTheDocument());
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("Gamma")).toBeInTheDocument();
    expect(screen.queryByText("Delta")).not.toBeInTheDocument();
    expect(screen.queryByText("Echo")).not.toBeInTheDocument();
    expect(getDiyEligibleFilms).toHaveBeenCalledWith(
      mockRepositories,
      "profile-1",
    );
  });

  it("toggles selection on click and keeps the confirm button disabled until the required count is reached", async () => {
    vi.mocked(getDiyEligibleFilms).mockResolvedValue(FIVE_FILMS);
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
    vi.mocked(getDiyEligibleFilms).mockResolvedValue(FIVE_FILMS);
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
    vi.mocked(getDiyEligibleFilms).mockResolvedValue(FIVE_FILMS);
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
    // for this specific question.
    await user.click(within(question).getByRole("button", { name: /Alpha/ }));

    expect(screen.getByText("1 / 5 selected")).toBeInTheDocument();
  });
});
