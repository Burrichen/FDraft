import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventDiscoveryProvider } from "@/components/events/event-discovery-provider";
import { ProfileProvider } from "@/components/profiles/profile-provider";
import { WatchUndoProvider } from "@/components/watch-undo/watch-undo-provider";
import {
  resetEventCategoryFilmIdsForTests,
  setEventCategoryFilmIds,
} from "@/domain/events/event-category-manifest-overlay";
import { F_YOU_ITS_JANUARY_EVENT_ID } from "@/domain/events/event-registry";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import type { DraftItemRecord, DraftRecord } from "@/repositories/records";
import { JanuaryPageClient } from "./january-page-client";

const PROFILE_ID = "alex";
const IN_JANUARY = new Date("2026-01-28T12:00:00.000Z");

function Harness({ databaseName }: { databaseName: string }) {
  return (
    <ProfileProvider databaseName={databaseName}>
      <EventDiscoveryProvider>
        <WatchUndoProvider>
          <JanuaryPageClient />
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
    activeEvent: F_YOU_ITS_JANUARY_EVENT_ID,
    manuallyEnabledEvents: [],
  });
  await repos.settings.set(PROFILE_ID, "events.participations", {
    [`${F_YOU_ITS_JANUARY_EVENT_ID}:2026`]: "joined",
  });
  await db.close();
}

/** The already-rolled one-film January Draft a joined profile always has. */
async function seedRolledJanuaryDraft(
  databaseName: string,
  overrides: Partial<DraftRecord> = {},
) {
  const db = new FDraftLocalDatabase(databaseName);
  const repos = createLocalRepositories(db);
  await repos.films.create({
    id: "january-film-1",
    title: "Norm of the North",
    releaseYear: 2016,
    letterboxdSlug: null,
    letterboxdUri: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  const draft: DraftRecord = {
    id: "january-draft-1",
    profileId: PROFILE_ID,
    difficulty: "one-at-a-time",
    timeMode: "timer",
    status: "active",
    totalFilms: 1,
    randomFilmCount: 1,
    challengeFilmCount: 0,
    challengeMode: null,
    startedAt: "2026-01-26T12:00:00.000Z",
    deadlineAt: "2026-02-01T00:00:00.000Z",
    timezone: "UTC",
    completedAt: null,
    freeformAchievedRank: null,
    sourceEventId: F_YOU_ITS_JANUARY_EVENT_ID,
    sourceEventManuallyEnabled: false,
    rewardsGrantedAt: null,
    eventOccurrenceYear: 2026,
    customName: null,
    createdAt: "2026-01-26T12:00:00.000Z",
    updatedAt: "2026-01-26T12:00:00.000Z",
    ...overrides,
  };
  await repos.drafts.createDraft(draft);
  const item: DraftItemRecord = {
    id: "january-item-1",
    draftId: draft.id,
    filmId: "january-film-1",
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
    createdAt: "2026-01-26T12:00:00.000Z",
  };
  await repos.drafts.createItems([item]);
  await db.close();
}

/**
 * Covers the UI half of docs/updates, "FDRAFT UPDATE 1 — F* YOU, IT'S
 * JANUARY: SIMPLE EVENT MECHANICS" §17 — §10's page content, and the
 * §4/§16 guarantee that NONE of the Draft-builder machinery (difficulty,
 * sliders, category allocation, Challenges, One At A Time, Pick Your Own)
 * appears anywhere on it. The mechanic itself (join → one roll,
 * idempotency, occurrence scoping) is covered in
 * `single-film-event-draft.test.ts`.
 */
describe("JanuaryPageClient", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    resetEventCategoryFilmIdsForTests();
  });

  it("shows January's identity, the fixed Event deadline, and the rolled film directly — no creation step", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    await seedRolledJanuaryDraft(databaseName);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(IN_JANUARY);

    render(<Harness databaseName={databaseName} />);

    expect(
      await screen.findByRole("heading", { name: /F\* You, It's January!/ }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Event ends 31 January at midnight"),
    ).toBeInTheDocument();
    // The rolled film, with its normal metadata presentation.
    expect(await screen.findByText("Norm of the North")).toBeInTheDocument();
    // The canonical occurrence Draft name, never "January Baby Draft".
    expect(
      screen.getByText(/F\* You, It's January! 2026 Draft/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/January Baby Draft/)).not.toBeInTheDocument();
  });

  it("shows NO difficulty, slider, category, Challenge, One At A Time or Pick Your Own controls at all", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    await seedRolledJanuaryDraft(databaseName);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(IN_JANUARY);

    render(<Harness databaseName={databaseName} />);

    // Wait for the Draft itself to render — asserting absence before the
    // page has finished loading would pass for the wrong reason.
    expect(await screen.findByText("Norm of the North")).toBeInTheDocument();

    for (const forbidden of [
      /choose a difficulty/i,
      /how do you want the list to be made/i,
      /how do you want to build this draft/i,
      /challenge films/i,
      /choose my challenge/i,
      /decide my challenge for me/i,
      /one at a time/i,
      /choose my own/i,
      /pick your own/i,
      /which category should we draw from/i,
      /which category do you want to choose from/i,
      /create draft/i,
      /create january draft/i,
      /^random$/i,
      /^reroll$/i,
      /calendar mode/i,
      /timer mode/i,
    ]) {
      expect(
        screen.queryByText(forbidden),
        `"${forbidden}" must not appear on the January page`,
      ).not.toBeInTheDocument();
    }
    // No range inputs (the linked sliders) anywhere.
    expect(document.querySelectorAll('input[type="range"]')).toHaveLength(0);
    // "N films selected"-style builder chrome is likewise absent.
    expect(screen.queryByText(/films selected/i)).not.toBeInTheDocument();
  });

  it("offers no way to change the rolled film — not even under Admin Mode", async () => {
    // §6, "Do NOT add a new user-facing reroll feature". These controls
    // are all Admin-gated and predate this mechanic, but they were the
    // paths in the app that could quietly re-roll or hand-pick January's
    // film, which the Event's whole joke depends on being impossible.
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName, { adminMode: true });
    await seedRolledJanuaryDraft(databaseName);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(IN_JANUARY);

    render(<Harness databaseName={databaseName} />);

    expect(await screen.findByText("Norm of the North")).toBeInTheDocument();
    for (const forbidden of [
      /re-roll/i,
      /replace/i,
      /choose a different/i,
      /regenerate/i,
    ]) {
      expect(
        screen.queryByRole("button", { name: forbidden }),
        `"${forbidden}" must not be offered for January's one film`,
      ).not.toBeInTheDocument();
    }
  });

  it("offers a Join button — never a Draft-builder — when the profile hasn't joined this occurrence", async () => {
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
        adminMode: false,
        halloweenPumpkinState: "uncarved",
      },
      dataVersion: 1,
    });
    await db.close();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(IN_JANUARY);

    render(<Harness databaseName={databaseName} />);

    await waitFor(() =>
      expect(screen.getByText("Available now")).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Opt In" })).toBeInTheDocument();
    expect(screen.queryByText(/choose a difficulty/i)).not.toBeInTheDocument();
  });

  it("shows 'Returns <date>' outside the window for a profile that never joined", async () => {
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
        adminMode: false,
        halloweenPumpkinState: "uncarved",
      },
      dataVersion: 1,
    });
    await db.close();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"));

    render(<Harness databaseName={databaseName} />);

    await waitFor(() =>
      expect(screen.getByText("Not currently active")).toBeInTheDocument(),
    );
    expect(screen.getByText(/Returns 25 January/)).toBeInTheDocument();
  });

  it("applies the scoped January theme, never Halloween's", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    await seedRolledJanuaryDraft(databaseName);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(IN_JANUARY);

    const { container } = render(<Harness databaseName={databaseName} />);

    expect(await screen.findByText("Norm of the North")).toBeInTheDocument();
    expect(container.querySelector(".theme-january")).not.toBeNull();
    expect(container.querySelector(".theme-halloween")).toBeNull();
  });

  it("a joined profile with no rolled Draft gets a repair action, not a Draft builder", async () => {
    // Only reachable for a profile that joined before this mechanic
    // existed, or whose curated pool hadn't resolved yet (see
    // `JanuaryPageClient`'s own doc comment).
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    setEventCategoryFilmIds(F_YOU_ITS_JANUARY_EVENT_ID, { curated: [] });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(IN_JANUARY);

    render(<Harness databaseName={databaseName} />);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Ask January for my film" }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText(/choose a difficulty/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /create draft/i }),
    ).not.toBeInTheDocument();
  });
});
