import { afterEach, describe, expect, it } from "vitest";
import { setEventDateOverride } from "@/application/events/event-date-override-store";
import {
  getEventDiscovery,
  resolveEventIntroCandidate,
  resolveVisibleEventPages,
} from "@/application/events/event-discovery";
import { getEventParticipations } from "@/application/events/event-participation-store";
import {
  beginEventOptIn,
  declineEventOccurrence,
} from "@/application/events/event-opt-in";
import { getEventSettings } from "@/application/events/event-settings-store";
import { HALLOWEEN_EVENT_ID } from "@/domain/events/event-registry";
import { FixedClock } from "@/domain/time/clock";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import type { DraftRecord } from "@/repositories/records";

function halloweenDraft(overrides: Partial<DraftRecord> = {}): DraftRecord {
  return {
    id: "halloween-draft-1",
    profileId: "alex",
    difficulty: "baby",
    timeMode: "timer",
    status: "active",
    totalFilms: 5,
    randomFilmCount: 5,
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

/**
 * Integration coverage for docs/updates, "EVENT LIFECYCLE REPAIR" — the
 * application-layer half of the explicit TESTS list (the React-level half
 * — "modal appears from Watchlist/Drafts/Stats route," "Join immediately
 * creates nav/page" — lives in `event-intro-dialog.test.tsx` and
 * `event-switcher-halloween-nav-integration.test.tsx`).
 */
describe("Event Lifecycle Repair — occurrence-based discovery", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  const PROFILE_ID = "alex";

  async function seedProfile(databaseName: string) {
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
        adminMode: false,
        halloweenPumpkinState: "uncarved",
      },
      dataVersion: 1,
    });
    return repos;
  }

  it("30 Sep 18:59 — Halloween's occurrence is inactive: no nav page, no intro candidate", async () => {
    const repos = await seedProfile(crypto.randomUUID());
    const clock = new FixedClock(new Date("2026-09-30T18:59:00.000Z"));
    const { statuses } = await getEventDiscovery(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock },
    );
    const halloween = statuses.find((s) => s.event.id === HALLOWEEN_EVENT_ID)!;
    expect(halloween.available).toBe(false);
    expect(resolveVisibleEventPages(statuses)).toHaveLength(0);
    expect(resolveEventIntroCandidate(statuses)).toBeNull();
  });

  it("30 Sep 19:00 — Halloween's occurrence is active: an intro candidate is offered", async () => {
    const repos = await seedProfile(crypto.randomUUID());
    const clock = new FixedClock(new Date("2026-09-30T19:00:00.000Z"));
    const { statuses } = await getEventDiscovery(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock },
    );
    const halloween = statuses.find((s) => s.event.id === HALLOWEEN_EVENT_ID)!;
    expect(halloween.available).toBe(true);
    expect(resolveEventIntroCandidate(statuses)?.event.id).toBe(
      HALLOWEEN_EVENT_ID,
    );
  });

  it("joining immediately creates the nav-visible occurrence status — never dependent on a Draft existing", async () => {
    const repos = await seedProfile(crypto.randomUUID());
    const clock = new FixedClock(new Date("2026-10-15T12:00:00.000Z"));

    let discovery = await getEventDiscovery(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock },
    );
    expect(resolveVisibleEventPages(discovery.statuses)).toHaveLength(0);

    await beginEventOptIn(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC", eventId: HALLOWEEN_EVENT_ID },
      { clock },
    );

    discovery = await getEventDiscovery(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock },
    );
    const visible = resolveVisibleEventPages(discovery.statuses);
    expect(visible).toHaveLength(1);
    expect(visible[0]?.event.id).toBe(HALLOWEEN_EVENT_ID);

    // No Draft was created by joining — a completely separate action.
    expect(
      await repos.drafts.getActiveOrExpiredDraft(
        PROFILE_ID,
        HALLOWEEN_EVENT_ID,
      ),
    ).toBeNull();
  });

  it("creating a Halloween Draft does not itself register or unregister the occurrence — it was already joined, and stays joined", async () => {
    const repos = await seedProfile(crypto.randomUUID());
    const clock = new FixedClock(new Date("2026-10-15T12:00:00.000Z"));
    await beginEventOptIn(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC", eventId: HALLOWEEN_EVENT_ID },
      { clock },
    );

    // A Draft record created directly (the exact record shape
    // `createHalloweenLocalDraft` itself would produce) — what matters
    // here is registration/visibility, not drafting mechanics, which are
    // already covered exhaustively in `halloween-draft-service.test.ts`.
    await repos.drafts.createDraft(halloweenDraft());

    const discovery = await getEventDiscovery(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock },
    );
    expect(resolveVisibleEventPages(discovery.statuses)).toHaveLength(1);
  });

  it("a completed (archived) Draft does not remove the joined occurrence prematurely — the page stays registered for the rest of the window", async () => {
    const repos = await seedProfile(crypto.randomUUID());
    const clock = new FixedClock(new Date("2026-10-15T12:00:00.000Z"));
    await beginEventOptIn(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC", eventId: HALLOWEEN_EVENT_ID },
      { clock },
    );
    const draft = halloweenDraft();
    await repos.drafts.createDraft(draft);
    await repos.drafts.updateDraft({
      ...draft,
      status: "archived",
      completedAt: "2026-10-20T00:00:00.000Z",
    });

    const discovery = await getEventDiscovery(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock },
    );
    expect(resolveVisibleEventPages(discovery.statuses)).toHaveLength(1);
  });

  it("Admin's simulated EventClock date drives the exact same lifecycle as the real clock — no separate Event-enabling path", async () => {
    const repos = await seedProfile(crypto.randomUUID());
    const profile = await repos.profiles.getById(PROFILE_ID);
    await repos.profiles.update({
      ...profile!,
      settings: { ...profile!.settings, adminMode: true },
    });
    await setEventDateOverride(repos, PROFILE_ID, {
      enabled: true,
      eventId: HALLOWEEN_EVENT_ID,
      simulatedDate: "2026-10-15T12:00:00.000Z",
    });

    // The REAL clock passed in is nowhere near Halloween — only the Admin
    // override (consulted internally via `getEffectiveEventDate`) should
    // matter, exactly like the real, un-simulated lifecycle would behave
    // on the date it actually simulates.
    const realClock = new FixedClock(new Date("2026-03-01T00:00:00.000Z"));
    const discovery = await getEventDiscovery(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock: realClock },
    );
    const halloween = discovery.statuses.find(
      (s) => s.event.id === HALLOWEEN_EVENT_ID,
    )!;
    expect(halloween.available).toBe(true);
    expect(resolveEventIntroCandidate(discovery.statuses)?.event.id).toBe(
      HALLOWEEN_EVENT_ID,
    );
  });

  it("restart persistence — joined/declined state survives a fresh database instance (simulating an app restart)", async () => {
    const databaseName = crypto.randomUUID();
    const repos = await seedProfile(databaseName);
    const clock = new FixedClock(new Date("2026-10-15T12:00:00.000Z"));
    await beginEventOptIn(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC", eventId: HALLOWEEN_EVENT_ID },
      { clock },
    );
    await db.close();

    // A brand-new FDraftLocalDatabase instance against the SAME underlying
    // database — exactly what reopening the app does.
    const reopened = new FDraftLocalDatabase(databaseName);
    const reopenedRepos = createLocalRepositories(reopened);
    const discovery = await getEventDiscovery(
      reopenedRepos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock },
    );
    expect(resolveVisibleEventPages(discovery.statuses)).toHaveLength(1);
    await reopened.close();
    db = reopened;
  });

  it("profile isolation — one profile's join/decline never affects another's occurrence status", async () => {
    const databaseName = crypto.randomUUID();
    db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    for (const id of ["alex", "sam"]) {
      await repos.profiles.create({
        id,
        displayName: id,
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
    }
    const clock = new FixedClock(new Date("2026-10-15T12:00:00.000Z"));
    await beginEventOptIn(
      repos,
      { profileId: "alex", timezone: "UTC", eventId: HALLOWEEN_EVENT_ID },
      { clock },
    );

    const alexDiscovery = await getEventDiscovery(
      repos,
      { profileId: "alex", timezone: "UTC" },
      { clock },
    );
    const samDiscovery = await getEventDiscovery(
      repos,
      { profileId: "sam", timezone: "UTC" },
      { clock },
    );
    expect(resolveVisibleEventPages(alexDiscovery.statuses)).toHaveLength(1);
    expect(resolveVisibleEventPages(samDiscovery.statuses)).toHaveLength(0);

    const alexParticipations = await getEventParticipations(repos, "alex");
    const samParticipations = await getEventParticipations(repos, "sam");
    expect(alexParticipations[`${HALLOWEEN_EVENT_ID}:2026`]).toBe("joined");
    expect(samParticipations[`${HALLOWEEN_EVENT_ID}:2026`]).toBeUndefined();
  });

  it("declining suppresses the modal for the same occurrence but not gameplay-eligibility elsewhere; a next-year occurrence starts unanswered", async () => {
    const repos = await seedProfile(crypto.randomUUID());
    await declineEventOccurrence(repos, {
      profileId: PROFILE_ID,
      occurrenceKey: `${HALLOWEEN_EVENT_ID}:2026`,
    });

    const clock2026 = new FixedClock(new Date("2026-10-15T12:00:00.000Z"));
    const discovery2026 = await getEventDiscovery(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock: clock2026 },
    );
    expect(resolveEventIntroCandidate(discovery2026.statuses)).toBeNull();

    const clock2027 = new FixedClock(new Date("2027-10-15T12:00:00.000Z"));
    const discovery2027 = await getEventDiscovery(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock: clock2027 },
    );
    const halloween2027 = discovery2027.statuses.find(
      (s) => s.event.id === HALLOWEEN_EVENT_ID,
    )!;
    expect(halloween2027.occurrenceKey).toBe(`${HALLOWEEN_EVENT_ID}:2027`);
    expect(halloween2027.participation).toBe("unanswered");
    expect(resolveEventIntroCandidate(discovery2027.statuses)?.event.id).toBe(
      HALLOWEEN_EVENT_ID,
    );

    // Settings/Gameplay eligibility is a separate concern from the
    // occurrence decline — declining the modal never touches EventSettings
    // (see docs/updates, "EVENT LIFECYCLE REPAIR" §9).
    const settings = await getEventSettings(repos, PROFILE_ID);
    expect(settings.activeEvent).toBeNull();
  });
});
