import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
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
      <DraftHistoryPage />
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
    const summary = screen.getByText(/october baby draft/i);
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

    expect(screen.getAllByText(/october baby draft/i)).toHaveLength(2);
    expect(screen.getByText("Halloween")).toBeInTheDocument();
  });
});
