import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fdraftComponentAdapterRegistry,
  fdraftComponentCopyContractRegistry,
} from "./component-adapters";
import { FDRAFT_SUPPORTED_COMPONENT_KEYS } from "@/infrastructure/theme-runtime/compatibility";
import {
  FDraftThemeRenderContextProvider,
  type FDraftThemeRenderContextValue,
} from "@/infrastructure/theme-runtime/render-context";
import type { DraftFilmCardView } from "@/components/drafts/draft-film-card";
import { ProfileProvider } from "@/components/profiles/profile-provider";
import { EventDiscoveryProvider } from "@/components/events/event-discovery-provider";
import { WatchUndoProvider } from "@/components/watch-undo/watch-undo-provider";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    useRouter: () => ({
      push: () => {},
      replace: () => {},
      back: () => {},
      forward: () => {},
      refresh: () => {},
      prefetch: () => {},
    }),
  };
});

const PROFILE_ID = "alex";

async function seedProfile(databaseName: string) {
  const db = new FDraftLocalDatabase(databaseName);
  const repos = createLocalRepositories(db);
  await repos.profiles.create({
    id: PROFILE_ID,
    displayName: "Alex",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastOpenedAt: "2026-01-01T00:00:00.000Z",
    timezone: "UTC",
    settings: {
      reducedMotion: false,
      defaultPage: "watchlist",
      franchiseChronologicalOrder: false,
      adminMode: false,
      halloweenPumpkinState: "uncarved",
    },
    dataVersion: 1,
  });
  await db.close();
}

function fakeRequirement(componentKey: string) {
  return {
    id: crypto.randomUUID(),
    componentKey,
    required: false,
    allowedProperties: [],
  };
}

function baseContextValue(
  overrides: Partial<FDraftThemeRenderContextValue> = {},
): FDraftThemeRenderContextValue {
  return {
    eventId: "f-you-its-january",
    films: [],
    pointsBalance: null,
    lifetimePointsBalance: null,
    progressPercent: 0,
    watchedCount: 0,
    targetCount: 0,
    countdownTargetAtMs: null,
    eventAvailable: false,
    eventActive: false,
    optedIn: false,
    draftGenerated: false,
    eventCompleted: false,
    eventPhase: undefined,
    ...overrides,
  };
}

function renderAdapter(
  key: (typeof FDRAFT_SUPPORTED_COMPONENT_KEYS)[number],
  copy: Record<string, string>,
  contextValue: FDraftThemeRenderContextValue,
  databaseName: string,
) {
  const Adapter = fdraftComponentAdapterRegistry[key];
  return render(
    <ProfileProvider databaseName={databaseName}>
      <EventDiscoveryProvider>
        <WatchUndoProvider>
          <FDraftThemeRenderContextProvider value={contextValue}>
            <Adapter
              componentKey={key}
              requirement={fakeRequirement(key)}
              style={{}}
              widthPx={200}
              heightPx={80}
              copy={copy}
              enabled={true}
            />
          </FDraftThemeRenderContextProvider>
        </WatchUndoProvider>
      </EventDiscoveryProvider>
    </ProfileProvider>,
  );
}

describe("fdraftComponentAdapterRegistry", () => {
  let databaseName: string;

  beforeEach(async () => {
    databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
  });

  afterEach(() => {
    cleanup();
  });

  it("implements every key FDraft declares as supported, no more and no fewer", () => {
    expect(Object.keys(fdraftComponentAdapterRegistry).sort()).toEqual(
      [...FDRAFT_SUPPORTED_COMPONENT_KEYS].sort(),
    );
    expect(Object.keys(fdraftComponentCopyContractRegistry).sort()).toEqual(
      [...FDRAFT_SUPPORTED_COMPONENT_KEYS].sort(),
    );
  });

  it("page-title renders the resolved copy text", () => {
    renderAdapter(
      "page-title",
      { title: "My Themed Event" },
      baseContextValue(),
      databaseName,
    );
    expect(screen.getByText("My Themed Event")).toBeInTheDocument();
  });

  it("event-information renders event name and, when provided, date range copy", () => {
    renderAdapter(
      "event-information",
      { eventName: "Sample Event", dateRange: "Runs 1–31 Oct" },
      baseContextValue(),
      databaseName,
    );
    expect(screen.getByText("Sample Event")).toBeInTheDocument();
    expect(screen.getByText("Runs 1–31 Oct")).toBeInTheDocument();
  });

  it("event-information omits the date-range block entirely when that optional copy is empty", () => {
    renderAdapter(
      "event-information",
      { eventName: "Sample Event", dateRange: "" },
      baseContextValue(),
      databaseName,
    );
    expect(screen.queryByText("Runs")).not.toBeInTheDocument();
  });

  it("event-countdown shows a formatted remaining time from the typed host target, never inventing its own date", () => {
    const inOneHour = Date.now() + 60 * 60 * 1000;
    renderAdapter(
      "event-countdown",
      { accessibleLabel: "Time remaining" },
      baseContextValue({ countdownTargetAtMs: inOneHour }),
      databaseName,
    );
    expect(screen.getByLabelText("Time remaining")).toHaveTextContent(/\d+m/);
  });

  it("event-countdown shows a safe placeholder when no countdown target is known", () => {
    renderAdapter(
      "event-countdown",
      { accessibleLabel: "Time remaining" },
      baseContextValue({ countdownTargetAtMs: null }),
      databaseName,
    );
    expect(screen.getByLabelText("Time remaining")).toHaveTextContent("—");
  });

  it("points-counter renders the typed OVERALL/Lifetime points balance, never a theme-authored number", () => {
    renderAdapter(
      "points-counter",
      { unitLabel: "pts", accessibleLabel: "Your points" },
      baseContextValue({ lifetimePointsBalance: 42 }),
      databaseName,
    );
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("pts")).toBeInTheDocument();
  });

  it("points-counter never shows this event's own currency balance, even when it differs from the overall balance", () => {
    renderAdapter(
      "points-counter",
      { unitLabel: "pts", accessibleLabel: "Your points" },
      baseContextValue({ pointsBalance: 999, lifetimePointsBalance: 42 }),
      databaseName,
    );
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.queryByText("999")).not.toBeInTheDocument();
  });

  it("event-points-counter renders THIS event's own currency balance, not the overall one", () => {
    renderAdapter(
      "event-points-counter",
      {
        unitLabel: "haunted pts",
        accessibleLabel: "Your points for this event",
      },
      baseContextValue({ pointsBalance: 30, lifetimePointsBalance: 999 }),
      databaseName,
    );
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.queryByText("999")).not.toBeInTheDocument();
  });

  it("points-counter falls back to 0 when no balance is known, rather than rendering nothing", () => {
    renderAdapter(
      "points-counter",
      { unitLabel: "pts", accessibleLabel: "Your points" },
      baseContextValue({ lifetimePointsBalance: null }),
      databaseName,
    );
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("event-progress renders the typed progress percentage and status copy", () => {
    renderAdapter(
      "event-progress",
      { statusLabel: "3 of 5 watched", accessibleLabel: "Progress" },
      baseContextValue({
        progressPercent: 60,
        watchedCount: 3,
        targetCount: 5,
      }),
      databaseName,
    );
    expect(screen.getByText("3 of 5 watched")).toBeInTheDocument();
    expect(screen.getByLabelText("Progress")).toBeInTheDocument();
  });

  it("film-grid renders the host-supplied film list via the real ActiveDraftFilms component", () => {
    const film: DraftFilmCardView = {
      itemId: "item-1",
      entryId: "entry-1",
      title: "The Thing",
      releaseYear: 1982,
      runtimeMinutes: 109,
      letterboxdUri: "https://letterboxd.com/film/the-thing/",
      posterUrl: null,
      averageRating: 4.2,
      genres: ["Horror"],
      isCompleted: false,
      challenge: null,
      hasNoMetadata: false,
      substitution: null,
      canEdit: false,
      source: "random",
    };
    renderAdapter(
      "film-grid",
      {},
      baseContextValue({ films: [film] }),
      databaseName,
    );
    expect(screen.getByText("The Thing")).toBeInTheDocument();
  });

  it("draft-progress renders the same real progress numbers event-progress does, under its own copy framing", () => {
    renderAdapter(
      "draft-progress",
      { statusLabel: "2 of 5 picks made" },
      baseContextValue({
        watchedCount: 2,
        targetCount: 5,
        progressPercent: 40,
      }),
      databaseName,
    );
    expect(screen.getByText("2 of 5 picks made")).toBeInTheDocument();
  });

  it("challenge-card renders theme-authored title and description, never inventing real challenge data", () => {
    renderAdapter(
      "challenge-card",
      {
        title: "Weekend Challenge",
        description: "Watch 3 films this weekend.",
      },
      baseContextValue(),
      databaseName,
    );
    expect(screen.getByText("Weekend Challenge")).toBeInTheDocument();
    expect(screen.getByText("Watch 3 films this weekend.")).toBeInTheDocument();
  });

  it("challenge-card omits the description block entirely when that optional copy is empty", () => {
    renderAdapter(
      "challenge-card",
      { title: "Weekend Challenge", description: "" },
      baseContextValue(),
      databaseName,
    );
    expect(screen.queryByText("Watch 3 films")).not.toBeInTheDocument();
  });

  it("results-completion-content renders theme-authored headline and body", () => {
    renderAdapter(
      "results-completion-content",
      { headline: "You're all caught up!", body: "Thanks for taking part." },
      baseContextValue(),
      databaseName,
    );
    expect(screen.getByText("You're all caught up!")).toBeInTheDocument();
    expect(screen.getByText("Thanks for taking part.")).toBeInTheDocument();
  });

  it("profile-badge renders the real active profile's initial, from the real ProfileProvider context — never a theme-authored value", async () => {
    renderAdapter(
      "profile-badge",
      { accessibleLabel: "Your profile" },
      baseContextValue(),
      databaseName,
    );
    // `seedProfile` creates "Alex" (see the top of this file).
    // `ProfileProvider` resolves the real active profile asynchronously
    // (`resolveInitialProfile`), so the initial render shows the safe "?"
    // placeholder briefly — `findByText` waits for the real value.
    expect(await screen.findByText("A")).toBeInTheDocument();
    expect(screen.getByLabelText("Your profile")).toBeInTheDocument();
  });

  it("generate-draft-action renders the theme-authored button label, disabled until a real active profile exists", () => {
    renderAdapter(
      "generate-draft-action",
      {
        actionLabel: "Generate My Draft",
        accessibleLabel: "Generate my film draft",
      },
      baseContextValue(),
      databaseName,
    );
    expect(screen.getByText("Generate My Draft")).toBeInTheDocument();
  });

  it("complete-watch-action disables itself with no real target film to act on, rather than acting on nothing", () => {
    renderAdapter(
      "complete-watch-action",
      {
        actionLabel: "Mark as Watched",
        accessibleLabel: "Mark this film as watched",
      },
      baseContextValue({ films: [] }),
      databaseName,
    );
    expect(screen.getByLabelText("Mark this film as watched")).toBeDisabled();
  });

  it("complete-watch-action enables itself once a real host-supplied unwatched film with a watchlist entry exists", async () => {
    const film: DraftFilmCardView = {
      itemId: "item-1",
      entryId: "entry-1",
      title: "The Thing",
      releaseYear: 1982,
      runtimeMinutes: 109,
      letterboxdUri: "https://letterboxd.com/film/the-thing/",
      posterUrl: null,
      averageRating: 4.2,
      genres: ["Horror"],
      isCompleted: false,
      challenge: null,
      hasNoMetadata: false,
      substitution: null,
      canEdit: false,
      source: "random",
    };
    renderAdapter(
      "complete-watch-action",
      {
        actionLabel: "Mark as Watched",
        accessibleLabel: "Mark this film as watched",
      },
      baseContextValue({ films: [film] }),
      databaseName,
    );
    await waitFor(() => {
      expect(
        screen.getByLabelText("Mark this film as watched"),
      ).not.toBeDisabled();
    });
    expect(screen.getByText("Mark as Watched")).toBeInTheDocument();
  });

  it("complete-watch-action skips an already-completed film and targets the next real unwatched one", async () => {
    const watched: DraftFilmCardView = {
      itemId: "item-1",
      entryId: "entry-1",
      title: "Watched Already",
      releaseYear: 1980,
      runtimeMinutes: 90,
      letterboxdUri: null,
      posterUrl: null,
      averageRating: null,
      genres: null,
      isCompleted: true,
      challenge: null,
      hasNoMetadata: false,
      substitution: null,
      canEdit: false,
      source: "random",
    };
    const unwatched: DraftFilmCardView = {
      ...watched,
      itemId: "item-2",
      entryId: "entry-2",
      title: "Still To Watch",
      isCompleted: false,
    };
    renderAdapter(
      "complete-watch-action",
      {
        actionLabel: "Mark as Watched",
        accessibleLabel: "Mark this film as watched",
      },
      baseContextValue({ films: [watched, unwatched] }),
      databaseName,
    );
    await waitFor(() => {
      expect(
        screen.getByLabelText("Mark this film as watched"),
      ).not.toBeDisabled();
    });
  });

  it("event-navigation renders theme-authored previous/next labels, disabled when no other event is currently visible", () => {
    renderAdapter(
      "event-navigation",
      {
        previousLabel: "Previous",
        nextLabel: "Next",
        accessibleLabel: "Event navigation",
      },
      baseContextValue(),
      databaseName,
    );
    expect(screen.getByLabelText("Event navigation")).toBeInTheDocument();
    expect(screen.getByText("Previous")).toBeInTheDocument();
    expect(screen.getByText("Next")).toBeInTheDocument();
    // No event participation was seeded for this profile, so real
    // `resolveVisibleEventPages` correctly finds nothing visible — both
    // controls stay safely disabled rather than navigating nowhere.
    expect(screen.getByText("Previous").closest("button")).toBeDisabled();
    expect(screen.getByText("Next").closest("button")).toBeDisabled();
  });

  it("every adapter throws a clear error instead of silently rendering with no data when mounted without the render-context provider", () => {
    const Adapter = fdraftComponentAdapterRegistry["points-counter"];
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    expect(() =>
      render(
        <Adapter
          componentKey="points-counter"
          requirement={fakeRequirement("points-counter")}
          style={{}}
          widthPx={200}
          heightPx={80}
          copy={{ unitLabel: "pts", accessibleLabel: "Your points" }}
          enabled={true}
        />,
      ),
    ).toThrow(/FDraftThemeRenderContextProvider/);
    consoleError.mockRestore();
  });
});
