import { afterEach, describe, expect, it } from "vitest";
import { createLocalDraft } from "@/application/drafts/local-draft-service";
import {
  applyEventOptIn,
  beginEventOptIn,
  confirmSayGoodbye,
} from "@/application/events/event-opt-in";
import { getEventSettings } from "@/application/events/event-settings-store";
import {
  F_YOU_ITS_JANUARY_EVENT_ID,
  HALLOWEEN_EVENT_ID,
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

describe("beginEventOptIn / applyEventOptIn / confirmSayGoodbye", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("in January, with no active draft, applies the opt-in immediately as a normal (non-manual) activation", async () => {
    db = new FDraftLocalDatabase(`event-optin-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    const result = await beginEventOptIn(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock: IN_JANUARY },
    );
    expect(result).toEqual({
      needsSayGoodbye: false,
      eventId: F_YOU_ITS_JANUARY_EVENT_ID,
    });

    const settings = await getEventSettings(repos, PROFILE_ID);
    expect(settings.eventsEnabled).toBe(true);
    expect(settings.activeEvent).toBe(F_YOU_ITS_JANUARY_EVENT_ID);
    expect(settings.manuallyEnabledEvents).toEqual([]);
  });

  it("outside January, with no active draft, applies the opt-in immediately as a manual activation", async () => {
    db = new FDraftLocalDatabase(`event-optin-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    const result = await beginEventOptIn(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock: OUTSIDE_JANUARY },
    );
    expect(result).toEqual({
      needsSayGoodbye: false,
      eventId: F_YOU_ITS_JANUARY_EVENT_ID,
    });

    const settings = await getEventSettings(repos, PROFILE_ID);
    expect(settings.eventsEnabled).toBe(true);
    expect(settings.activeEvent).toBe(F_YOU_ITS_JANUARY_EVENT_ID);
    expect(settings.manuallyEnabledEvents).toEqual([
      F_YOU_ITS_JANUARY_EVENT_ID,
    ]);
  });

  it("with an active draft, never touches event settings — reports needsSayGoodbye and which event/manual-ness instead", async () => {
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
    expect(result).toEqual({
      needsSayGoodbye: true,
      activeDraftId: created.draftId,
      eventId: F_YOU_ITS_JANUARY_EVENT_ID,
      manuallyEnabled: false,
    });

    const settings = await getEventSettings(repos, PROFILE_ID);
    expect(settings.eventsEnabled).toBe(false);
  });

  it("confirmSayGoodbye settles/discards the outgoing draft and completes the opt-in", async () => {
    db = new FDraftLocalDatabase(`event-optin-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 2);
    const created = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 2,
        challengeCount: 0,
      },
    });
    if (!created.ok) throw new Error("unreachable");

    const begin = await beginEventOptIn(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock: IN_JANUARY },
    );
    if (!begin.needsSayGoodbye) throw new Error("unreachable");

    await confirmSayGoodbye(repos, {
      profileId: PROFILE_ID,
      draftId: begin.activeDraftId,
      eventId: begin.eventId,
      manuallyEnabled: begin.manuallyEnabled,
    });

    // The outgoing draft is discarded and never assigned to the incoming event.
    const draft = await repos.drafts.getById(PROFILE_ID, created.draftId);
    expect(draft?.status).toBe("discarded");
    expect(draft?.sourceEventId).toBeNull();
    expect(draft?.rewardsGrantedAt).not.toBeNull();

    const settings = await getEventSettings(repos, PROFILE_ID);
    expect(settings.eventsEnabled).toBe(true);
    expect(settings.activeEvent).toBe(F_YOU_ITS_JANUARY_EVENT_ID);
  });

  it("cancelling (never calling confirmSayGoodbye) leaves the draft active and the event off", async () => {
    db = new FDraftLocalDatabase(`event-optin-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 1);
    const created = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 1,
        challengeCount: 0,
      },
    });
    if (!created.ok) throw new Error("unreachable");

    await beginEventOptIn(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock: IN_JANUARY },
    );
    // No confirmSayGoodbye call — this is what "Cancel" is: doing nothing.

    const draft = await repos.drafts.getById(PROFILE_ID, created.draftId);
    expect(draft?.status).toBe("active");
    const settings = await getEventSettings(repos, PROFILE_ID);
    expect(settings.eventsEnabled).toBe(false);
    expect(settings.activeEvent).toBeNull();
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

describe("beginEventOptIn — targeting a specific event by id (audit fix: Settings' displayed event must be the one that actually activates)", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("opts into Halloween specifically, even though it is not the first manually-activatable event in the registry", async () => {
    db = new FDraftLocalDatabase(`event-optin-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    const result = await beginEventOptIn(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC", eventId: HALLOWEEN_EVENT_ID },
      { clock: OUTSIDE_JANUARY },
    );

    expect(result).toEqual({
      needsSayGoodbye: false,
      eventId: HALLOWEEN_EVENT_ID,
    });
    const settings = await getEventSettings(repos, PROFILE_ID);
    expect(settings.activeEvent).toBe(HALLOWEEN_EVENT_ID);
    expect(settings.manuallyEnabledEvents).toEqual([HALLOWEEN_EVENT_ID]);
    // January — the registry's first entry — must NOT have been the one
    // silently activated instead.
    expect(settings.manuallyEnabledEvents).not.toContain(
      F_YOU_ITS_JANUARY_EVENT_ID,
    );
  });

  it("with an active draft, Say Goodbye reports the SPECIFIC requested event, not whichever one auto-pick would have chosen", async () => {
    db = new FDraftLocalDatabase(`event-optin-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 1);
    const created = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 1,
        challengeCount: 0,
      },
    });
    if (!created.ok) throw new Error("unreachable");

    const result = await beginEventOptIn(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC", eventId: HALLOWEEN_EVENT_ID },
      { clock: OUTSIDE_JANUARY },
    );

    expect(result).toEqual({
      needsSayGoodbye: true,
      activeDraftId: created.draftId,
      eventId: HALLOWEEN_EVENT_ID,
      manuallyEnabled: true,
    });
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

    expect(result).toEqual({ needsSayGoodbye: false, eventId: null });
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

    expect(result).toEqual({
      needsSayGoodbye: false,
      eventId: F_YOU_ITS_JANUARY_EVENT_ID,
    });
    const settings = await getEventSettings(repos, PROFILE_ID);
    expect(settings.manuallyEnabledEvents).toEqual([]);
  });
});
