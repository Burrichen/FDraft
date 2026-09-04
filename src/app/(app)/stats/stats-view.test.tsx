import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setEventDateOverride } from "@/application/events/event-date-override-store";
import { EventDiscoveryProvider } from "@/components/events/event-discovery-provider";
import { ProfileProvider } from "@/components/profiles/profile-provider";
import { HALLOWEEN_EVENT_ID } from "@/domain/events/event-registry";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import { LocalWatchlistRepository } from "@/infrastructure/local-db/watchlist-repository";
import { StatsView } from "./stats-view";

const PROFILE_ID = "alex";

function Harness({ databaseName }: { databaseName: string }) {
  return (
    <ProfileProvider databaseName={databaseName}>
      <EventDiscoveryProvider>
        <StatsView />
      </EventDiscoveryProvider>
    </ProfileProvider>
  );
}

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

describe("StatsView (real fake-indexeddb)", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("shows an empty state instead of a grid of zeroes for a brand-new profile — see docs/product-spec.md, 'COMPLETE PRODUCT AUDIT'", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    window.localStorage.setItem("fdraft:last-active-profile-id", PROFILE_ID);

    render(<Harness databaseName={databaseName} />);

    await waitFor(() =>
      expect(screen.getByText("No stats yet")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Remaining")).not.toBeInTheDocument();
    // Never leaks its own doc path to a real user.
    expect(screen.queryByText(/product-spec\.md/i)).not.toBeInTheDocument();
  });

  it("shows a real error state (with a working retry), never a permanent blank area, when the stats loader itself fails", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    window.localStorage.setItem("fdraft:last-active-profile-id", PROFILE_ID);

    // The component constructs its own repositories internally via
    // ProfileProvider, so the shared class prototype is patched instead of
    // injecting a mock instance.
    const spy = vi
      .spyOn(LocalWatchlistRepository.prototype, "listActiveEntries")
      .mockRejectedValueOnce(new Error("IndexedDB read failed"));

    const user = userEvent.setup();
    render(<Harness databaseName={databaseName} />);

    await waitFor(() =>
      expect(screen.getByText("Something went wrong")).toBeInTheDocument(),
    );
    expect(screen.getByText("IndexedDB read failed")).toBeInTheDocument();

    spy.mockRestore();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() =>
      expect(screen.getByText("No stats yet")).toBeInTheDocument(),
    );
  });
});

/**
 * Covers docs/updates, "PROMPT B2.2 — HALLOWEEN PAGE REBUILD + DEADLINE +
 * STATS" §6: permanent point-currency totals always show, even at 0 (no
 * invented Haunted Points earning mechanic), and are shown even for a
 * profile with an otherwise-empty watchlist.
 */
describe("StatsView — Points (PROMPT B2.2)", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("shows all three currencies, defaulting to 0, even for a brand-new profile with an empty watchlist", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    window.localStorage.setItem("fdraft:last-active-profile-id", PROFILE_ID);

    render(<Harness databaseName={databaseName} />);

    await waitFor(() => expect(screen.getByText("Points")).toBeInTheDocument());
    expect(screen.getByText("Lifetime")).toBeInTheDocument();
    expect(screen.getByText("Misery")).toBeInTheDocument();
    expect(screen.getByText("Haunted")).toBeInTheDocument();
    // Three distinct cards, each reading 0 — a real earned total, not a
    // hidden/unavailable stat.
    expect(screen.getAllByText("0")).toHaveLength(3);
  });

  it("shows real, non-zero totals for each currency independently", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    window.localStorage.setItem("fdraft:last-active-profile-id", PROFILE_ID);

    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    await repos.points.setBalance({
      profileId: PROFILE_ID,
      currency: "lifetime",
      total: 47,
      updatedAt: "2026-08-01T00:00:00.000Z",
    });
    await repos.points.setBalance({
      profileId: PROFILE_ID,
      currency: "misery",
      total: 8,
      updatedAt: "2026-08-01T00:00:00.000Z",
    });
    await db.close();

    render(<Harness databaseName={databaseName} />);

    await waitFor(() => expect(screen.getByText("47")).toBeInTheDocument());
    expect(screen.getByText("8")).toBeInTheDocument();
    // Haunted stays at its real, honest 0 — no invented reward just to
    // make the counter non-zero (see docs/updates §"IF HAUNTED POINTS
    // HAVE NO EARNING RULE").
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});

/**
 * Covers docs/updates, "HALLOWEEN UI CLEANUP" §2-3: the interactive
 * pumpkin easter egg moved here from the History page — same persisted-
 * per-profile state/click cycle, same visibility condition
 * (`useHalloweenAmbientVisible`: joined AND currently active AND Event
 * Visuals on), but with NO visible "Halloween Pumpkin" caption anywhere —
 * only the button's own non-visible accessible name.
 */
describe("StatsView — Halloween pumpkin (moved here from History)", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("shows the pumpkin, with no visible 'Halloween Pumpkin' text, when Halloween is joined/active with visuals on", async () => {
    const databaseName = crypto.randomUUID();
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
        adminMode: true,
        halloweenPumpkinState: "uncarved",
      },
      dataVersion: 1,
    });
    await repos.settings.set(PROFILE_ID, "events.settings", {
      eventsEnabled: true,
      eventVisualsEnabled: true,
      activeEvent: null,
      manuallyEnabledEvents: [],
    });
    await repos.settings.set(PROFILE_ID, "events.participations", {
      [`${HALLOWEEN_EVENT_ID}:2026`]: "joined",
    });
    await setEventDateOverride(repos, PROFILE_ID, {
      enabled: true,
      eventId: HALLOWEEN_EVENT_ID,
      simulatedDate: "2026-10-15T12:00:00.000Z",
    });
    await db.close();
    window.localStorage.setItem("fdraft:last-active-profile-id", PROFILE_ID);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T12:00:00.000Z"));

    render(<Harness databaseName={databaseName} />);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /pumpkin: uncarved/i }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText(/halloween pumpkin/i)).not.toBeInTheDocument();
  });

  it("hides the pumpkin when Halloween hasn't been joined", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    window.localStorage.setItem("fdraft:last-active-profile-id", PROFILE_ID);

    render(<Harness databaseName={databaseName} />);

    await waitFor(() =>
      expect(screen.getByText("No stats yet")).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: /pumpkin/i }),
    ).not.toBeInTheDocument();
  });
});
