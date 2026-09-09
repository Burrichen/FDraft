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
import type { DraftItemRecord, DraftRecord } from "@/repositories/records";
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
    expect(screen.getByText("Festive")).toBeInTheDocument();
    // Four distinct cards, each reading 0 — a real earned total, not a
    // hidden/unavailable stat.
    expect(screen.getAllByText("0")).toHaveLength(4);
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
    // Haunted and Festive stay at their real, honest 0 — no invented
    // reward just to make the counter non-zero (see docs/updates §"IF
    // HAUNTED POINTS HAVE NO EARNING RULE").
    expect(screen.getAllByText("0")).toHaveLength(2);
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

function baseEventDraft(overrides: Partial<DraftRecord> = {}): DraftRecord {
  return {
    id: "halloween-draft-1",
    profileId: PROFILE_ID,
    difficulty: "one-at-a-time",
    timeMode: "timer",
    status: "archived",
    totalFilms: 0,
    randomFilmCount: 0,
    challengeFilmCount: 0,
    challengeMode: null,
    startedAt: "2026-10-01T00:00:00.000Z",
    deadlineAt: "2026-11-01T00:00:00.000Z",
    timezone: "UTC",
    completedAt: "2026-10-31T00:00:00.000Z",
    freeformAchievedRank: null,
    sourceEventId: HALLOWEEN_EVENT_ID,
    sourceEventManuallyEnabled: false,
    rewardsGrantedAt: "2026-10-31T00:00:00.000Z",
    customName: null,
    eventOccurrenceYear: 2026,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-31T00:00:00.000Z",
    ...overrides,
  };
}

function baseEventItem(
  overrides: Partial<DraftItemRecord> = {},
): DraftItemRecord {
  return {
    id: "item-1",
    draftId: "halloween-draft-1",
    filmId: "film-1",
    watchlistEntryId: null,
    source: "random",
    challengeId: null,
    challengeAttemptId: null,
    challengeDisplayValue: null,
    orderIndex: 0,
    isCompleted: true,
    completedAt: "2026-10-15T00:00:00.000Z",
    watchedHistoryId: null,
    originFilmId: null,
    substitutionReason: null,
    eventRewardGrantedAt: "2026-10-15T00:00:00.000Z",
    eventCategoryKey: "horror",
    createdAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

/**
 * Covers docs/updates, "FDRAFT UPDATE 1 — EVENT STATS/HISTORY/PERSISTENCE
 * AUDIT" §9: a compact, per-occurrence Event participation summary,
 * derived entirely from persisted Draft/DraftItem records (there is no
 * per-award ledger — see `computeEventOccurrenceStats`'s own doc comment).
 */
describe("StatsView — Event Stats (EVENT STATS/HISTORY/PERSISTENCE AUDIT §9)", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("shows a completed occurrence's watched count and currency earned", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    await repos.drafts.createDraft(baseEventDraft());
    await repos.drafts.createItems([
      baseEventItem({ id: "item-1", filmId: "film-1", isCompleted: true }),
      baseEventItem({
        id: "item-2",
        filmId: "film-2",
        isCompleted: false,
        completedAt: null,
        eventRewardGrantedAt: null,
        eventCategoryKey: "kitsch",
      }),
    ]);
    await db.close();
    window.localStorage.setItem("fdraft:last-active-profile-id", PROFILE_ID);

    render(<Harness databaseName={databaseName} />);

    await waitFor(() =>
      expect(screen.getByText("Event Stats")).toBeInTheDocument(),
    );
    expect(screen.getByText("2026")).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    // Exactly one film's item earned its reward.
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("shows 'In Progress' for a still-active Event Draft, never 'Completed'", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    await repos.drafts.createDraft(
      baseEventDraft({ status: "active", completedAt: null }),
    );
    await repos.drafts.createItems([baseEventItem()]);
    await db.close();
    window.localStorage.setItem("fdraft:last-active-profile-id", PROFILE_ID);

    render(<Harness databaseName={databaseName} />);

    await waitFor(() =>
      expect(screen.getByText("Event Stats")).toBeInTheDocument(),
    );
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.queryByText("Completed")).not.toBeInTheDocument();
  });

  it("shows 'Expired' for an unfinished occurrence, never falsely 'Completed'", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    await repos.drafts.createDraft(
      baseEventDraft({ status: "expired", completedAt: null }),
    );
    await repos.drafts.createItems([
      baseEventItem({ id: "item-1", isCompleted: true }),
      baseEventItem({
        id: "item-2",
        filmId: "film-2",
        isCompleted: false,
        completedAt: null,
        eventRewardGrantedAt: null,
      }),
    ]);
    await db.close();
    window.localStorage.setItem("fdraft:last-active-profile-id", PROFILE_ID);

    render(<Harness databaseName={databaseName} />);

    await waitFor(() =>
      expect(screen.getByText("Event Stats")).toBeInTheDocument(),
    );
    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(screen.queryByText("Completed")).not.toBeInTheDocument();
  });

  it("never renders an Event Stats section for a profile with no Event Drafts at all", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    window.localStorage.setItem("fdraft:last-active-profile-id", PROFILE_ID);

    render(<Harness databaseName={databaseName} />);

    await waitFor(() =>
      expect(screen.getByText("No stats yet")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Event Stats")).not.toBeInTheDocument();
  });
});

/**
 * Covers docs/updates, "FDRAFT v1.2.1 — LIVING DRAFTS" Part 3 §1/§2: how
 * the Draft films a profile has WATCHED got into their Drafts, across
 * their whole Draft history rather than just the current one.
 */
describe("StatsView — watched films by source (Living Drafts Part 3 §1)", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  function normalDraft(overrides: Partial<DraftRecord> = {}): DraftRecord {
    return baseEventDraft({
      id: "normal-draft-1",
      sourceEventId: null,
      sourceEventManuallyEnabled: null,
      eventOccurrenceYear: null,
      difficulty: "medium",
      ...overrides,
    });
  }

  function item(overrides: Partial<DraftItemRecord>): DraftItemRecord {
    return baseEventItem({
      draftId: "normal-draft-1",
      eventCategoryKey: null,
      eventRewardGrantedAt: null,
      ...overrides,
    });
  }

  it("counts and ranks watched films by source across historical AND active Drafts", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    // An ARCHIVED draft — the history this breakdown must include — plus a
    // still-active one, so the figure is genuinely a lifetime total.
    await repos.drafts.createDraft(normalDraft({ status: "archived" }));
    await repos.drafts.createDraft(
      normalDraft({
        id: "normal-draft-2",
        status: "active",
        completedAt: null,
      }),
    );
    await repos.drafts.createItems([
      item({ id: "i1", filmId: "f1", entrySource: "random" }),
      item({ id: "i2", filmId: "f2", entrySource: "random" }),
      item({ id: "i3", filmId: "f3", entrySource: "manual_add" }),
      item({
        id: "i4",
        filmId: "f4",
        draftId: "normal-draft-2",
        entrySource: "manual_add",
      }),
      // Unwatched: contributes nothing to a "watched by source" figure.
      item({
        id: "i5",
        filmId: "f5",
        draftId: "normal-draft-2",
        entrySource: "challenge",
        isCompleted: false,
        completedAt: null,
      }),
    ]);
    await db.close();
    window.localStorage.setItem("fdraft:last-active-profile-id", PROFILE_ID);

    render(<Harness databaseName={databaseName} />);

    await waitFor(() =>
      expect(screen.getByText("Watched films by source")).toBeInTheDocument(),
    );
    expect(screen.getByText("4 watched draft films")).toBeInTheDocument();
    // Count AND percentage per source: two random and two manually added,
    // so both rows read the same way.
    expect(screen.getByText("Random")).toBeInTheDocument();
    expect(screen.getByText("Manually Added")).toBeInTheDocument();
    expect(screen.getAllByText("2 · 50%")).toHaveLength(2);
    // Sources nothing was watched from are omitted rather than padding the
    // card with zero rows — and One At A Time is never a source at all.
    expect(screen.queryByText("Challenge")).not.toBeInTheDocument();
    expect(screen.queryByText("DIY")).not.toBeInTheDocument();
    expect(screen.queryByText(/One At A Time/)).not.toBeInTheDocument();
  });

  it("classifies a legacy item with no stored source through the migrated fallback", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    await repos.drafts.createDraft(normalDraft({ status: "archived" }));
    // Written the way a pre-v1.2.1 build did: `source` only.
    await repos.drafts.createItems([
      item({ id: "i1", filmId: "f1", source: "manual", entrySource: null }),
      item({ id: "i2", filmId: "f2", source: "random", entrySource: null }),
    ]);
    await db.close();
    window.localStorage.setItem("fdraft:last-active-profile-id", PROFILE_ID);

    render(<Harness databaseName={databaseName} />);

    await waitFor(() =>
      expect(screen.getByText("Watched films by source")).toBeInTheDocument(),
    );
    // No fabrication: each falls back to the safe classification Part 1
    // established (`"manual"` → DIY, `"random"` → Random).
    expect(screen.getByText("2 watched draft films")).toBeInTheDocument();
    expect(screen.getByText("DIY")).toBeInTheDocument();
    expect(screen.getByText("Random")).toBeInTheDocument();
  });

  it("shows nothing at all for a profile that has never watched a Draft film", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    await repos.drafts.createDraft(normalDraft({ status: "active" }));
    await repos.drafts.createItems([
      item({ id: "i1", filmId: "f1", isCompleted: false, completedAt: null }),
    ]);
    await db.close();
    window.localStorage.setItem("fdraft:last-active-profile-id", PROFILE_ID);

    render(<Harness databaseName={databaseName} />);

    await waitFor(() =>
      expect(screen.getByText("No stats yet")).toBeInTheDocument(),
    );
    expect(
      screen.queryByText("Watched films by source"),
    ).not.toBeInTheDocument();
  });
});
