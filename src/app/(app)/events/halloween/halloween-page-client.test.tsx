import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setEventDateOverride } from "@/application/events/event-date-override-store";
import { EventDiscoveryProvider } from "@/components/events/event-discovery-provider";
import { ProfileProvider } from "@/components/profiles/profile-provider";
import { WatchUndoProvider } from "@/components/watch-undo/watch-undo-provider";
import { HALLOWEEN_EVENT_ID } from "@/domain/events/event-registry";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import type { DraftItemRecord, DraftRecord } from "@/repositories/records";
import { HalloweenPageClient } from "./halloween-page-client";

const PROFILE_ID = "alex";

function Harness({ databaseName }: { databaseName: string }) {
  return (
    <ProfileProvider databaseName={databaseName}>
      <EventDiscoveryProvider>
        <WatchUndoProvider>
          <HalloweenPageClient />
        </WatchUndoProvider>
      </EventDiscoveryProvider>
    </ProfileProvider>
  );
}

async function seedProfile(
  databaseName: string,
  options: { adminMode?: boolean } = {},
) {
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
      adminMode: options.adminMode ?? false,
      halloweenPumpkinState: "uncarved",
    },
    dataVersion: 1,
  });
  await repos.settings.set(PROFILE_ID, "events.settings", {
    eventsEnabled: true,
    eventVisualsEnabled: true,
    activeEvent: HALLOWEEN_EVENT_ID,
    manuallyEnabledEvents: [],
  });
  // Joined for the 2026 occurrence — every test in this file simulates a
  // moment within calendar year 2026 (real or Admin-overridden), so this
  // is the one occurrence key page/nav visibility (see docs/updates,
  // "EVENT LIFECYCLE REPAIR") ever needs to check against here.
  await repos.settings.set(PROFILE_ID, "events.participations", {
    [`${HALLOWEEN_EVENT_ID}:2026`]: "joined",
  });
  await db.close();
}

function baseHalloweenDraft(overrides: Partial<DraftRecord> = {}): DraftRecord {
  return {
    id: "halloween-draft-1",
    profileId: PROFILE_ID,
    difficulty: "baby",
    timeMode: "timer",
    status: "active",
    totalFilms: 1,
    randomFilmCount: 1,
    challengeFilmCount: 0,
    challengeMode: null,
    startedAt: "2026-10-15T12:00:00.000Z",
    deadlineAt: "2026-11-01T00:00:00.000Z",
    timezone: "UTC",
    completedAt: null,
    freeformAchievedRank: null,
    sourceEventId: HALLOWEEN_EVENT_ID,
    sourceEventManuallyEnabled: false,
    rewardsGrantedAt: null,
    customName: null,
    createdAt: "2026-10-15T12:00:00.000Z",
    updatedAt: "2026-10-15T12:00:00.000Z",
    ...overrides,
  };
}

async function seedHalloweenFilm(databaseName: string) {
  const db = new FDraftLocalDatabase(databaseName);
  const repos = createLocalRepositories(db);
  await repos.films.create({
    id: "horror-film-1",
    title: "The Exorcist",
    releaseYear: 1973,
    letterboxdSlug: null,
    letterboxdUri: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  await repos.drafts.createDraft(baseHalloweenDraft());
  const item: DraftItemRecord = {
    id: "horror-item-1",
    draftId: "halloween-draft-1",
    filmId: "horror-film-1",
    watchlistEntryId: null,
    source: "horror",
    challengeId: null,
    challengeAttemptId: null,
    challengeDisplayValue: null,
    orderIndex: 0,
    isCompleted: false,
    completedAt: null,
    watchedHistoryId: null,
    originFilmId: null,
    substitutionReason: null,
    createdAt: "2026-10-15T12:00:00.000Z",
  };
  await repos.drafts.createItems([item]);
  await db.close();
}

/**
 * Covers docs/updates, "PROMPT B2.2 — HALLOWEEN PAGE REBUILD + DEADLINE +
 * STATS": the Event page is now a genuine themed counterpart of the
 * normal Draft page — no explanation block, a fixed Event deadline shown
 * up front, and the active Draft rendered directly with no extra
 * navigation step.
 */
describe("HalloweenPageClient — empty page (no draft yet)", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows the Halloween heading, the real Event-end deadline, and a Create button — with none of the join-modal's explanatory copy", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T12:00:00.000Z"));

    render(<Harness databaseName={databaseName} />);

    await waitFor(() =>
      expect(
        screen.getByText("Event ends 1 November at 00:00"),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("heading", { name: "Halloween" }),
    ).toBeInTheDocument();
    expect(
      (await screen.findAllByText("Create Halloween Draft")).length,
    ).toBeGreaterThan(0);

    // None of the join modal's explanatory description/bullets belong on
    // the page itself (see docs/updates §1).
    expect(
      screen.queryByText(/full seasonal event with its own space/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/its own temporary halloween page, open for/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/three seasonal film pools to draft from/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/a few hidden interactions to find/i),
    ).not.toBeInTheDocument();
  });
});

describe("HalloweenPageClient — active Draft rendered directly on the page", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows the active Halloween Draft's own title, deadline, film progress, and source badge — never a 'you have an active draft, go here' redirect", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    await seedHalloweenFilm(databaseName);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T12:00:00.000Z"));

    render(<Harness databaseName={databaseName} />);

    await waitFor(() =>
      expect(screen.getByText(/october baby draft/i)).toBeInTheDocument(),
    );
    // The film itself renders inline, right on this page.
    expect(screen.getByText("The Exorcist")).toBeInTheDocument();
    // Its Halloween pool badge is visible.
    expect(screen.getByText("Horror")).toBeInTheDocument();
    // No indirection to another page.
    expect(
      screen.queryByText(/you have an active draft/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /go to your draft/i }),
    ).not.toBeInTheDocument();
  });

  it("normal Draft and Halloween Draft can be active at the same time without confusing this page", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    await seedHalloweenFilm(databaseName);
    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    await repos.drafts.createDraft(
      baseHalloweenDraft({
        id: "normal-draft-1",
        sourceEventId: null,
        sourceEventManuallyEnabled: null,
      }),
    );
    await db.close();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T12:00:00.000Z"));

    render(<Harness databaseName={databaseName} />);

    // The Halloween page still shows ITS OWN draft, unaffected by the
    // normal draft also being active.
    await waitFor(() =>
      expect(screen.getByText("The Exorcist")).toBeInTheDocument(),
    );
  });
});

describe("HalloweenPageClient — Event time progress (PROMPT B2.2 'EVENT TIME PROGRESS')", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("a Draft created mid-window shows progress through the whole Event window, not 0% (real clock)", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    await seedHalloweenFilm(databaseName);
    vi.useFakeTimers({ toFake: ["Date"] });
    // Same instant as the draft's own `startedAt` — under the OLD (buggy)
    // per-draft-window calculation this would read as exactly 0% elapsed.
    vi.setSystemTime(new Date("2026-10-15T12:00:00.000Z"));

    render(<Harness databaseName={databaseName} />);

    // 47% — the real fraction of Halloween's 30 Sep 19:00 → 1 Nov 00:00
    // window elapsed by 15 Oct 12:00, not 0%.
    await waitFor(() =>
      expect(screen.getByText(/47% elapsed/)).toBeInTheDocument(),
    );
  });

  it("uses the Admin EventClock override, not the real wall clock, when Admin Mode is on", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName, { adminMode: true });
    await seedHalloweenFilm(databaseName);
    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    await setEventDateOverride(repos, PROFILE_ID, {
      enabled: true,
      eventId: HALLOWEEN_EVENT_ID,
      simulatedDate: "2026-10-15T12:00:00.000Z",
    });
    await db.close();

    // The REAL clock is far outside the window entirely — only the Admin
    // override (resolved via `getEffectiveEventDate`) should drive the
    // displayed progress.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-01T00:00:00.000Z"));

    render(<Harness databaseName={databaseName} />);

    await waitFor(() =>
      expect(screen.getByText(/47% elapsed/)).toBeInTheDocument(),
    );
  });
});
