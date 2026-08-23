import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalDraft } from "@/application/drafts/local-draft-service";
import { setEventDateOverride } from "@/application/events/event-date-override-store";
import {
  applyEventOptIn,
  beginEventOptIn,
} from "@/application/events/event-opt-in";
import { getEventSettings } from "@/application/events/event-settings-store";
import {
  F_YOU_ITS_JANUARY_EVENT_ID,
  HALLOWEEN_EVENT_ID,
  WATCHLIST_FRONTIER_EVENT_ID,
} from "@/domain/events/event-registry";
import { FixedClock } from "@/domain/time/clock";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import type { Repositories } from "@/repositories";

const PROFILE_ID = "alex";
const IN_JANUARY = new FixedClock(new Date("2026-01-27T00:00:00.000Z"));
const OUTSIDE_JANUARY = new FixedClock(new Date("2026-06-15T00:00:00.000Z"));

async function seedActiveFilms(repos: Repositories, count: number) {
  for (let i = 0; i < count; i++) {
    const filmId = `film-${i}`;
    await repos.films.create({
      id: filmId,
      title: `Film ${i}`,
      releaseYear: 2000 + i,
      letterboxdSlug: `film-${i}`,
      letterboxdUri: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await repos.watchlist.createEntry({
      id: `entry-${i}`,
      profileId: PROFILE_ID,
      filmId,
      dateAdded: "2026-01-01",
      position: i,
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
}

describe("beginEventOptIn / applyEventOptIn", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("in January, applies the opt-in immediately as a normal (non-manual) activation", async () => {
    db = new FDraftLocalDatabase(`event-optin-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    const result = await beginEventOptIn(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock: IN_JANUARY },
    );
    expect(result).toEqual({ eventId: F_YOU_ITS_JANUARY_EVENT_ID });

    const settings = await getEventSettings(repos, PROFILE_ID);
    expect(settings.eventsEnabled).toBe(true);
    expect(settings.activeEvent).toBe(F_YOU_ITS_JANUARY_EVENT_ID);
    expect(settings.manuallyEnabledEvents).toEqual([]);
  });

  it("outside January, with no explicit target and nothing naturally active, is a no-op (PROMPT B2.1: no more auto-pick-a-manual-event fallback)", async () => {
    db = new FDraftLocalDatabase(`event-optin-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    const result = await beginEventOptIn(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock: OUTSIDE_JANUARY },
    );
    expect(result).toEqual({ eventId: null });

    const settings = await getEventSettings(repos, PROFILE_ID);
    expect(settings.eventsEnabled).toBe(false);
    expect(settings.activeEvent).toBeNull();
  });

  it("opting into an event never touches the profile's active normal Draft (PROMPT B2.1 §1 — no more 'Say Goodbye')", async () => {
    db = new FDraftLocalDatabase(`event-optin-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 3);
    const created = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 3,
        challengeCount: 0,
      },
    });
    if (!created.ok) throw new Error("unreachable");

    const result = await beginEventOptIn(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock: IN_JANUARY },
    );
    expect(result).toEqual({ eventId: F_YOU_ITS_JANUARY_EVENT_ID });

    // The normal draft is completely untouched — still active, still a
    // normal (non-event) draft, no rewards granted.
    const draft = await repos.drafts.getById(PROFILE_ID, created.draftId);
    expect(draft?.status).toBe("active");
    expect(draft?.sourceEventId).toBeNull();
    expect(draft?.rewardsGrantedAt).toBeNull();

    const settings = await getEventSettings(repos, PROFILE_ID);
    expect(settings.eventsEnabled).toBe(true);
    expect(settings.activeEvent).toBe(F_YOU_ITS_JANUARY_EVENT_ID);
  });

  it("applyEventOptIn sets eventsEnabled + activeEvent, preserving other event settings", async () => {
    db = new FDraftLocalDatabase(`event-optin-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await repos.settings.set(PROFILE_ID, "events.settings", {
      eventsEnabled: false,
      eventVisualsEnabled: true,
      activeEvent: null,
      manuallyEnabledEvents: ["some-other-event"],
    });

    await applyEventOptIn(repos, {
      profileId: PROFILE_ID,
      eventId: F_YOU_ITS_JANUARY_EVENT_ID,
      manuallyEnabled: false,
    });

    expect(await getEventSettings(repos, PROFILE_ID)).toEqual({
      eventsEnabled: true,
      eventVisualsEnabled: true,
      activeEvent: F_YOU_ITS_JANUARY_EVENT_ID,
      manuallyEnabledEvents: ["some-other-event"],
    });
  });

  it("applyEventOptIn adds the event to manuallyEnabledEvents exactly once when manuallyEnabled is true, even called twice", async () => {
    db = new FDraftLocalDatabase(`event-optin-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    await applyEventOptIn(repos, {
      profileId: PROFILE_ID,
      eventId: F_YOU_ITS_JANUARY_EVENT_ID,
      manuallyEnabled: true,
    });
    await applyEventOptIn(repos, {
      profileId: PROFILE_ID,
      eventId: F_YOU_ITS_JANUARY_EVENT_ID,
      manuallyEnabled: true,
    });

    const settings = await getEventSettings(repos, PROFILE_ID);
    expect(settings.manuallyEnabledEvents).toEqual([
      F_YOU_ITS_JANUARY_EVENT_ID,
    ]);
  });
});

describe("beginEventOptIn — targeting a specific event by id", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("opts into The Watchlist Frontier specifically via its manual-activation fallback — it has no natural window at all, and isn't reachable through today's UI, but a direct/explicit request still works", async () => {
    db = new FDraftLocalDatabase(`event-optin-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    const result = await beginEventOptIn(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        eventId: WATCHLIST_FRONTIER_EVENT_ID,
      },
      { clock: OUTSIDE_JANUARY },
    );

    expect(result).toEqual({ eventId: WATCHLIST_FRONTIER_EVENT_ID });
    const settings = await getEventSettings(repos, PROFILE_ID);
    expect(settings.activeEvent).toBe(WATCHLIST_FRONTIER_EVENT_ID);
    expect(settings.manuallyEnabledEvents).toEqual([
      WATCHLIST_FRONTIER_EVENT_ID,
    ]);
  });

  it("a stale/unknown requested event id fails safely — no settings change, no crash", async () => {
    db = new FDraftLocalDatabase(`event-optin-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    const result = await beginEventOptIn(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        eventId: "not-a-real-event",
      },
      { clock: OUTSIDE_JANUARY },
    );

    expect(result).toEqual({ eventId: null });
    const settings = await getEventSettings(repos, PROFILE_ID);
    expect(settings.eventsEnabled).toBe(false);
    expect(settings.activeEvent).toBeNull();
  });

  it("requesting January specifically while it is naturally active still resolves manuallyEnabled: false, matching auto-pick", async () => {
    db = new FDraftLocalDatabase(`event-optin-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    const result = await beginEventOptIn(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        eventId: F_YOU_ITS_JANUARY_EVENT_ID,
      },
      { clock: IN_JANUARY },
    );

    expect(result).toEqual({ eventId: F_YOU_ITS_JANUARY_EVENT_ID });
    const settings = await getEventSettings(repos, PROFILE_ID);
    expect(settings.manuallyEnabledEvents).toEqual([]);
  });
});

describe("beginEventOptIn — Halloween: manualActivationAllowed: false (PROMPT 18)", () => {
  let db: FDraftLocalDatabase;
  const IN_HALLOWEEN = new FixedClock(new Date("2026-10-15T20:00:00.000Z"));
  const OUTSIDE_HALLOWEEN = new FixedClock(
    new Date("2026-06-15T00:00:00.000Z"),
  );

  afterEach(async () => {
    await db?.delete();
  });

  it("succeeds when naturally available, and is never recorded as manually enabled", async () => {
    db = new FDraftLocalDatabase(`event-optin-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    const result = await beginEventOptIn(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        eventId: HALLOWEEN_EVENT_ID,
      },
      { clock: IN_HALLOWEEN },
    );

    expect(result).toEqual({ eventId: HALLOWEEN_EVENT_ID });
    const settings = await getEventSettings(repos, PROFILE_ID);
    expect(settings.activeEvent).toBe(HALLOWEEN_EVENT_ID);
    expect(settings.manuallyEnabledEvents).not.toContain(HALLOWEEN_EVENT_ID);
    // Joining Halloween specifically also force-enables Event Visuals by
    // default (see `EventDefinition.enableVisualsOnOptIn`) — unique to
    // Halloween; no other event does this.
    expect(settings.eventVisualsEnabled).toBe(true);
  });

  it("fails — no settings change — when requested outside its natural window with no Admin override", async () => {
    db = new FDraftLocalDatabase(`event-optin-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    const result = await beginEventOptIn(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        eventId: HALLOWEEN_EVENT_ID,
      },
      { clock: OUTSIDE_HALLOWEEN },
    );

    expect(result).toEqual({ eventId: null });
    const settings = await getEventSettings(repos, PROFILE_ID);
    expect(settings.eventsEnabled).toBe(false);
    expect(settings.activeEvent).toBeNull();
  });

  it("succeeds outside the real window when Admin Mode's Event Test Switcher simulates a date inside it", async () => {
    db = new FDraftLocalDatabase(`event-optin-${crypto.randomUUID()}`);
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
    await setEventDateOverride(repos, PROFILE_ID, {
      enabled: true,
      eventId: HALLOWEEN_EVENT_ID,
      simulatedDate: "2026-10-15T20:00:00.000Z",
    });

    // The real clock is OUTSIDE Halloween's window — only the Admin
    // override, resolved via `getEffectiveEventDate` inside
    // `beginEventOptIn` itself (using its default `SystemClock`, not an
    // injected `FixedClock`), should make this succeed. Pinned via fake
    // timers so this doesn't depend on whatever date the suite happens to
    // run on.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(OUTSIDE_HALLOWEEN.now());
    try {
      const result = await beginEventOptIn(repos, {
        profileId: PROFILE_ID,
        timezone: "UTC",
        eventId: HALLOWEEN_EVENT_ID,
      });

      expect(result).toEqual({ eventId: HALLOWEEN_EVENT_ID });
      const settings = await getEventSettings(repos, PROFILE_ID);
      expect(settings.activeEvent).toBe(HALLOWEEN_EVENT_ID);
    } finally {
      vi.useRealTimers();
    }
  });
});
