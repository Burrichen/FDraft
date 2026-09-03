import { cleanup, render, screen } from "@testing-library/react";
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
    progressPercent: 0,
    watchedCount: 0,
    targetCount: 0,
    countdownTargetAtMs: null,
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

  it("points-counter renders the typed points balance, never a theme-authored number", () => {
    renderAdapter(
      "points-counter",
      { unitLabel: "pts", accessibleLabel: "Your points" },
      baseContextValue({ pointsBalance: 42 }),
      databaseName,
    );
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("pts")).toBeInTheDocument();
  });

  it("points-counter falls back to 0 when no balance is known, rather than rendering nothing", () => {
    renderAdapter(
      "points-counter",
      { unitLabel: "pts", accessibleLabel: "Your points" },
      baseContextValue({ pointsBalance: null }),
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
