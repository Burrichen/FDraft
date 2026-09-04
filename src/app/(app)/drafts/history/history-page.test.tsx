import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventDiscoveryProvider } from "@/components/events/event-discovery-provider";
import { ProfileProvider } from "@/components/profiles/profile-provider";
import { HALLOWEEN_EVENT_ID } from "@/domain/events/event-registry";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import type { DraftRecord } from "@/repositories/records";
import DraftHistoryPage from "./page";

const PROFILE_ID = "alex";

function Harness({ databaseName }: { databaseName: string }) {
  return (
    <ProfileProvider databaseName={databaseName}>
      <EventDiscoveryProvider>
        <DraftHistoryPage />
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
  await repos.settings.set(PROFILE_ID, "events.settings", {
    eventsEnabled: true,
    eventVisualsEnabled: true,
    activeEvent: null,
    manuallyEnabledEvents: [],
  });
  await db.close();
}

function baseDraft(overrides: Partial<DraftRecord> = {}): DraftRecord {
  return {
    id: "draft-1",
    profileId: PROFILE_ID,
    difficulty: "baby",
    timeMode: "timer",
    status: "archived",
    totalFilms: 0,
    randomFilmCount: 0,
    challengeFilmCount: 0,
    challengeMode: null,
    startedAt: "2026-10-01T00:00:00.000Z",
    deadlineAt: "2026-11-01T00:00:00.000Z",
    timezone: "UTC",
    completedAt: "2026-10-20T00:00:00.000Z",
    freeformAchievedRank: null,
    sourceEventId: null,
    sourceEventManuallyEnabled: null,
    rewardsGrantedAt: "2026-10-20T00:00:00.000Z",
    customName: null,
    eventOccurrenceYear: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-20T00:00:00.000Z",
    ...overrides,
  };
}

/**
 * Covers docs/updates, "PROMPT B2.2 — HALLOWEEN PAGE REBUILD + DEADLINE +
 * STATS" §7: History must keep a normal Draft and a Halloween Draft
 * distinguishable, with the Halloween one retaining its Event identity
 * (badge + "Event deadline" label instead of a Calendar/Timer mode that
 * was never actually chosen) — and dual-Draft support must not regress
 * (both a normal and an Event draft can appear in History at once).
 */
describe("Draft History — normal and Halloween Drafts stay distinguishable", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows a normal archived draft with its real time-mode label and no Event badge", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    await repos.drafts.createDraft(baseDraft());
    await db.close();

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByText("Previous Drafts")).toBeInTheDocument(),
    );

    const user = userEvent.setup();
    const summary = screen.getByText(/october baby draft/i);
    await user.click(summary);

    expect(screen.getByText(/timer mode/i)).toBeInTheDocument();
    expect(screen.queryByText("Halloween")).not.toBeInTheDocument();
  });

  it("shows an archived Halloween draft with 'Event deadline' (never a Calendar/Timer label) and its Halloween badge", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    await repos.drafts.createDraft(
      baseDraft({
        id: "halloween-draft-1",
        sourceEventId: HALLOWEEN_EVENT_ID,
        sourceEventManuallyEnabled: false,
      }),
    );
    await db.close();

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByText("Previous Drafts")).toBeInTheDocument(),
    );

    const user = userEvent.setup();
    // Canonical Halloween naming (see docs/updates, "HALLOWEEN UI CLEANUP"
    // §7-9) — never the generated `<Month> <Difficulty> Draft` form, even
    // though `baseDraft()`'s own difficulty/startedAt would otherwise
    // produce "October Baby Draft" for this record.
    const summary = screen.getByText(/halloween 2026 draft/i);
    await user.click(summary);

    expect(screen.getByText(/event deadline/i)).toBeInTheDocument();
    expect(screen.queryByText(/timer mode/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/calendar mode/i)).not.toBeInTheDocument();
    expect(screen.getByText("Halloween")).toBeInTheDocument();
  });

  it("a normal Draft and a Halloween Draft both appear at once — dual-Draft support is preserved in History", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    await repos.drafts.createDraft(baseDraft({ id: "normal-draft-1" }));
    await repos.drafts.createDraft(
      baseDraft({
        id: "halloween-draft-1",
        sourceEventId: HALLOWEEN_EVENT_ID,
        sourceEventManuallyEnabled: false,
        completedAt: "2026-10-25T00:00:00.000Z",
      }),
    );
    await db.close();

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByText("Previous Drafts")).toBeInTheDocument(),
    );

    // The normal draft keeps its generated name; the Halloween draft shows
    // its own canonical name instead — the two are no longer identical
    // text now that Halloween naming doesn't follow creation month/
    // difficulty (see docs/updates, "HALLOWEEN UI CLEANUP" §7-9).
    expect(screen.getByText(/october baby draft/i)).toBeInTheDocument();
    expect(screen.getByText(/halloween 2026 draft/i)).toBeInTheDocument();
    expect(screen.getByText("Halloween")).toBeInTheDocument();
  });
});

/**
 * Covers docs/updates, "ONE AT A TIME DRAFTING — CORE SYSTEM" §18/§19: an
 * archived One At A Time draft must be exactly as compatible with History
 * as any other draft — its generated name, its real (never "Event
 * deadline") time-mode label, and each item's own source all render
 * through the same existing, unmodified History logic, with zero
 * special-casing added for the new difficulty value.
 */
describe("Draft History — One At A Time draft", () => {
  afterEach(cleanup);

  it("shows the generated name, the real time-mode label, and each item's own source", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    await repos.films.create({
      id: "film-1",
      title: "Randomly Drafted",
      releaseYear: 2020,
      letterboxdSlug: null,
      letterboxdUri: null,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    });
    await repos.films.create({
      id: "film-2",
      title: "Hand Picked",
      releaseYear: 2021,
      letterboxdSlug: null,
      letterboxdUri: null,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    });
    await repos.drafts.createDraft(
      baseDraft({
        id: "oaat-draft-1",
        difficulty: "one-at-a-time",
        totalFilms: 2,
        randomFilmCount: 1,
        challengeFilmCount: 0,
      }),
    );
    await repos.drafts.createItems([
      {
        id: "item-1",
        draftId: "oaat-draft-1",
        filmId: "film-1",
        watchlistEntryId: "entry-1",
        source: "random",
        challengeId: null,
        challengeAttemptId: null,
        challengeDisplayValue: null,
        orderIndex: 0,
        isCompleted: false,
        completedAt: null,
        watchedHistoryId: null,
        originFilmId: null,
        substitutionReason: null,
        createdAt: "2026-10-01T00:00:00.000Z",
      },
      {
        id: "item-2",
        draftId: "oaat-draft-1",
        filmId: "film-2",
        watchlistEntryId: "entry-2",
        source: "manual",
        challengeId: null,
        challengeAttemptId: null,
        challengeDisplayValue: null,
        orderIndex: 1,
        isCompleted: false,
        completedAt: null,
        watchedHistoryId: null,
        originFilmId: null,
        substitutionReason: null,
        createdAt: "2026-10-01T00:00:00.000Z",
      },
    ]);
    await db.close();

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByText("Previous Drafts")).toBeInTheDocument(),
    );

    const summary = screen.getByText(/october one at a time draft/i);
    expect(summary).toBeInTheDocument();
    await userEvent.setup().click(summary);

    expect(screen.getByText(/timer mode/i)).toBeInTheDocument();
    expect(screen.getByText("Randomly Drafted")).toBeInTheDocument();
    expect(screen.getByText("Hand Picked")).toBeInTheDocument();
  });
});

/**
 * Regression coverage for docs/updates, "HALLOWEEN UI CLEANUP" §2: the
 * interactive pumpkin easter egg moved from here to Stats — its positive
 * coverage (shown when joined/active with visuals on) now lives in
 * `stats-view.test.tsx`; this only needs to prove it's genuinely gone from
 * History, even under the exact conditions that used to show it here.
 */
describe("Draft History — no Halloween pumpkin (moved to Stats)", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("never shows the pumpkin here, even when Halloween is joined/active with visuals on", async () => {
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
    await db.close();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T12:00:00.000Z"));

    render(<Harness databaseName={databaseName} />);

    await waitFor(() =>
      expect(screen.getByText("Previous Drafts")).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: /pumpkin/i }),
    ).not.toBeInTheDocument();
  });
});
