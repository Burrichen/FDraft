import { afterEach, describe, expect, it } from "vitest";
import { archiveLocalDraftIfResolved } from "@/application/drafts/local-draft-service";
import {
  getEventDiscovery,
  isOccurrenceExpired,
  resolveEventEndingCandidate,
} from "@/application/events/event-discovery";
import { setEventDateOverride } from "@/application/events/event-date-override-store";
import { finalizeExpiredEventDraftIfNeeded } from "@/application/events/event-draft-finalization";
import { acknowledgeEventEnding } from "@/application/events/event-ending-acknowledgement-store";
import { setEventParticipation } from "@/application/events/event-participation-store";
import { markLocalDraftItemWatchedWithoutEntry } from "@/application/watchlist/local-watchlist-service";
import { HALLOWEEN_EVENT_ID } from "@/domain/events/event-registry";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import type { DraftItemRecord, DraftRecord } from "@/repositories/records";
import type { Repositories } from "@/repositories";

const PROFILE_ID = "alex";
const TIMEZONE = "UTC";

function baseDraft(overrides: Partial<DraftRecord> = {}): DraftRecord {
  return {
    id: "halloween-draft-1",
    profileId: PROFILE_ID,
    difficulty: "baby",
    timeMode: "timer",
    status: "active",
    totalFilms: 2,
    randomFilmCount: 2,
    challengeFilmCount: 0,
    challengeMode: null,
    startedAt: "2026-10-01T00:00:00.000Z",
    deadlineAt: "2026-11-01T00:00:00.000Z",
    timezone: TIMEZONE,
    completedAt: null,
    freeformAchievedRank: null,
    sourceEventId: HALLOWEEN_EVENT_ID,
    sourceEventManuallyEnabled: false,
    rewardsGrantedAt: null,
    customName: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

function baseItem(
  overrides: Partial<DraftItemRecord> & { id: string; filmId: string },
): DraftItemRecord {
  return {
    draftId: "halloween-draft-1",
    watchlistEntryId: null,
    source: "halloween-adjacent",
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
    ...overrides,
  };
}

async function seedJoinedProfile(repos: Repositories, simulatedDate: string) {
  await repos.profiles.create({
    id: PROFILE_ID,
    displayName: "Alex",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastOpenedAt: "2026-01-01T00:00:00.000Z",
    timezone: TIMEZONE,
    settings: {
      reducedMotion: false,
      defaultPage: "watchlist",
      franchiseChronologicalOrder: false,
      adminMode: true,
      halloweenPumpkinState: "uncarved",
    },
    dataVersion: 1,
  });
  await setEventParticipation(repos, PROFILE_ID, "halloween:2026", "joined");
  await setEventDateOverride(repos, PROFILE_ID, {
    enabled: true,
    eventId: HALLOWEEN_EVENT_ID,
    simulatedDate,
  });
}

describe("Event-ending lifecycle — Admin EventClock transition end to end (EVENT SYSTEM — EVENT-OVER EXPERIENCE §14)", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("31 Oct 23:59 (joined, active, no ending) -> 1 Nov 00:00 (expired, ending eligible, Draft finalises)", async () => {
    db = new FDraftLocalDatabase(`ending-e2e-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;
    await seedJoinedProfile(repos, "2026-10-31T23:59:00.000Z");
    await repos.drafts.createDraft(baseDraft());
    await repos.drafts.createItems([
      baseItem({ id: "item-1", filmId: "film-1" }),
    ]);

    const before = await getEventDiscovery(repos, {
      profileId: PROFILE_ID,
      timezone: TIMEZONE,
    });
    const beforeStatus = before.statuses.find(
      (s) => s.event.id === HALLOWEEN_EVENT_ID,
    )!;
    expect(beforeStatus.available).toBe(true);
    expect(isOccurrenceExpired(beforeStatus)).toBe(false);
    expect(resolveEventEndingCandidate(before.statuses)).toBeNull();

    // The Admin flips the simulated time forward, past the event's own
    // natural end.
    await setEventDateOverride(repos, PROFILE_ID, {
      enabled: true,
      eventId: HALLOWEEN_EVENT_ID,
      simulatedDate: "2026-11-01T00:00:00.000Z",
    });

    const after = await getEventDiscovery(repos, {
      profileId: PROFILE_ID,
      timezone: TIMEZONE,
    });
    const afterStatus = after.statuses.find(
      (s) => s.event.id === HALLOWEEN_EVENT_ID,
    )!;
    expect(afterStatus.available).toBe(false);
    expect(isOccurrenceExpired(afterStatus)).toBe(true);
    const candidate = resolveEventEndingCandidate(after.statuses);
    expect(candidate?.occurrenceKey).toBe("halloween:2026");

    // The SAME global moment the ending becomes eligible also finalises
    // the Draft — see `EventEndingDialog`'s effect.
    const finalized = await finalizeExpiredEventDraftIfNeeded(repos, {
      profileId: PROFILE_ID,
      eventId: HALLOWEEN_EVENT_ID,
    });
    expect(finalized).toBe(true);
    const draft = await repos.drafts.getById(PROFILE_ID, "halloween-draft-1");
    expect(draft?.status).toBe("expired");
  });

  it("switching the EventClock back and forth after acknowledgement never re-shows the ending for the same occurrence", async () => {
    db = new FDraftLocalDatabase(`ending-e2e-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;
    await seedJoinedProfile(repos, "2026-11-01T00:00:00.000Z");

    const initial = await getEventDiscovery(repos, {
      profileId: PROFILE_ID,
      timezone: TIMEZONE,
    });
    const candidate = resolveEventEndingCandidate(initial.statuses);
    expect(candidate).not.toBeNull();
    await acknowledgeEventEnding(repos, {
      profileId: PROFILE_ID,
      occurrenceKey: candidate!.occurrenceKey,
    });

    // Flip back to "inside the window," then forward past it again —
    // several times — the acknowledgement must hold throughout.
    for (const simulatedDate of [
      "2026-10-31T20:00:00.000Z",
      "2026-11-01T00:00:00.000Z",
      "2026-10-15T12:00:00.000Z",
      "2026-11-02T09:00:00.000Z",
    ]) {
      await setEventDateOverride(repos, PROFILE_ID, {
        enabled: true,
        eventId: HALLOWEEN_EVENT_ID,
        simulatedDate,
      });
      const discovery = await getEventDiscovery(repos, {
        profileId: PROFILE_ID,
        timezone: TIMEZONE,
      });
      expect(resolveEventEndingCandidate(discovery.statuses)).toBeNull();
    }
  });

  it("a finalised (expired) Draft can never earn further Event currency, even if an item is somehow re-marked watched", async () => {
    db = new FDraftLocalDatabase(`ending-e2e-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;
    await seedJoinedProfile(repos, "2026-10-15T12:00:00.000Z");
    await repos.films.create({
      id: "film-1",
      title: "Film 1",
      releaseYear: 2020,
      letterboxdSlug: null,
      letterboxdUri: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await repos.drafts.createDraft(baseDraft());
    await repos.drafts.createItems([
      baseItem({ id: "item-1", filmId: "film-1", isCompleted: true }),
      baseItem({ id: "item-2", filmId: "film-1", isCompleted: false }),
    ]);
    await repos.points.setBalance({
      profileId: PROFILE_ID,
      currency: "haunted",
      total: 1,
      updatedAt: "2026-10-15T12:00:00.000Z",
    });

    await finalizeExpiredEventDraftIfNeeded(
      repos,
      { profileId: PROFILE_ID, eventId: HALLOWEEN_EVENT_ID },
      {
        clock: {
          now: () => new Date("2026-11-01T00:00:01.000Z"),
        },
      },
    );
    const draft = await repos.drafts.getById(PROFILE_ID, "halloween-draft-1");
    expect(draft?.status).toBe("expired");

    // The remaining unwatched item is still technically "active" data, but
    // the DRAFT it belongs to is no longer in `listActiveDrafts` — the
    // real watch-flow entry points that award per-film currency only ever
    // match items via an active draft, so this can't earn anything.
    const outcome = await markLocalDraftItemWatchedWithoutEntry(
      repos,
      {
        profileId: PROFILE_ID,
        draftItemId: "item-2",
        profileTimezone: TIMEZONE,
      },
      { archiveIfResolved: archiveLocalDraftIfResolved },
    );
    expect(outcome.ok).toBe(false);

    expect(await repos.points.getBalance(PROFILE_ID, "haunted")).toBe(1);
  });

  it("app closed across the boundary then reopened: discovery computed fresh still detects the expired, joined occurrence", async () => {
    db = new FDraftLocalDatabase(`ending-e2e-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;
    // Joined while the app was open, simulated "before."
    await seedJoinedProfile(repos, "2026-10-31T22:00:00.000Z");
    const beforeClose = await getEventDiscovery(repos, {
      profileId: PROFILE_ID,
      timezone: TIMEZONE,
    });
    expect(resolveEventEndingCandidate(beforeClose.statuses)).toBeNull();

    // "App closed" — nothing here represents time passing except the next
    // simulated date the Admin (standing in for real elapsed time) sets,
    // exactly like a real relaunch re-reading persisted state fresh.
    await setEventDateOverride(repos, PROFILE_ID, {
      enabled: true,
      eventId: HALLOWEEN_EVENT_ID,
      simulatedDate: "2026-11-03T09:00:00.000Z",
    });

    // "Reopened" — a brand-new discovery read against the same persisted
    // participation, exactly what app startup performs.
    const afterReopen = await getEventDiscovery(repos, {
      profileId: PROFILE_ID,
      timezone: TIMEZONE,
    });
    const candidate = resolveEventEndingCandidate(afterReopen.statuses);
    expect(candidate?.occurrenceKey).toBe("halloween:2026");
  });

  it("historical data (watched films, currency, occurrence) survives finalisation untouched", async () => {
    db = new FDraftLocalDatabase(`ending-e2e-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;
    await seedJoinedProfile(repos, "2026-11-01T00:00:01.000Z");
    await repos.drafts.createDraft(baseDraft());
    await repos.drafts.createItems([
      baseItem({
        id: "item-1",
        filmId: "film-1",
        isCompleted: true,
        eventRewardGrantedAt: "2026-10-20T00:00:00.000Z",
      }),
      baseItem({ id: "item-2", filmId: "film-2", isCompleted: false }),
    ]);
    await repos.points.setBalance({
      profileId: PROFILE_ID,
      currency: "haunted",
      total: 3,
      updatedAt: "2026-10-20T00:00:00.000Z",
    });

    await finalizeExpiredEventDraftIfNeeded(repos, {
      profileId: PROFILE_ID,
      eventId: HALLOWEEN_EVENT_ID,
    });

    const draft = await repos.drafts.getById(PROFILE_ID, "halloween-draft-1");
    expect(draft?.sourceEventId).toBe(HALLOWEEN_EVENT_ID);
    expect(draft?.status).toBe("expired");
    const items = await repos.drafts.listItemsForDraft("halloween-draft-1");
    expect(items.find((i) => i.id === "item-1")?.isCompleted).toBe(true);
    expect(items.find((i) => i.id === "item-1")?.eventRewardGrantedAt).toBe(
      "2026-10-20T00:00:00.000Z",
    );
    expect(items.find((i) => i.id === "item-2")?.isCompleted).toBe(false);
    expect(await repos.points.getBalance(PROFILE_ID, "haunted")).toBe(3);
  });

  it("multiple profiles: the joined profile gets the ending, the declined profile doesn't — currencies and acknowledgement stay fully isolated (EVENT SYSTEM — CURRENCY & EVENT-ENDING HARDENING §12)", async () => {
    db = new FDraftLocalDatabase(`ending-e2e-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;
    const PROFILE_A = "profile-a";
    const PROFILE_B = "profile-b";

    for (const profileId of [PROFILE_A, PROFILE_B]) {
      await repos.profiles.create({
        id: profileId,
        displayName: profileId,
        createdAt: "2026-01-01T00:00:00.000Z",
        lastOpenedAt: "2026-01-01T00:00:00.000Z",
        timezone: TIMEZONE,
        settings: {
          reducedMotion: false,
          defaultPage: "watchlist",
          franchiseChronologicalOrder: false,
          adminMode: true,
          halloweenPumpkinState: "uncarved",
        },
        dataVersion: 1,
      });
      await setEventDateOverride(repos, profileId, {
        enabled: true,
        eventId: HALLOWEEN_EVENT_ID,
        simulatedDate: "2026-11-01T00:00:01.000Z",
      });
    }
    await setEventParticipation(repos, PROFILE_A, "halloween:2026", "joined");
    await setEventParticipation(repos, PROFILE_B, "halloween:2026", "declined");
    await repos.points.setBalance({
      profileId: PROFILE_A,
      currency: "haunted",
      total: 5,
      updatedAt: "2026-10-20T00:00:00.000Z",
    });

    const discoveryA = await getEventDiscovery(repos, {
      profileId: PROFILE_A,
      timezone: TIMEZONE,
    });
    const discoveryB = await getEventDiscovery(repos, {
      profileId: PROFILE_B,
      timezone: TIMEZONE,
    });

    expect(
      resolveEventEndingCandidate(discoveryA.statuses)?.occurrenceKey,
    ).toBe("halloween:2026");
    expect(resolveEventEndingCandidate(discoveryB.statuses)).toBeNull();

    // Acknowledging A's ending never touches B's (declined, so it never
    // had a candidate to begin with) or B's currency balance.
    const candidateA = resolveEventEndingCandidate(discoveryA.statuses)!;
    await acknowledgeEventEnding(repos, {
      profileId: PROFILE_A,
      occurrenceKey: candidateA.occurrenceKey,
    });
    const discoveryAAfter = await getEventDiscovery(repos, {
      profileId: PROFILE_A,
      timezone: TIMEZONE,
    });
    expect(resolveEventEndingCandidate(discoveryAAfter.statuses)).toBeNull();

    expect(await repos.points.getBalance(PROFILE_A, "haunted")).toBe(5);
    expect(await repos.points.getBalance(PROFILE_B, "haunted")).toBe(0);
  });

  it("the SAME finalisation mechanism protects a January Draft too — no event-specific farming-prevention code is needed per event (EVENT SYSTEM — CURRENCY & EVENT-ENDING HARDENING §11)", async () => {
    db = new FDraftLocalDatabase(`ending-e2e-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;
    const JANUARY_EVENT_ID = "f-you-its-january";

    await repos.profiles.create({
      id: PROFILE_ID,
      displayName: "Alex",
      createdAt: "2026-01-01T00:00:00.000Z",
      lastOpenedAt: "2026-01-01T00:00:00.000Z",
      timezone: TIMEZONE,
      settings: {
        reducedMotion: false,
        defaultPage: "watchlist",
        franchiseChronologicalOrder: false,
        adminMode: false,
        halloweenPumpkinState: "uncarved",
      },
      dataVersion: 1,
    });
    await repos.drafts.createDraft(
      baseDraft({
        id: "january-draft-1",
        sourceEventId: JANUARY_EVENT_ID,
        startedAt: "2026-01-25T00:00:00.000Z",
        deadlineAt: "2026-01-31T23:59:59.000Z",
      }),
    );
    await repos.drafts.createItems([
      baseItem({
        id: "item-1",
        draftId: "january-draft-1",
        filmId: "film-1",
        source: "manual",
        isCompleted: true,
      }),
      baseItem({
        id: "item-2",
        draftId: "january-draft-1",
        filmId: "film-2",
        source: "manual",
      }),
    ]);
    await repos.points.setBalance({
      profileId: PROFILE_ID,
      currency: "misery",
      total: 1,
      updatedAt: "2026-01-25T00:00:00.000Z",
    });

    const finalized = await finalizeExpiredEventDraftIfNeeded(
      repos,
      { profileId: PROFILE_ID, eventId: JANUARY_EVENT_ID },
      {
        clock: {
          now: () => new Date("2026-02-01T00:00:01.000Z"),
        },
      },
    );
    expect(finalized).toBe(true);
    const draft = await repos.drafts.getById(PROFILE_ID, "january-draft-1");
    expect(draft?.status).toBe("expired");

    const outcome = await markLocalDraftItemWatchedWithoutEntry(
      repos,
      {
        profileId: PROFILE_ID,
        draftItemId: "item-2",
        profileTimezone: TIMEZONE,
      },
      { archiveIfResolved: archiveLocalDraftIfResolved },
    );
    expect(outcome.ok).toBe(false);
    expect(await repos.points.getBalance(PROFILE_ID, "misery")).toBe(1);
  });
});
