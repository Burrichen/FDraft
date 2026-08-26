import { afterEach, describe, expect, it } from "vitest";
import { setEventDateOverride } from "@/application/events/event-date-override-store";
import { beginEventOptIn } from "@/application/events/event-opt-in";
import {
  getEventSettings,
  setEventSettings,
} from "@/application/events/event-settings-store";
import {
  F_YOU_ITS_JANUARY_EVENT_ID,
  HALLOWEEN_EVENT_ID,
} from "@/domain/events/event-registry";
import { FixedClock } from "@/domain/time/clock";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import { createDraftAction } from "./actions";

const PROFILE_ID = "alex";

/**
 * Regression coverage for docs/updates, "EVENT SYSTEM BUGFIX — JANUARY
 * REMAINS ACTIVE DURING HALLOWEEN TESTING": a plain draft's `sourceEventId`
 * (which reward currency its completion awards) must reflect whichever
 * event is genuinely current right now, never a stale `EventSettings.
 * activeEvent` left over from an earlier join.
 */
describe("createDraftAction — sourceEventId reflects genuinely current event, not stale activeEvent", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  async function seedProfileWithWatchlistFilm(databaseName: string) {
    db = new FDraftLocalDatabase(databaseName);
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
    for (let i = 1; i <= 5; i += 1) {
      await repos.films.create({
        id: `film-${i}`,
        title: `Film ${i}`,
        releaseYear: 2020,
        letterboxdSlug: `film-${i}`,
        letterboxdUri: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
      await repos.watchlist.createEntry({
        id: `entry-${i}`,
        profileId: PROFILE_ID,
        filmId: `film-${i}`,
        dateAdded: "2026-01-01",
        position: i - 1,
        isActive: true,
        selectionWeight: 1,
        importSource: null,
        importId: null,
        removedAt: null,
        removedReason: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
    }
    return repos;
  }

  function draftFormData() {
    const formData = new FormData();
    formData.set("difficulty", "baby");
    formData.set("timeMode", "timer");
    formData.set("randomCount", "5");
    formData.set("challengeCount", "0");
    return formData;
  }

  it("a normal draft is NOT tagged with a naturally-joined January while Halloween's window is simulated", async () => {
    const databaseName = crypto.randomUUID();
    const repos = await seedProfileWithWatchlistFilm(databaseName);

    // Naturally join January during its own real window.
    await beginEventOptIn(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        eventId: F_YOU_ITS_JANUARY_EVENT_ID,
      },
      { clock: new FixedClock(new Date("2026-01-28T20:00:00.000Z")) },
    );

    // Now simulate Halloween's window via Admin Event Testing, the same
    // mechanism a real tester uses — `EventSettings.activeEvent` still
    // says "f-you-its-january" (nothing about simulating a different date
    // ever touches it), which is exactly the stale state this bug relied on.
    await setEventDateOverride(repos, PROFILE_ID, {
      enabled: true,
      eventId: HALLOWEEN_EVENT_ID,
      simulatedDate: "2026-10-15T20:00:00.000Z",
    });

    const state = await createDraftAction(
      {
        repositories: repos,
        profileId: PROFILE_ID,
        timezone: "UTC",
        franchiseChronologicalOrder: false,
      },
      { error: null },
      draftFormData(),
    );

    expect(state.error).toBeNull();
    const draft = await repos.drafts.getById(PROFILE_ID, state.draftId!);
    // Not January — January is not currently active. Also not Halloween,
    // since the profile never actually joined Halloween in this test —
    // a plain, un-sourced draft is the only correct outcome.
    expect(draft?.sourceEventId).toBeNull();
  });

  it("a normal draft IS tagged with Halloween once Halloween is genuinely joined and its window is simulated", async () => {
    const databaseName = crypto.randomUUID();
    const repos = await seedProfileWithWatchlistFilm(databaseName);

    await beginEventOptIn(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        eventId: F_YOU_ITS_JANUARY_EVENT_ID,
      },
      { clock: new FixedClock(new Date("2026-01-28T20:00:00.000Z")) },
    );
    await setEventDateOverride(repos, PROFILE_ID, {
      enabled: true,
      eventId: HALLOWEEN_EVENT_ID,
      simulatedDate: "2026-10-15T20:00:00.000Z",
    });
    await beginEventOptIn(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC", eventId: HALLOWEEN_EVENT_ID },
      { clock: new FixedClock(new Date("2026-10-15T20:00:00.000Z")) },
    );

    const state = await createDraftAction(
      {
        repositories: repos,
        profileId: PROFILE_ID,
        timezone: "UTC",
        franchiseChronologicalOrder: false,
      },
      { error: null },
      draftFormData(),
    );

    expect(state.error).toBeNull();
    const draft = await repos.drafts.getById(PROFILE_ID, state.draftId!);
    expect(draft?.sourceEventId).toBe(HALLOWEEN_EVENT_ID);
    expect(draft?.sourceEventManuallyEnabled).toBe(false);
  });

  it("Event Gameplay off: no event is tagged, regardless of activeEvent", async () => {
    const databaseName = crypto.randomUUID();
    const repos = await seedProfileWithWatchlistFilm(databaseName);
    await beginEventOptIn(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC", eventId: HALLOWEEN_EVENT_ID },
      { clock: new FixedClock(new Date("2026-10-15T20:00:00.000Z")) },
    );
    await setEventDateOverride(repos, PROFILE_ID, {
      enabled: true,
      eventId: HALLOWEEN_EVENT_ID,
      simulatedDate: "2026-10-15T20:00:00.000Z",
    });
    const current = await getEventSettings(repos, PROFILE_ID);
    await setEventSettings(repos, PROFILE_ID, {
      ...current,
      eventsEnabled: false,
    });

    const state = await createDraftAction(
      {
        repositories: repos,
        profileId: PROFILE_ID,
        timezone: "UTC",
        franchiseChronologicalOrder: false,
      },
      { error: null },
      draftFormData(),
    );

    expect(state.error).toBeNull();
    const draft = await repos.drafts.getById(PROFILE_ID, state.draftId!);
    expect(draft?.sourceEventId).toBeNull();
  });
});
