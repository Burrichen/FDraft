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
 * Covers docs/updates, "FDRAFT UPDATE 1 — EVENT STATS/HISTORY/PERSISTENCE
 * AUDIT" §3/§6: History must show BOTH archived (completed) and expired
 * (unfinished) drafts, with a visible status badge — an Event expiring
 * must never be presented as if every film were completed.
 */
describe("Draft History — Completed vs Expired status", () => {
  afterEach(cleanup);

  it("shows an archived draft as 'Completed'", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    await repos.drafts.createDraft(
      baseDraft({ id: "archived-draft", status: "archived" }),
    );
    await db.close();

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByText("Previous Drafts")).toBeInTheDocument(),
    );

    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.queryByText("Expired")).not.toBeInTheDocument();
  });

  it("shows an expired (unfinished) draft as 'Expired', never as if it were completed", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    await repos.drafts.createDraft(
      baseDraft({
        id: "expired-draft",
        status: "expired",
        completedAt: null,
        rewardsGrantedAt: null,
      }),
    );
    await db.close();

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByText("Previous Drafts")).toBeInTheDocument(),
    );

    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(screen.queryByText("Completed")).not.toBeInTheDocument();
  });

  it("shows both an archived and an expired draft together, each with its own correct status", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    await repos.drafts.createDraft(
      baseDraft({ id: "archived-draft", status: "archived" }),
    );
    await repos.drafts.createDraft(
      baseDraft({
        id: "expired-draft",
        status: "expired",
        completedAt: null,
        rewardsGrantedAt: null,
        startedAt: "2026-09-01T00:00:00.000Z",
        createdAt: "2026-09-01T00:00:00.000Z",
      }),
    );
    await db.close();

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByText("Previous Drafts")).toBeInTheDocument(),
    );

    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Expired")).toBeInTheDocument();
  });
});

/**
 * Covers docs/updates, "FDRAFT UPDATE 1 — EVENT STATS/HISTORY/PERSISTENCE
 * AUDIT" §5: a category-based Event One At A Time item must show its real
 * category + pick-origin ("Horror · Random"/"Kitsch · Chosen"), never a
 * lossy hardcoded "Random" fallback.
 */
describe("Draft History — Event category/source badges", () => {
  afterEach(cleanup);

  it("shows the compound 'Horror · Random' / 'Kitsch · Chosen' badge for category-based Event One At A Time items", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    await repos.films.create({
      id: "film-1",
      title: "Random Horror Pick",
      releaseYear: 2020,
      letterboxdSlug: null,
      letterboxdUri: null,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    });
    await repos.films.create({
      id: "film-2",
      title: "Chosen Kitsch Pick",
      releaseYear: 2021,
      letterboxdSlug: null,
      letterboxdUri: null,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    });
    await repos.drafts.createDraft(
      baseDraft({
        id: "halloween-oaat-draft",
        difficulty: "one-at-a-time",
        sourceEventId: HALLOWEEN_EVENT_ID,
        sourceEventManuallyEnabled: false,
        totalFilms: 2,
      }),
    );
    await repos.drafts.createItems([
      {
        id: "item-1",
        draftId: "halloween-oaat-draft",
        filmId: "film-1",
        watchlistEntryId: null,
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
        eventCategoryKey: "horror",
        createdAt: "2026-10-01T00:00:00.000Z",
      },
      {
        id: "item-2",
        draftId: "halloween-oaat-draft",
        filmId: "film-2",
        watchlistEntryId: null,
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
        eventCategoryKey: "kitsch",
        createdAt: "2026-10-01T00:00:00.000Z",
      },
    ]);
    await db.close();

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByText("Previous Drafts")).toBeInTheDocument(),
    );
    const user = userEvent.setup();
    await user.click(screen.getByText(/halloween 2026 draft/i));

    expect(screen.getByText("Horror · Random")).toBeInTheDocument();
    expect(screen.getByText("Kitsch · Chosen")).toBeInTheDocument();
    // Never the old, lossy hardcoded fallback for these items.
    expect(screen.queryByText(/^Random$/)).not.toBeInTheDocument();
  });
});

/**
 * Regression coverage for docs/updates, "HALLOWEEN UI CLEANUP" §2: the
 * interactive pumpkin easter egg moved from here to Stats — its positive
 * coverage (shown when joined/active with visuals on) now lives in
 * `stats-view.test.tsx`; this only needs to prove it's genuinely gone from
 * History, even under the exact conditions that used to show it here.
 */
/**
 * Freeform and the "Pick Your Own" (diy) Challenge are retired as creation
 * modes (product simplification — see docs/product-spec.md, "FREEFORM
 * MODE"), but any draft/item already persisted with these values before
 * that change (or restored from an old backup) must keep rendering
 * truthfully in History, never silently relabeled as Random/Chosen.
 */
describe("Draft History — legacy Freeform and Challenge items remain readable", () => {
  afterEach(cleanup);

  it("shows a legacy Freeform draft's generated name and its achieved rank", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    await repos.drafts.createDraft(
      baseDraft({
        id: "legacy-freeform-draft",
        difficulty: "freeform",
        totalFilms: 10,
        randomFilmCount: 10,
        freeformAchievedRank: "medium",
      }),
    );
    await db.close();

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByText("Previous Drafts")).toBeInTheDocument(),
    );

    const summary = screen.getByText(/october freeform draft/i);
    expect(summary).toBeInTheDocument();
    await userEvent.setup().click(summary);

    expect(screen.getByText(/achieved: medium/i)).toBeInTheDocument();
  });

  it("shows a historical item's real 'Challenge: <name>' source, even for the now-removed 'Pick Your Own' challenge id", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    await repos.films.create({
      id: "film-1",
      title: "Chosen Long Ago",
      releaseYear: 2019,
      letterboxdSlug: null,
      letterboxdUri: null,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    });
    await repos.films.create({
      id: "film-2",
      title: "The Eldest Film",
      releaseYear: 1985,
      letterboxdSlug: null,
      letterboxdUri: null,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    });
    await repos.drafts.createDraft(
      baseDraft({
        id: "legacy-challenge-draft",
        totalFilms: 2,
        randomFilmCount: 0,
        challengeFilmCount: 2,
      }),
    );
    await repos.drafts.createItems([
      {
        id: "item-1",
        draftId: "legacy-challenge-draft",
        filmId: "film-1",
        watchlistEntryId: "entry-1",
        source: "challenge",
        challengeId: "diy",
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
        draftId: "legacy-challenge-draft",
        filmId: "film-2",
        watchlistEntryId: "entry-2",
        source: "challenge",
        challengeId: "the-eldest",
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
    const user = userEvent.setup();
    await user.click(screen.getByText(/october baby draft/i));

    // "the-eldest" is still a registered challenge — resolves to its real name.
    expect(screen.getByText("Challenge: The Eldest")).toBeInTheDocument();
    // "diy" ("Pick Your Own") is deleted from the catalogue — falls back to
    // the raw historical id rather than inventing/erasing a label.
    expect(screen.getByText("Challenge: diy")).toBeInTheDocument();
  });
});

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
