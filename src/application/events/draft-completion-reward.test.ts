import { afterEach, describe, expect, it } from "vitest";
import {
  archiveLocalDraftIfResolved,
  createLocalDraft,
} from "@/application/drafts/local-draft-service";
import {
  awardDraftCompletionReward,
  resolveDraftCompletionReward,
} from "@/application/events/draft-completion-reward";
import { setEventSettings } from "@/application/events/event-settings-store";
import {
  markLocalFilmWatched,
  undoLocalFilmWatched,
} from "@/application/watchlist/local-watchlist-service";
import { DEFAULT_EVENT_SETTINGS } from "@/domain/events/event-settings";
import {
  F_YOU_ITS_JANUARY_EVENT_ID,
  HALLOWEEN_EVENT_ID,
  SIGNAL_FROM_BEYOND_EVENT_ID,
  WATCHLIST_FRONTIER_EVENT_ID,
} from "@/domain/events/event-registry";
import { FixedClock } from "@/domain/time/clock";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import type { Repositories } from "@/repositories";

const PROFILE_ID = "alex";

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

/** Seeds one active watchlist film tagged with the given genres — for events whose eligibilityRules key off genre (The Watchlist Frontier, Signal from Beyond), unlike `seedActiveFilms`'s films, which carry no genre metadata at all. */
async function seedActiveFilmWithGenres(
  repos: Repositories,
  filmId: string,
  genres: string[],
) {
  await repos.films.create({
    id: filmId,
    title: filmId,
    releaseYear: 2020,
    letterboxdSlug: filmId,
    letterboxdUri: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  await repos.films.upsertMetadata({
    id: `${filmId}-meta`,
    filmId,
    provider: "tmdb",
    posterUrl: null,
    runtimeMinutes: null,
    genres,
    directors: null,
    countries: null,
    languages: null,
    collectionId: null,
    collectionName: null,
    collectionOrder: null,
    averageRating: null,
    popularity: null,
    watchCount: null,
    fansCount: null,
    listAppearances: null,
    externalIds: null,
    raw: null,
    matchMethod: "automatic",
    lastEnrichedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  await repos.watchlist.createEntry({
    id: `entry-${filmId}`,
    profileId: PROFILE_ID,
    filmId,
    dateAdded: "2026-01-01",
    position: 0,
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

/** Seeds one active watchlist film with the given community average rating — for January, whose eligibilityRules key off rating (see docs/updates, "JANUARY ELIGIBILITY RULES"), unlike `seedActiveFilms`'s films, which carry no rating metadata at all. */
async function seedActiveFilmWithRating(
  repos: Repositories,
  filmId: string,
  averageRating: number | null,
) {
  await repos.films.create({
    id: filmId,
    title: filmId,
    releaseYear: 2020,
    letterboxdSlug: filmId,
    letterboxdUri: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  await repos.films.upsertMetadata({
    id: `${filmId}-meta`,
    filmId,
    provider: "tmdb",
    posterUrl: null,
    runtimeMinutes: null,
    genres: null,
    directors: null,
    countries: null,
    languages: null,
    collectionId: null,
    collectionName: null,
    collectionOrder: null,
    averageRating,
    popularity: null,
    watchCount: null,
    fansCount: null,
    listAppearances: null,
    externalIds: null,
    raw: null,
    matchMethod: "automatic",
    lastEnrichedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  await repos.watchlist.createEntry({
    id: `entry-${filmId}`,
    profileId: PROFILE_ID,
    filmId,
    dateAdded: "2026-01-01",
    position: 0,
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

async function seedDraft(repos: Repositories) {
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
  return created.draftId;
}

describe("awardDraftCompletionReward", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("a normal (non-event) draft awards its requested currency and marks rewardsGrantedAt", async () => {
    db = new FDraftLocalDatabase(`reward-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const draftId = await seedDraft(repos);
    const clock = new FixedClock(new Date("2026-01-15T00:00:00.000Z"));

    const result = await awardDraftCompletionReward(
      repos,
      {
        profileId: PROFILE_ID,
        draftId,
        reward: { currency: "lifetime", amount: 10 },
      },
      { clock },
    );
    expect(result).toBe(true);

    expect(await repos.points.getBalance(PROFILE_ID, "lifetime")).toBe(10);
    const draft = await repos.drafts.getById(PROFILE_ID, draftId);
    expect(draft?.rewardsGrantedAt).toBe("2026-01-15T00:00:00.000Z");
  });

  it("a normally-active (non-manual) event awards its own unique currency", async () => {
    db = new FDraftLocalDatabase(`reward-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const draftId = await seedDraft(repos);

    await awardDraftCompletionReward(repos, {
      profileId: PROFILE_ID,
      draftId,
      reward: {
        currency: "misery",
        amount: 25,
        eventContext: { eventId: "f-you-its-january", manuallyEnabled: false },
      },
    });

    expect(await repos.points.getBalance(PROFILE_ID, "misery")).toBe(25);
    expect(await repos.points.getBalance(PROFILE_ID, "lifetime")).toBe(0);
  });

  it("CRITICAL RULE: a manually enabled event is downgraded to generic/Lifetime Points, never its own currency", async () => {
    db = new FDraftLocalDatabase(`reward-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const draftId = await seedDraft(repos);

    await awardDraftCompletionReward(repos, {
      profileId: PROFILE_ID,
      draftId,
      reward: {
        currency: "signal",
        amount: 15,
        eventContext: { eventId: "signal-from-beyond", manuallyEnabled: true },
      },
    });

    expect(await repos.points.getBalance(PROFILE_ID, "signal")).toBe(0);
    expect(await repos.points.getBalance(PROFILE_ID, "lifetime")).toBe(15);
  });

  it("is idempotent — a second call for the same draft awards nothing further", async () => {
    db = new FDraftLocalDatabase(`reward-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const draftId = await seedDraft(repos);

    const first = await awardDraftCompletionReward(repos, {
      profileId: PROFILE_ID,
      draftId,
      reward: { currency: "lifetime", amount: 10 },
    });
    expect(first).toBe(true);

    const second = await awardDraftCompletionReward(repos, {
      profileId: PROFILE_ID,
      draftId,
      reward: { currency: "lifetime", amount: 10 },
    });
    expect(second).toBe(false);

    // Still 10, not 20 — the second call never touched the balance.
    expect(await repos.points.getBalance(PROFILE_ID, "lifetime")).toBe(10);
  });

  it("accumulates across multiple different drafts rather than overwriting the running total", async () => {
    db = new FDraftLocalDatabase(`reward-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 2);

    const firstOutcome = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 1,
        challengeCount: 0,
      },
    });
    if (!firstOutcome.ok) throw new Error("unreachable");
    await awardDraftCompletionReward(repos, {
      profileId: PROFILE_ID,
      draftId: firstOutcome.draftId,
      reward: { currency: "lifetime", amount: 10 },
    });

    // A second, independent draft for the same profile.
    const secondEntries = await repos.watchlist.listActiveEntries(PROFILE_ID);
    expect(secondEntries.length).toBeGreaterThan(0);
    const secondDraft = {
      id: "draft-2",
      profileId: PROFILE_ID,
      difficulty: "baby" as const,
      timeMode: "timer" as const,
      status: "active" as const,
      totalFilms: 1,
      randomFilmCount: 1,
      challengeFilmCount: 0,
      challengeMode: null,
      startedAt: "2026-01-01T00:00:00.000Z",
      deadlineAt: "2026-02-01T00:00:00.000Z",
      timezone: "UTC",
      completedAt: null,
      freeformAchievedRank: null,
      sourceEventId: null,
      sourceEventManuallyEnabled: null,
      rewardsGrantedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    await repos.drafts.createDraft(secondDraft);
    await awardDraftCompletionReward(repos, {
      profileId: PROFILE_ID,
      draftId: "draft-2",
      reward: { currency: "lifetime", amount: 7 },
    });

    expect(await repos.points.getBalance(PROFILE_ID, "lifetime")).toBe(17);
  });

  it("returns false for a draft that doesn't exist", async () => {
    db = new FDraftLocalDatabase(`reward-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    const result = await awardDraftCompletionReward(repos, {
      profileId: PROFILE_ID,
      draftId: "does-not-exist",
      reward: { currency: "lifetime", amount: 10 },
    });
    expect(result).toBe(false);
  });

  it("an amount of 0 still marks rewardsGrantedAt without touching the balance", async () => {
    db = new FDraftLocalDatabase(`reward-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const draftId = await seedDraft(repos);

    const result = await awardDraftCompletionReward(repos, {
      profileId: PROFILE_ID,
      draftId,
      reward: { currency: "lifetime", amount: 0 },
    });
    expect(result).toBe(true);
    expect(await repos.points.getBalance(PROFILE_ID, "lifetime")).toBe(0);
    const draft = await repos.drafts.getById(PROFILE_ID, draftId);
    expect(draft?.rewardsGrantedAt).not.toBeNull();
  });
});

describe("resolveDraftCompletionReward", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("a normal, non-event draft resolves to generic/Lifetime Points at the default amount", async () => {
    db = new FDraftLocalDatabase(`resolve-reward-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const draftId = await seedDraft(repos);
    const draft = await repos.drafts.getById(PROFILE_ID, draftId);

    const reward = await resolveDraftCompletionReward(repos, {
      profileId: PROFILE_ID,
      draft: draft!,
    });
    expect(reward).toEqual({ currency: "lifetime", amount: 1 });
  });

  it("a draft sourced from an unknown/removed event id falls back to generic/Lifetime Points", async () => {
    db = new FDraftLocalDatabase(`resolve-reward-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const draftId = await seedDraft(repos);
    const draft = await repos.drafts.getById(PROFILE_ID, draftId);

    const reward = await resolveDraftCompletionReward(repos, {
      profileId: PROFILE_ID,
      draft: { ...draft!, sourceEventId: "not-a-real-event" },
    });
    expect(reward).toEqual({ currency: "lifetime", amount: 1 });
  });

  it("a January-sourced draft, normally active (not manually enabled), resolves to Misery Points", async () => {
    db = new FDraftLocalDatabase(`resolve-reward-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const draftId = await seedDraft(repos);
    const draft = await repos.drafts.getById(PROFILE_ID, draftId);
    // No manuallyEnabledEvents entry — this profile's January participation
    // is via natural availability, not a manual opt-in.

    const reward = await resolveDraftCompletionReward(repos, {
      profileId: PROFILE_ID,
      draft: { ...draft!, sourceEventId: F_YOU_ITS_JANUARY_EVENT_ID },
    });
    expect(reward).toEqual({
      currency: "misery",
      amount: 1,
      eventContext: {
        eventId: F_YOU_ITS_JANUARY_EVENT_ID,
        manuallyEnabled: false,
      },
    });
  });

  it("a January-sourced draft the profile manually enabled resolves with manuallyEnabled: true (the downgrade itself happens in awardDraftCompletionReward)", async () => {
    db = new FDraftLocalDatabase(`resolve-reward-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const draftId = await seedDraft(repos);
    const draft = await repos.drafts.getById(PROFILE_ID, draftId);
    await setEventSettings(repos, PROFILE_ID, {
      ...DEFAULT_EVENT_SETTINGS,
      eventsEnabled: true,
      activeEvent: F_YOU_ITS_JANUARY_EVENT_ID,
      manuallyEnabledEvents: [F_YOU_ITS_JANUARY_EVENT_ID],
    });

    const reward = await resolveDraftCompletionReward(repos, {
      profileId: PROFILE_ID,
      draft: { ...draft!, sourceEventId: F_YOU_ITS_JANUARY_EVENT_ID },
    });
    expect(reward).toEqual({
      currency: "misery",
      amount: 1,
      eventContext: {
        eventId: F_YOU_ITS_JANUARY_EVENT_ID,
        manuallyEnabled: true,
      },
    });
  });

  it("Phase 10 reward safety: a draft's persisted activation context is authoritative — a LATER manual opt-in into the same event must not retroactively downgrade an already-in-flight, naturally-activated Signal from Beyond draft's reward", async () => {
    db = new FDraftLocalDatabase(`resolve-reward-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const draftId = await seedDraft(repos);
    const draft = await repos.drafts.getById(PROFILE_ID, draftId);
    // This draft was created while Signal from Beyond was naturally
    // active — its persisted context says so, once, for good.
    const eventDraft = {
      ...draft!,
      sourceEventId: SIGNAL_FROM_BEYOND_EVENT_ID,
      sourceEventManuallyEnabled: false,
    };

    // Settings have since drifted: the profile later manually opted into
    // this same event (e.g. its natural window ended and they re-enabled
    // it by hand) — CURRENT settings now say "manually enabled."
    await setEventSettings(repos, PROFILE_ID, {
      ...DEFAULT_EVENT_SETTINGS,
      eventsEnabled: true,
      activeEvent: SIGNAL_FROM_BEYOND_EVENT_ID,
      manuallyEnabledEvents: [SIGNAL_FROM_BEYOND_EVENT_ID],
    });

    const reward = await resolveDraftCompletionReward(repos, {
      profileId: PROFILE_ID,
      draft: eventDraft,
    });

    // Still resolves as naturally-activated, per the draft's OWN persisted
    // context — not the current (drifted) settings.
    expect(reward).toEqual({
      currency: "signal",
      amount: 1,
      eventContext: {
        eventId: SIGNAL_FROM_BEYOND_EVENT_ID,
        manuallyEnabled: false,
      },
    });
  });

  it("Phase 10 reward safety, the reverse direction: a draft manually activated must not retroactively gain the event's unique currency just because current settings later look natural again", async () => {
    db = new FDraftLocalDatabase(`resolve-reward-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const draftId = await seedDraft(repos);
    const draft = await repos.drafts.getById(PROFILE_ID, draftId);
    // This draft was created via manual opt-in — its persisted context
    // says so, once, for good.
    const eventDraft = {
      ...draft!,
      sourceEventId: SIGNAL_FROM_BEYOND_EVENT_ID,
      sourceEventManuallyEnabled: true,
    };

    // Settings have since drifted the other way: manuallyEnabledEvents no
    // longer contains this event (e.g. Event Switcher was turned off and
    // back on, or a different event was opted into since).
    await setEventSettings(repos, PROFILE_ID, {
      ...DEFAULT_EVENT_SETTINGS,
      eventsEnabled: true,
      activeEvent: SIGNAL_FROM_BEYOND_EVENT_ID,
      manuallyEnabledEvents: [],
    });

    const reward = await resolveDraftCompletionReward(repos, {
      profileId: PROFILE_ID,
      draft: eventDraft,
    });

    expect(reward).toEqual({
      currency: "signal",
      amount: 1,
      eventContext: {
        eventId: SIGNAL_FROM_BEYOND_EVENT_ID,
        manuallyEnabled: true,
      },
    });
  });

  it("old-save compatibility: a draft predating sourceEventManuallyEnabled (null) falls back to re-deriving it from CURRENT settings", async () => {
    db = new FDraftLocalDatabase(`resolve-reward-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const draftId = await seedDraft(repos);
    const draft = await repos.drafts.getById(PROFILE_ID, draftId);
    // Simulates a draft written before this field existed — `null`, not
    // `false` (see `LocalDraftRepository`'s `normalizeDraft`).
    const legacyDraft = {
      ...draft!,
      sourceEventId: SIGNAL_FROM_BEYOND_EVENT_ID,
      sourceEventManuallyEnabled: null,
    };
    await setEventSettings(repos, PROFILE_ID, {
      ...DEFAULT_EVENT_SETTINGS,
      eventsEnabled: true,
      activeEvent: SIGNAL_FROM_BEYOND_EVENT_ID,
      manuallyEnabledEvents: [SIGNAL_FROM_BEYOND_EVENT_ID],
    });

    const reward = await resolveDraftCompletionReward(repos, {
      profileId: PROFILE_ID,
      draft: legacyDraft,
    });

    expect(reward).toEqual({
      currency: "signal",
      amount: 1,
      eventContext: {
        eventId: SIGNAL_FROM_BEYOND_EVENT_ID,
        manuallyEnabled: true,
      },
    });
  });
});

describe("event system Phase 5 — F* You, It's January! end to end", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("normal January activation: completing the draft awards Misery Points, not Lifetime", async () => {
    db = new FDraftLocalDatabase(`january-e2e-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilmWithRating(repos, "film-0", 2.5);
    // Naturally active — no manuallyEnabledEvents entry for this event.
    await setEventSettings(repos, PROFILE_ID, {
      ...DEFAULT_EVENT_SETTINGS,
      eventsEnabled: true,
      activeEvent: F_YOU_ITS_JANUARY_EVENT_ID,
    });

    const created = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 1,
        challengeCount: 0,
      },
      sourceEventId: F_YOU_ITS_JANUARY_EVENT_ID,
    });
    if (!created.ok) throw new Error("unreachable");

    const items = await repos.drafts.listItemsForDraft(created.draftId);
    await repos.drafts.updateItem({
      ...items[0],
      isCompleted: true,
      completedAt: "2026-01-10T00:00:00.000Z",
    });
    const archived = await archiveLocalDraftIfResolved(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
    });
    expect(archived).toBe(true);

    expect(await repos.points.getBalance(PROFILE_ID, "misery")).toBe(1);
    expect(await repos.points.getBalance(PROFILE_ID, "lifetime")).toBe(0);
    const draft = await repos.drafts.getById(PROFILE_ID, created.draftId);
    expect(draft?.sourceEventId).toBe(F_YOU_ITS_JANUARY_EVENT_ID);
    expect(draft?.rewardsGrantedAt).not.toBeNull();
  });

  it("manual January activation: completing the draft awards Lifetime Points only, never Misery", async () => {
    db = new FDraftLocalDatabase(`january-e2e-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilmWithRating(repos, "film-0", 2.5);
    // Manually enabled — the CRITICAL RULE applies.
    await setEventSettings(repos, PROFILE_ID, {
      ...DEFAULT_EVENT_SETTINGS,
      eventsEnabled: true,
      activeEvent: F_YOU_ITS_JANUARY_EVENT_ID,
      manuallyEnabledEvents: [F_YOU_ITS_JANUARY_EVENT_ID],
    });

    const created = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 1,
        challengeCount: 0,
      },
      sourceEventId: F_YOU_ITS_JANUARY_EVENT_ID,
    });
    if (!created.ok) throw new Error("unreachable");

    const items = await repos.drafts.listItemsForDraft(created.draftId);
    await repos.drafts.updateItem({
      ...items[0],
      isCompleted: true,
      completedAt: "2026-06-10T00:00:00.000Z",
    });
    const archived = await archiveLocalDraftIfResolved(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
    });
    expect(archived).toBe(true);

    expect(await repos.points.getBalance(PROFILE_ID, "lifetime")).toBe(1);
    expect(await repos.points.getBalance(PROFILE_ID, "misery")).toBe(0);
  });

  it("repeated completion attempts (retry/navigation) cannot duplicate the reward", async () => {
    db = new FDraftLocalDatabase(`january-e2e-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilmWithRating(repos, "film-0", 2.5);
    await setEventSettings(repos, PROFILE_ID, {
      ...DEFAULT_EVENT_SETTINGS,
      eventsEnabled: true,
      activeEvent: F_YOU_ITS_JANUARY_EVENT_ID,
    });

    const created = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 1,
        challengeCount: 0,
      },
      sourceEventId: F_YOU_ITS_JANUARY_EVENT_ID,
    });
    if (!created.ok) throw new Error("unreachable");

    const items = await repos.drafts.listItemsForDraft(created.draftId);
    await repos.drafts.updateItem({
      ...items[0],
      isCompleted: true,
      completedAt: "2026-01-10T00:00:00.000Z",
    });

    const first = await archiveLocalDraftIfResolved(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
    });
    const second = await archiveLocalDraftIfResolved(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
    });
    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(await repos.points.getBalance(PROFILE_ID, "misery")).toBe(1);
  });
});

describe("event system Phase 6 — Halloween end to end", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  // Halloween has no dedicated reward currency configured anywhere in the
  // project yet (see `event-registry.ts`'s `HALLOWEEN` entry — `pointType:
  // null`), so both its "normal" and "manual" activation paths resolve to
  // the same generic/Lifetime Points a plain draft would earn. These tests
  // still matter as real regression coverage: they prove the reward-
  // routing/idempotency machinery works correctly for an event with no
  // unique currency of its own, exactly the same way it does for one that
  // has one (F* You, It's January!, covered above) — see the Phase 6 task
  // notes for why no currency is invented here.

  it("normal Halloween activation: completing the draft awards generic Lifetime Points (no dedicated currency is configured)", async () => {
    db = new FDraftLocalDatabase(`halloween-e2e-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 1);
    // Naturally active — no manuallyEnabledEvents entry for this event.
    await setEventSettings(repos, PROFILE_ID, {
      ...DEFAULT_EVENT_SETTINGS,
      eventsEnabled: true,
      activeEvent: HALLOWEEN_EVENT_ID,
    });

    const created = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 1,
        challengeCount: 0,
      },
      sourceEventId: HALLOWEEN_EVENT_ID,
    });
    if (!created.ok) throw new Error("unreachable");

    const items = await repos.drafts.listItemsForDraft(created.draftId);
    await repos.drafts.updateItem({
      ...items[0],
      isCompleted: true,
      completedAt: "2026-10-10T00:00:00.000Z",
    });
    const archived = await archiveLocalDraftIfResolved(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
    });
    expect(archived).toBe(true);

    expect(await repos.points.getBalance(PROFILE_ID, "lifetime")).toBe(1);
    const draft = await repos.drafts.getById(PROFILE_ID, created.draftId);
    expect(draft?.sourceEventId).toBe(HALLOWEEN_EVENT_ID);
    expect(draft?.rewardsGrantedAt).not.toBeNull();
  });

  it("manual Halloween activation: also awards Lifetime Points only — the manual-event rule never lets ANY event award a unique currency when manually enabled", async () => {
    db = new FDraftLocalDatabase(`halloween-e2e-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 1);
    await setEventSettings(repos, PROFILE_ID, {
      ...DEFAULT_EVENT_SETTINGS,
      eventsEnabled: true,
      activeEvent: HALLOWEEN_EVENT_ID,
      manuallyEnabledEvents: [HALLOWEEN_EVENT_ID],
    });

    const created = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 1,
        challengeCount: 0,
      },
      sourceEventId: HALLOWEEN_EVENT_ID,
    });
    if (!created.ok) throw new Error("unreachable");

    const items = await repos.drafts.listItemsForDraft(created.draftId);
    await repos.drafts.updateItem({
      ...items[0],
      isCompleted: true,
      completedAt: "2026-06-10T00:00:00.000Z",
    });
    const archived = await archiveLocalDraftIfResolved(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
    });
    expect(archived).toBe(true);

    expect(await repos.points.getBalance(PROFILE_ID, "lifetime")).toBe(1);
  });

  it("repeated completion attempts (retry/navigation) cannot duplicate the reward", async () => {
    db = new FDraftLocalDatabase(`halloween-e2e-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 1);
    await setEventSettings(repos, PROFILE_ID, {
      ...DEFAULT_EVENT_SETTINGS,
      eventsEnabled: true,
      activeEvent: HALLOWEEN_EVENT_ID,
    });

    const created = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 1,
        challengeCount: 0,
      },
      sourceEventId: HALLOWEEN_EVENT_ID,
    });
    if (!created.ok) throw new Error("unreachable");

    const items = await repos.drafts.listItemsForDraft(created.draftId);
    await repos.drafts.updateItem({
      ...items[0],
      isCompleted: true,
      completedAt: "2026-10-10T00:00:00.000Z",
    });

    const first = await archiveLocalDraftIfResolved(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
    });
    const second = await archiveLocalDraftIfResolved(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
    });
    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(await repos.points.getBalance(PROFILE_ID, "lifetime")).toBe(1);
  });
});

describe("event system Phase 7 — The Watchlist Frontier end to end", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("normal activation: completing the draft awards permanent Bounty Points", async () => {
    db = new FDraftLocalDatabase(`frontier-e2e-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilmWithGenres(repos, "western-1", ["Western"]);
    // Naturally active — no manuallyEnabledEvents entry for this event.
    await setEventSettings(repos, PROFILE_ID, {
      ...DEFAULT_EVENT_SETTINGS,
      eventsEnabled: true,
      activeEvent: WATCHLIST_FRONTIER_EVENT_ID,
    });

    const created = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 1,
        challengeCount: 0,
      },
      sourceEventId: WATCHLIST_FRONTIER_EVENT_ID,
    });
    if (!created.ok) throw new Error("unreachable");

    const items = await repos.drafts.listItemsForDraft(created.draftId);
    await repos.drafts.updateItem({
      ...items[0],
      isCompleted: true,
      completedAt: "2026-10-10T00:00:00.000Z",
    });
    const archived = await archiveLocalDraftIfResolved(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
    });
    expect(archived).toBe(true);

    expect(await repos.points.getBalance(PROFILE_ID, "bounty")).toBe(1);
    expect(await repos.points.getBalance(PROFILE_ID, "lifetime")).toBe(0);
    const draft = await repos.drafts.getById(PROFILE_ID, created.draftId);
    expect(draft?.sourceEventId).toBe(WATCHLIST_FRONTIER_EVENT_ID);
    expect(draft?.rewardsGrantedAt).not.toBeNull();
  });

  it("manual activation: completing the draft awards Lifetime Points only, never Bounty", async () => {
    db = new FDraftLocalDatabase(`frontier-e2e-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilmWithGenres(repos, "western-1", ["Western"]);
    // Manually enabled — the CRITICAL RULE applies.
    await setEventSettings(repos, PROFILE_ID, {
      ...DEFAULT_EVENT_SETTINGS,
      eventsEnabled: true,
      activeEvent: WATCHLIST_FRONTIER_EVENT_ID,
      manuallyEnabledEvents: [WATCHLIST_FRONTIER_EVENT_ID],
    });

    const created = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 1,
        challengeCount: 0,
      },
      sourceEventId: WATCHLIST_FRONTIER_EVENT_ID,
    });
    if (!created.ok) throw new Error("unreachable");

    const items = await repos.drafts.listItemsForDraft(created.draftId);
    await repos.drafts.updateItem({
      ...items[0],
      isCompleted: true,
      completedAt: "2026-06-10T00:00:00.000Z",
    });
    const archived = await archiveLocalDraftIfResolved(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
    });
    expect(archived).toBe(true);

    expect(await repos.points.getBalance(PROFILE_ID, "lifetime")).toBe(1);
    expect(await repos.points.getBalance(PROFILE_ID, "bounty")).toBe(0);
  });

  it("repeated completion attempts (retry/navigation) cannot duplicate the reward", async () => {
    db = new FDraftLocalDatabase(`frontier-e2e-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilmWithGenres(repos, "western-1", ["Western"]);
    await setEventSettings(repos, PROFILE_ID, {
      ...DEFAULT_EVENT_SETTINGS,
      eventsEnabled: true,
      activeEvent: WATCHLIST_FRONTIER_EVENT_ID,
    });

    const created = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 1,
        challengeCount: 0,
      },
      sourceEventId: WATCHLIST_FRONTIER_EVENT_ID,
    });
    if (!created.ok) throw new Error("unreachable");

    const items = await repos.drafts.listItemsForDraft(created.draftId);
    await repos.drafts.updateItem({
      ...items[0],
      isCompleted: true,
      completedAt: "2026-10-10T00:00:00.000Z",
    });

    const first = await archiveLocalDraftIfResolved(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
    });
    const second = await archiveLocalDraftIfResolved(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
    });
    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(await repos.points.getBalance(PROFILE_ID, "bounty")).toBe(1);
  });
});

describe("event system Phase 6 — Signal from Beyond end to end", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("normal activation: completing the draft awards permanent Signal Points", async () => {
    db = new FDraftLocalDatabase(`signal-e2e-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilmWithGenres(repos, "scifi-1", ["Science Fiction"]);
    // Naturally active — no manuallyEnabledEvents entry for this event.
    await setEventSettings(repos, PROFILE_ID, {
      ...DEFAULT_EVENT_SETTINGS,
      eventsEnabled: true,
      activeEvent: SIGNAL_FROM_BEYOND_EVENT_ID,
    });

    const created = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 1,
        challengeCount: 0,
      },
      sourceEventId: SIGNAL_FROM_BEYOND_EVENT_ID,
    });
    if (!created.ok) throw new Error("unreachable");

    const items = await repos.drafts.listItemsForDraft(created.draftId);
    await repos.drafts.updateItem({
      ...items[0],
      isCompleted: true,
      completedAt: "2026-10-10T00:00:00.000Z",
    });
    const archived = await archiveLocalDraftIfResolved(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
    });
    expect(archived).toBe(true);

    expect(await repos.points.getBalance(PROFILE_ID, "signal")).toBe(1);
    expect(await repos.points.getBalance(PROFILE_ID, "lifetime")).toBe(0);
    const draft = await repos.drafts.getById(PROFILE_ID, created.draftId);
    expect(draft?.sourceEventId).toBe(SIGNAL_FROM_BEYOND_EVENT_ID);
    expect(draft?.rewardsGrantedAt).not.toBeNull();
  });

  it("manual activation: completing the draft awards Lifetime Points only, never Signal", async () => {
    db = new FDraftLocalDatabase(`signal-e2e-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilmWithGenres(repos, "scifi-1", ["Science Fiction"]);
    // Manually enabled — the CRITICAL RULE applies.
    await setEventSettings(repos, PROFILE_ID, {
      ...DEFAULT_EVENT_SETTINGS,
      eventsEnabled: true,
      activeEvent: SIGNAL_FROM_BEYOND_EVENT_ID,
      manuallyEnabledEvents: [SIGNAL_FROM_BEYOND_EVENT_ID],
    });

    const created = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 1,
        challengeCount: 0,
      },
      sourceEventId: SIGNAL_FROM_BEYOND_EVENT_ID,
    });
    if (!created.ok) throw new Error("unreachable");

    const items = await repos.drafts.listItemsForDraft(created.draftId);
    await repos.drafts.updateItem({
      ...items[0],
      isCompleted: true,
      completedAt: "2026-06-10T00:00:00.000Z",
    });
    const archived = await archiveLocalDraftIfResolved(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
    });
    expect(archived).toBe(true);

    expect(await repos.points.getBalance(PROFILE_ID, "lifetime")).toBe(1);
    expect(await repos.points.getBalance(PROFILE_ID, "signal")).toBe(0);
  });

  it("repeated completion attempts (retry/navigation) cannot duplicate the reward", async () => {
    db = new FDraftLocalDatabase(`signal-e2e-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilmWithGenres(repos, "scifi-1", ["Science Fiction"]);
    await setEventSettings(repos, PROFILE_ID, {
      ...DEFAULT_EVENT_SETTINGS,
      eventsEnabled: true,
      activeEvent: SIGNAL_FROM_BEYOND_EVENT_ID,
    });

    const created = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 1,
        challengeCount: 0,
      },
      sourceEventId: SIGNAL_FROM_BEYOND_EVENT_ID,
    });
    if (!created.ok) throw new Error("unreachable");

    const items = await repos.drafts.listItemsForDraft(created.draftId);
    await repos.drafts.updateItem({
      ...items[0],
      isCompleted: true,
      completedAt: "2026-10-10T00:00:00.000Z",
    });

    const first = await archiveLocalDraftIfResolved(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
    });
    const second = await archiveLocalDraftIfResolved(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
    });
    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(await repos.points.getBalance(PROFILE_ID, "signal")).toBe(1);
  });
});

describe("event system Phase 10 — reward safety end to end (persistence/lifecycle hardening)", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("a Signal from Beyond draft created through normal activation still awards Signal Points at completion, even after the profile manually opts in before finishing it", async () => {
    db = new FDraftLocalDatabase(`phase10-e2e-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilmWithGenres(repos, "scifi-1", ["Science Fiction"]);
    // Naturally active at creation time (the real `createDraftAction` path
    // — see `src/app/(app)/drafts/new/actions.ts` — captures this exact
    // context on the draft itself).
    await setEventSettings(repos, PROFILE_ID, {
      ...DEFAULT_EVENT_SETTINGS,
      eventsEnabled: true,
      activeEvent: SIGNAL_FROM_BEYOND_EVENT_ID,
    });

    const created = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 1,
        challengeCount: 0,
      },
      sourceEventId: SIGNAL_FROM_BEYOND_EVENT_ID,
      sourceEventManuallyEnabled: false,
    });
    if (!created.ok) throw new Error("unreachable");

    // While the draft is still active, event settings drift: the profile
    // manually opts into this same event (its natural window ended, say).
    await setEventSettings(repos, PROFILE_ID, {
      ...DEFAULT_EVENT_SETTINGS,
      eventsEnabled: true,
      activeEvent: SIGNAL_FROM_BEYOND_EVENT_ID,
      manuallyEnabledEvents: [SIGNAL_FROM_BEYOND_EVENT_ID],
    });

    const items = await repos.drafts.listItemsForDraft(created.draftId);
    await repos.drafts.updateItem({
      ...items[0],
      isCompleted: true,
      completedAt: "2026-10-10T00:00:00.000Z",
    });
    const archived = await archiveLocalDraftIfResolved(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
    });
    expect(archived).toBe(true);

    // Signal Points, not Lifetime — the settings drift after creation must
    // never leak into this already-in-flight draft's reward.
    expect(await repos.points.getBalance(PROFILE_ID, "signal")).toBe(1);
    expect(await repos.points.getBalance(PROFILE_ID, "lifetime")).toBe(0);
  });

  it("toggling Event visuals at any point has zero effect on which currency a draft's completion awards", async () => {
    db = new FDraftLocalDatabase(`phase10-e2e-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilmWithGenres(repos, "scifi-1", ["Science Fiction"]);
    await setEventSettings(repos, PROFILE_ID, {
      ...DEFAULT_EVENT_SETTINGS,
      eventsEnabled: true,
      eventVisualsEnabled: false,
      activeEvent: SIGNAL_FROM_BEYOND_EVENT_ID,
    });

    const created = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 1,
        challengeCount: 0,
      },
      sourceEventId: SIGNAL_FROM_BEYOND_EVENT_ID,
      sourceEventManuallyEnabled: false,
    });
    if (!created.ok) throw new Error("unreachable");

    // Flip visuals on, then off again, before completion.
    await setEventSettings(repos, PROFILE_ID, {
      eventsEnabled: true,
      eventVisualsEnabled: true,
      activeEvent: SIGNAL_FROM_BEYOND_EVENT_ID,
      manuallyEnabledEvents: [],
    });
    await setEventSettings(repos, PROFILE_ID, {
      eventsEnabled: true,
      eventVisualsEnabled: false,
      activeEvent: SIGNAL_FROM_BEYOND_EVENT_ID,
      manuallyEnabledEvents: [],
    });

    const items = await repos.drafts.listItemsForDraft(created.draftId);
    await repos.drafts.updateItem({
      ...items[0],
      isCompleted: true,
      completedAt: "2026-10-10T00:00:00.000Z",
    });
    const archived = await archiveLocalDraftIfResolved(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
    });
    expect(archived).toBe(true);

    expect(await repos.points.getBalance(PROFILE_ID, "signal")).toBe(1);
    expect(await repos.points.getBalance(PROFILE_ID, "lifetime")).toBe(0);
  });

  it("a January-owned draft remains loadable and completes normally after its natural availability window has ended", async () => {
    db = new FDraftLocalDatabase(`phase10-e2e-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilmWithRating(repos, "film-0", 2.5);
    await setEventSettings(repos, PROFILE_ID, {
      ...DEFAULT_EVENT_SETTINGS,
      eventsEnabled: true,
      activeEvent: F_YOU_ITS_JANUARY_EVENT_ID,
    });

    const created = await createLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        config: {
          difficulty: "baby",
          timeMode: "timer",
          randomCount: 1,
          challengeCount: 0,
        },
        sourceEventId: F_YOU_ITS_JANUARY_EVENT_ID,
        sourceEventManuallyEnabled: false,
      },
      { clock: new FixedClock(new Date("2026-01-20T00:00:00.000Z")) },
    );
    if (!created.ok) throw new Error("unreachable");

    // January has ended — the event is no longer naturally available, but
    // the draft it created must still load and complete exactly as it
    // would have in-season.
    const stillLoadable = await repos.drafts.getById(
      PROFILE_ID,
      created.draftId,
    );
    expect(stillLoadable).not.toBeNull();
    expect(stillLoadable?.status).toBe("active");

    const items = await repos.drafts.listItemsForDraft(created.draftId);
    await repos.drafts.updateItem({
      ...items[0],
      isCompleted: true,
      completedAt: "2026-02-15T00:00:00.000Z",
    });
    const archived = await archiveLocalDraftIfResolved(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
    });
    expect(archived).toBe(true);
    expect(await repos.points.getBalance(PROFILE_ID, "misery")).toBe(1);
  });

  it("audit fix: undoing a manually-enabled event draft's auto-archive reverses the Lifetime Points it actually granted, never its (never-credited) event currency", async () => {
    db = new FDraftLocalDatabase(`phase10-e2e-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilmWithGenres(repos, "scifi-1", ["Science Fiction"]);
    // Manually enabled — the CRITICAL RULE applies: this awards Lifetime
    // Points, never Signal Points.
    await setEventSettings(repos, PROFILE_ID, {
      ...DEFAULT_EVENT_SETTINGS,
      eventsEnabled: true,
      activeEvent: SIGNAL_FROM_BEYOND_EVENT_ID,
      manuallyEnabledEvents: [SIGNAL_FROM_BEYOND_EVENT_ID],
    });

    const created = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 1,
        challengeCount: 0,
      },
      sourceEventId: SIGNAL_FROM_BEYOND_EVENT_ID,
      sourceEventManuallyEnabled: true,
    });
    if (!created.ok) throw new Error("unreachable");

    const items = await repos.drafts.listItemsForDraft(created.draftId);
    const outcome = await markLocalFilmWatched(
      repos,
      {
        profileId: PROFILE_ID,
        watchlistEntryId: items[0].watchlistEntryId!,
        profileTimezone: "UTC",
      },
      { archiveIfResolved: archiveLocalDraftIfResolved },
    );
    if (!outcome.ok) throw new Error("unreachable");
    expect(outcome.draftArchivedByThisAction).toBe(true);
    expect(await repos.points.getBalance(PROFILE_ID, "lifetime")).toBe(1);
    expect(await repos.points.getBalance(PROFILE_ID, "signal")).toBe(0);

    const undoResult = await undoLocalFilmWatched(repos, {
      profileId: PROFILE_ID,
      record: {
        watchlistEntryId: outcome.watchlistEntryId,
        filmId: outcome.filmId,
        watchedHistoryId: outcome.watchedHistoryId,
        draftItemId: outcome.draftItemId,
        draftId: outcome.draftId,
        draftArchivedByThisAction: outcome.draftArchivedByThisAction,
      },
    });
    expect(undoResult).toEqual({ ok: true });

    // Reversed from Lifetime (what was actually granted) — Signal stays at
    // 0 throughout, never incorrectly debited for a currency it never had.
    expect(await repos.points.getBalance(PROFILE_ID, "lifetime")).toBe(0);
    expect(await repos.points.getBalance(PROFILE_ID, "signal")).toBe(0);
  });
});
