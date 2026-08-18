import { afterEach, describe, expect, it } from "vitest";
import {
  archiveLocalDraftIfResolved,
  createLocalDraft,
  expireLocalDraftIfDue,
  generateLocalFreeformBatch,
  settleAndDiscardLocalDraft,
  submitLocalPostmortemResponse,
} from "@/application/drafts/local-draft-service";
import {
  HALLOWEEN_EVENT_ID,
  SIGNAL_FROM_BEYOND_EVENT_ID,
  WATCHLIST_FRONTIER_EVENT_ID,
} from "@/domain/events/event-registry";
import { createSeededRng } from "@/domain/shared/rng";
import { FixedClock } from "@/domain/time/clock";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import type { Repositories } from "@/repositories";

const PROFILE_ID = "alex";

async function seedActiveFilms(repos: Repositories, count: number) {
  const entryIds: string[] = [];
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
    const entryId = `entry-${i}`;
    await repos.watchlist.createEntry({
      id: entryId,
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
    entryIds.push(entryId);
  }
  return entryIds;
}

/** Seeds one active watchlist film tagged with the given genres — for eligibility rules that key off `genres` (e.g. The Watchlist Frontier's `requiredGenres: ["Western"]`), unlike `seedActiveFilms`'s films, which carry no metadata at all. */
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
  const entryId = `entry-${filmId}`;
  await repos.watchlist.createEntry({
    id: entryId,
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
  return entryId;
}

describe("createLocalDraft", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("fails with empty_watchlist when the profile has no active watchlist entries", async () => {
    db = new FDraftLocalDatabase(`draft-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    const outcome = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 5,
        challengeCount: 0,
      },
    });
    expect(outcome).toEqual({
      ok: false,
      error: "empty_watchlist",
      message: expect.any(String),
    });
  });

  it("fails with not_enough_films when the watchlist is smaller than the requested random count", async () => {
    db = new FDraftLocalDatabase(`draft-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 2);

    const outcome = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 5,
        challengeCount: 0,
      },
    });
    expect(outcome).toEqual({
      ok: false,
      error: "not_enough_films",
      message: expect.any(String),
    });
  });

  it("creates a random-only draft with the correct item count, deadline, and no auth/session concept anywhere", async () => {
    db = new FDraftLocalDatabase(`draft-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 5);

    const clock = new FixedClock(new Date("2026-01-01T00:00:00.000Z"));
    // This whole call takes nothing but a profileId string and a timezone —
    // no Supabase client, no session, no auth.getUser() anywhere in the
    // call graph (see docs/product-spec.md, "REMOVE AUTH DEPENDENCY FROM
    // DOMAIN LOGIC" — Prompt 9.5A).
    const outcome = await createLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        config: {
          difficulty: "baby",
          timeMode: "timer",
          randomCount: 5,
          challengeCount: 0,
        },
      },
      { clock, rng: createSeededRng(1) },
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const draft = await repos.drafts.getById(PROFILE_ID, outcome.draftId);
    expect(draft?.status).toBe("active");
    expect(draft?.totalFilms).toBe(5);
    expect(draft?.deadlineAt).toBe("2026-01-31T00:00:00.000Z"); // timer mode: +30 days

    const items = await repos.drafts.listItemsForDraft(outcome.draftId);
    expect(items).toHaveLength(5);
    expect(items.every((item) => item.source === "random")).toBe(true);
    expect(new Set(items.map((item) => item.orderIndex))).toEqual(
      new Set([0, 1, 2, 3, 4]),
    );
  });

  it("rejects a second draft while one is already active", async () => {
    db = new FDraftLocalDatabase(`draft-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 10);

    const config = {
      difficulty: "baby" as const,
      timeMode: "timer" as const,
      randomCount: 5,
      challengeCount: 0,
    };
    const first = await createLocalDraft(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC", config },
      { rng: createSeededRng(1) },
    );
    expect(first.ok).toBe(true);

    const second = await createLocalDraft(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC", config },
      { rng: createSeededRng(2) },
    );
    expect(second).toEqual({
      ok: false,
      error: "already_active",
      message: expect.any(String),
    });
  });

  it("a different profile is entirely unaffected by another profile's active draft (no cross-profile leakage)", async () => {
    db = new FDraftLocalDatabase(`draft-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 10);
    // Seed the same film count for a second profile too.
    for (let i = 0; i < 10; i++) {
      await repos.watchlist.createEntry({
        id: `sam-entry-${i}`,
        profileId: "sam",
        filmId: `film-${i}`,
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

    const config = {
      difficulty: "baby" as const,
      timeMode: "timer" as const,
      randomCount: 5,
      challengeCount: 0,
    };
    const alexDraft = await createLocalDraft(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC", config },
      { rng: createSeededRng(1) },
    );
    expect(alexDraft.ok).toBe(true);

    const samDraft = await createLocalDraft(
      repos,
      { profileId: "sam", timezone: "UTC", config },
      { rng: createSeededRng(1) },
    );
    expect(samDraft.ok).toBe(true);
  });

  it("creates a freeform draft capped to FREEFORM_BATCH_SIZE with no challenge items", async () => {
    db = new FDraftLocalDatabase(`draft-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 20);

    const outcome = await createLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        config: { difficulty: "freeform", timeMode: "calendar" },
      },
      { rng: createSeededRng(1) },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const items = await repos.drafts.listItemsForDraft(outcome.draftId);
    expect(items).toHaveLength(5); // FREEFORM_BATCH_SIZE
    expect(items.every((item) => item.source === "random")).toBe(true);
  });
});

describe("createLocalDraft — Halloween-owned draft (event system Phase 6)", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("normal Halloween eligibility: no curated data is configured yet, so the full normal watchlist stays eligible", async () => {
    db = new FDraftLocalDatabase(`draft-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 5);

    const outcome = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 5,
        challengeCount: 0,
      },
      sourceEventId: HALLOWEEN_EVENT_ID,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const items = await repos.drafts.listItemsForDraft(outcome.draftId);
    expect(items).toHaveLength(5);
  });

  it("persists sourceEventId on the draft, surviving a fresh repository read (reload)", async () => {
    db = new FDraftLocalDatabase(`draft-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 3);

    const outcome = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 3,
        challengeCount: 0,
      },
      sourceEventId: HALLOWEEN_EVENT_ID,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    // A fresh repository/database instance against the same underlying
    // storage — simulates reloading the app rather than reading back the
    // in-memory object this same call just created.
    const reloadedDb = new FDraftLocalDatabase(db.name);
    const reloadedRepos = createLocalRepositories(reloadedDb);
    const reloaded = await reloadedRepos.drafts.getById(
      PROFILE_ID,
      outcome.draftId,
    );
    expect(reloaded?.sourceEventId).toBe(HALLOWEEN_EVENT_ID);
    await reloadedDb.close();
  });

  // The "bare {} placeholder never throws" case this used to cover via
  // F_YOU_ITS_JANUARY no longer applies now that January has a real
  // eligibilityRules shape (see docs/updates, "JANUARY ELIGIBILITY
  // RULES") — that generic `{}` safety is unit-tested directly in
  // `event-eligibility.test.ts` ("no rules configured at all"), and
  // Halloween's own explicit `{requiredGenres: null, curatedFilmIds:
  // null}` safety is already proven by this describe block's other tests
  // above (e.g. the 5-item draft creation test).
});

describe("createLocalDraft — The Watchlist Frontier-owned draft (event system Phase 7)", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("normal Western qualifies: only Western-genre films are drawn, unrelated genres are excluded", async () => {
    db = new FDraftLocalDatabase(`draft-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilmWithGenres(repos, "western-1", ["Western"]);
    await seedActiveFilmWithGenres(repos, "western-2", ["Western", "Drama"]);
    await seedActiveFilmWithGenres(repos, "comedy-1", ["Comedy"]);
    await seedActiveFilmWithGenres(repos, "drama-1", ["Drama"]);

    const outcome = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 2,
        challengeCount: 0,
      },
      sourceEventId: WATCHLIST_FRONTIER_EVENT_ID,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const items = await repos.drafts.listItemsForDraft(outcome.draftId);
    expect(items).toHaveLength(2);
    expect(new Set(items.map((item) => item.filmId))).toEqual(
      new Set(["western-1", "western-2"]),
    );
  });

  it("fails with not_enough_films when fewer Western/curated films are eligible than requested — an unrelated watchlist doesn't silently pad the pool", async () => {
    db = new FDraftLocalDatabase(`draft-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilmWithGenres(repos, "western-1", ["Western"]);
    await seedActiveFilmWithGenres(repos, "comedy-1", ["Comedy"]);
    await seedActiveFilmWithGenres(repos, "drama-1", ["Drama"]);

    const outcome = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 2,
        challengeCount: 0,
      },
      sourceEventId: WATCHLIST_FRONTIER_EVENT_ID,
    });

    expect(outcome).toEqual({
      ok: false,
      error: "not_enough_films",
      message: expect.any(String),
    });
  });

  it("persists sourceEventId on the draft, surviving a fresh repository read (reload)", async () => {
    db = new FDraftLocalDatabase(`draft-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilmWithGenres(repos, "western-1", ["Western"]);
    await seedActiveFilmWithGenres(repos, "western-2", ["Western"]);

    const outcome = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 2,
        challengeCount: 0,
      },
      sourceEventId: WATCHLIST_FRONTIER_EVENT_ID,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const reloadedDb = new FDraftLocalDatabase(db.name);
    const reloadedRepos = createLocalRepositories(reloadedDb);
    const reloaded = await reloadedRepos.drafts.getById(
      PROFILE_ID,
      outcome.draftId,
    );
    expect(reloaded?.sourceEventId).toBe(WATCHLIST_FRONTIER_EVENT_ID);
    await reloadedDb.close();
  });
});

describe("createLocalDraft — Signal from Beyond-owned draft (event system Phase 6)", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("ordinary sci-fi film qualifies: only Science Fiction-genre films are drawn, unrelated genres are excluded", async () => {
    db = new FDraftLocalDatabase(`draft-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilmWithGenres(repos, "scifi-1", ["Science Fiction"]);
    await seedActiveFilmWithGenres(repos, "scifi-2", [
      "Science Fiction",
      "Adventure",
    ]);
    await seedActiveFilmWithGenres(repos, "comedy-1", ["Comedy"]);
    await seedActiveFilmWithGenres(repos, "drama-1", ["Drama"]);

    const outcome = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 2,
        challengeCount: 0,
      },
      sourceEventId: SIGNAL_FROM_BEYOND_EVENT_ID,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const items = await repos.drafts.listItemsForDraft(outcome.draftId);
    expect(items).toHaveLength(2);
    expect(new Set(items.map((item) => item.filmId))).toEqual(
      new Set(["scifi-1", "scifi-2"]),
    );
  });

  it("fails with not_enough_films when fewer sci-fi/whitelisted films are eligible than requested — an unrelated watchlist doesn't silently pad the pool", async () => {
    db = new FDraftLocalDatabase(`draft-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilmWithGenres(repos, "scifi-1", ["Science Fiction"]);
    await seedActiveFilmWithGenres(repos, "comedy-1", ["Comedy"]);
    await seedActiveFilmWithGenres(repos, "drama-1", ["Drama"]);

    const outcome = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 2,
        challengeCount: 0,
      },
      sourceEventId: SIGNAL_FROM_BEYOND_EVENT_ID,
    });

    expect(outcome).toEqual({
      ok: false,
      error: "not_enough_films",
      message: expect.any(String),
    });
  });

  it("event draft survives reload: sourceEventId persists across a fresh repository read", async () => {
    db = new FDraftLocalDatabase(`draft-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilmWithGenres(repos, "scifi-1", ["Science Fiction"]);
    await seedActiveFilmWithGenres(repos, "scifi-2", ["Science Fiction"]);

    const outcome = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 2,
        challengeCount: 0,
      },
      sourceEventId: SIGNAL_FROM_BEYOND_EVENT_ID,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const reloadedDb = new FDraftLocalDatabase(db.name);
    const reloadedRepos = createLocalRepositories(reloadedDb);
    const reloaded = await reloadedRepos.drafts.getById(
      PROFILE_ID,
      outcome.draftId,
    );
    expect(reloaded?.sourceEventId).toBe(SIGNAL_FROM_BEYOND_EVENT_ID);
    await reloadedDb.close();
  });
});

describe("createLocalDraft — sourceEventManuallyEnabled persistence (event system Phase 10)", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  async function createOne(
    repos: Repositories,
    overrides: {
      sourceEventId?: string | null;
      sourceEventManuallyEnabled?: boolean | null;
    },
  ) {
    await seedActiveFilmWithGenres(repos, "scifi-1", ["Science Fiction"]);
    const outcome = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 1,
        challengeCount: 0,
      },
      ...overrides,
    });
    if (!outcome.ok) throw new Error("unreachable — draft creation failed");
    return outcome.draftId;
  }

  it("captures an explicit true at creation and it survives a fresh repository read (reload)", async () => {
    db = new FDraftLocalDatabase(`draft-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const draftId = await createOne(repos, {
      sourceEventId: SIGNAL_FROM_BEYOND_EVENT_ID,
      sourceEventManuallyEnabled: true,
    });

    const reloadedDb = new FDraftLocalDatabase(db.name);
    const reloadedRepos = createLocalRepositories(reloadedDb);
    const reloaded = await reloadedRepos.drafts.getById(PROFILE_ID, draftId);
    expect(reloaded?.sourceEventManuallyEnabled).toBe(true);
    await reloadedDb.close();
  });

  it("captures an explicit false at creation just as durably as true", async () => {
    db = new FDraftLocalDatabase(`draft-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const draftId = await createOne(repos, {
      sourceEventId: SIGNAL_FROM_BEYOND_EVENT_ID,
      sourceEventManuallyEnabled: false,
    });

    const draft = await repos.drafts.getById(PROFILE_ID, draftId);
    expect(draft?.sourceEventManuallyEnabled).toBe(false);
  });

  it("defaults to null when an event-sourced draft's caller omits it (legacy call site)", async () => {
    db = new FDraftLocalDatabase(`draft-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const draftId = await createOne(repos, {
      sourceEventId: SIGNAL_FROM_BEYOND_EVENT_ID,
    });

    const draft = await repos.drafts.getById(PROFILE_ID, draftId);
    expect(draft?.sourceEventManuallyEnabled).toBeNull();
  });

  it("is forced to null for a normal, non-event draft even if a caller mistakenly passes true", async () => {
    db = new FDraftLocalDatabase(`draft-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const draftId = await createOne(repos, {
      sourceEventId: null,
      sourceEventManuallyEnabled: true,
    });

    const draft = await repos.drafts.getById(PROFILE_ID, draftId);
    expect(draft?.sourceEventId).toBeNull();
    expect(draft?.sourceEventManuallyEnabled).toBeNull();
  });
});

describe("expireLocalDraftIfDue", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  async function seedDraft(
    repos: Repositories,
    deadlineAt: string,
    profileId = PROFILE_ID,
  ) {
    await repos.drafts.createDraft({
      id: "draft-1",
      profileId,
      difficulty: "baby",
      timeMode: "timer",
      status: "active",
      totalFilms: 5,
      randomFilmCount: 5,
      challengeFilmCount: 0,
      challengeMode: null,
      startedAt: "2026-01-01T00:00:00.000Z",
      deadlineAt,
      timezone: "UTC",
      completedAt: null,
      freeformAchievedRank: null,
      sourceEventId: null,
      sourceEventManuallyEnabled: null,
      rewardsGrantedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  }

  it("transitions to expired once the deadline has passed", async () => {
    db = new FDraftLocalDatabase(`expire-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedDraft(repos, "2026-01-31T00:00:00.000Z");

    const clock = new FixedClock(new Date("2026-02-01T00:00:00.000Z"));
    const result = await expireLocalDraftIfDue(
      repos,
      { profileId: PROFILE_ID, draftId: "draft-1" },
      { clock },
    );
    expect(result).toBe(true);
    expect((await repos.drafts.getById(PROFILE_ID, "draft-1"))?.status).toBe(
      "expired",
    );
  });

  it("does not transition before the deadline", async () => {
    db = new FDraftLocalDatabase(`expire-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedDraft(repos, "2026-01-31T00:00:00.000Z");

    const clock = new FixedClock(new Date("2026-01-15T00:00:00.000Z"));
    const result = await expireLocalDraftIfDue(
      repos,
      { profileId: PROFILE_ID, draftId: "draft-1" },
      { clock },
    );
    expect(result).toBe(false);
    expect((await repos.drafts.getById(PROFILE_ID, "draft-1"))?.status).toBe(
      "active",
    );
  });

  it("is idempotent — a second call after expiry is a no-op", async () => {
    db = new FDraftLocalDatabase(`expire-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedDraft(repos, "2026-01-31T00:00:00.000Z");
    const clock = new FixedClock(new Date("2026-02-01T00:00:00.000Z"));

    expect(
      await expireLocalDraftIfDue(
        repos,
        { profileId: PROFILE_ID, draftId: "draft-1" },
        { clock },
      ),
    ).toBe(true);
    expect(
      await expireLocalDraftIfDue(
        repos,
        { profileId: PROFILE_ID, draftId: "draft-1" },
        { clock },
      ),
    ).toBe(false);
  });

  it("changing the device clock backward never un-expires or moves a persisted deadline", async () => {
    db = new FDraftLocalDatabase(`expire-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedDraft(repos, "2026-01-31T00:00:00.000Z");

    await expireLocalDraftIfDue(
      repos,
      { profileId: PROFILE_ID, draftId: "draft-1" },
      { clock: new FixedClock(new Date("2026-02-01T00:00:00.000Z")) },
    );
    expect((await repos.drafts.getById(PROFILE_ID, "draft-1"))?.status).toBe(
      "expired",
    );

    // Simulate the device clock being set backward — the already-persisted
    // deadline and expired status must not un-expire.
    const rewound = await expireLocalDraftIfDue(
      repos,
      { profileId: PROFILE_ID, draftId: "draft-1" },
      { clock: new FixedClock(new Date("2026-01-10T00:00:00.000Z")) },
    );
    expect(rewound).toBe(false);
    const draft = await repos.drafts.getById(PROFILE_ID, "draft-1");
    expect(draft?.status).toBe("expired");
    expect(draft?.deadlineAt).toBe("2026-01-31T00:00:00.000Z");
  });

  it("does not expire another profile's draft", async () => {
    db = new FDraftLocalDatabase(`expire-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedDraft(repos, "2026-01-31T00:00:00.000Z", "sam");

    const clock = new FixedClock(new Date("2026-02-01T00:00:00.000Z"));
    const result = await expireLocalDraftIfDue(
      repos,
      { profileId: PROFILE_ID, draftId: "draft-1" },
      { clock },
    );
    expect(result).toBe(false);
    expect((await repos.drafts.getById("sam", "draft-1"))?.status).toBe(
      "active",
    );
  });
});

describe("submitLocalPostmortemResponse + archiveLocalDraftIfResolved", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  async function seedExpiredDraftWithItems(
    repos: Repositories,
    itemCount: number,
    difficulty: "baby" | "freeform" = "baby",
  ) {
    const entryIds = await seedActiveFilms(repos, itemCount);
    await repos.drafts.createDraft({
      id: "draft-1",
      profileId: PROFILE_ID,
      difficulty,
      timeMode: "timer",
      status: "expired",
      totalFilms: itemCount,
      randomFilmCount: itemCount,
      challengeFilmCount: 0,
      challengeMode: null,
      startedAt: "2026-01-01T00:00:00.000Z",
      deadlineAt: "2026-01-31T00:00:00.000Z",
      timezone: "UTC",
      completedAt: null,
      freeformAchievedRank: null,
      sourceEventId: null,
      sourceEventManuallyEnabled: null,
      rewardsGrantedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const items = entryIds.map((entryId, index) => ({
      id: `item-${index}`,
      draftId: "draft-1",
      filmId: `film-${index}`,
      watchlistEntryId: entryId,
      source: "random" as const,
      challengeId: null,
      challengeAttemptId: null,
      challengeDisplayValue: null,
      orderIndex: index,
      isCompleted: false,
      completedAt: null,
      watchedHistoryId: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    }));
    await repos.drafts.createItems(items);
    return { entryIds, items };
  }

  it("'wanted_more_time' increases the watchlist entry's selection weight and logs an audit row", async () => {
    db = new FDraftLocalDatabase(`postmortem-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const { items } = await seedExpiredDraftWithItems(repos, 5);

    const outcome = await submitLocalPostmortemResponse(repos, {
      profileId: PROFILE_ID,
      draftId: "draft-1",
      draftItemId: items[0].id,
      response: "wanted_more_time",
    });
    expect(outcome.ok && outcome.result.applied).toBe(true);

    const entry = await repos.watchlist.getEntryById(
      PROFILE_ID,
      items[0].watchlistEntryId!,
    );
    expect(entry?.selectionWeight).toBe(2);
    expect(entry?.isActive).toBe(true);

    const adjustments = await repos.history.listSelectionWeightAdjustments(
      items[0].watchlistEntryId!,
    );
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0]).toMatchObject({
      delta: 1,
      reason: "postmortem_wanted_more_time",
    });
  });

  it("'not_interested' deactivates the watchlist entry but preserves the draft item", async () => {
    db = new FDraftLocalDatabase(`postmortem-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const { items } = await seedExpiredDraftWithItems(repos, 5);

    await submitLocalPostmortemResponse(repos, {
      profileId: PROFILE_ID,
      draftId: "draft-1",
      draftItemId: items[1].id,
      response: "not_interested",
    });

    const entry = await repos.watchlist.getEntryById(
      PROFILE_ID,
      items[1].watchlistEntryId!,
    );
    expect(entry?.isActive).toBe(false);
    expect(entry?.removedReason).toBe("postmortem_not_interested");

    const item = await repos.drafts.getItemById(items[1].id);
    expect(item?.isCompleted).toBe(false); // historical data untouched
  });

  it("'no_reason' makes no watchlist or weight change", async () => {
    db = new FDraftLocalDatabase(`postmortem-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const { items } = await seedExpiredDraftWithItems(repos, 5);

    await submitLocalPostmortemResponse(repos, {
      profileId: PROFILE_ID,
      draftId: "draft-1",
      draftItemId: items[2].id,
      response: "no_reason",
    });

    const entry = await repos.watchlist.getEntryById(
      PROFILE_ID,
      items[2].watchlistEntryId!,
    );
    expect(entry?.selectionWeight).toBe(1);
    expect(entry?.isActive).toBe(true);
  });

  it("is idempotent — resubmitting (even with a different response) never re-applies a side effect", async () => {
    db = new FDraftLocalDatabase(`postmortem-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const { items } = await seedExpiredDraftWithItems(repos, 5);

    const first = await submitLocalPostmortemResponse(repos, {
      profileId: PROFILE_ID,
      draftId: "draft-1",
      draftItemId: items[0].id,
      response: "wanted_more_time",
    });
    expect(first.ok && first.result.applied).toBe(true);

    const second = await submitLocalPostmortemResponse(repos, {
      profileId: PROFILE_ID,
      draftId: "draft-1",
      draftItemId: items[0].id,
      response: "not_interested",
    });
    expect(second.ok && second.result.applied).toBe(false);
    if (first.ok && second.ok) {
      expect(second.result.responseId).toBe(first.result.responseId);
    }

    const entry = await repos.watchlist.getEntryById(
      PROFILE_ID,
      items[0].watchlistEntryId!,
    );
    expect(entry?.selectionWeight).toBe(2); // not 3 — no double-apply
    expect(entry?.isActive).toBe(true); // the rejected "not_interested" never applied either

    const adjustments = await repos.history.listSelectionWeightAdjustments(
      items[0].watchlistEntryId!,
    );
    expect(adjustments).toHaveLength(1);
  });

  it("archives the draft once every item is resolved, not before", async () => {
    db = new FDraftLocalDatabase(`postmortem-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const { items } = await seedExpiredDraftWithItems(repos, 5);

    for (const item of items.slice(0, 4)) {
      const outcome = await submitLocalPostmortemResponse(repos, {
        profileId: PROFILE_ID,
        draftId: "draft-1",
        draftItemId: item.id,
        response: "no_reason",
      });
      expect(outcome.ok && outcome.result.draftArchived).toBe(false);
    }
    expect((await repos.drafts.getById(PROFILE_ID, "draft-1"))?.status).toBe(
      "expired",
    );

    const final = await submitLocalPostmortemResponse(repos, {
      profileId: PROFILE_ID,
      draftId: "draft-1",
      draftItemId: items[4].id,
      response: "no_reason",
    });
    expect(final.ok && final.result.draftArchived).toBe(true);

    const archived = await repos.drafts.getById(PROFILE_ID, "draft-1");
    expect(archived?.status).toBe("archived");
    expect(archived?.completedAt).not.toBeNull();
  });

  it("computes and persists the Freeform achieved rank on archival", async () => {
    db = new FDraftLocalDatabase(`postmortem-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const { items } = await seedExpiredDraftWithItems(repos, 5, "freeform");

    // Mark all 5 completed directly (as if watched), landing on the Baby threshold.
    for (const item of items) {
      await repos.drafts.updateItem({
        ...item,
        isCompleted: true,
        completedAt: "2026-01-15T00:00:00.000Z",
      });
    }

    const archived = await archiveLocalDraftIfResolved(repos, {
      profileId: PROFILE_ID,
      draftId: "draft-1",
    });
    expect(archived).toBe(true);

    const draft = await repos.drafts.getById(PROFILE_ID, "draft-1");
    expect(draft?.status).toBe("archived");
    expect(draft?.freeformAchievedRank).toBe("baby");
  });

  it("returns not_found for another profile's draft item", async () => {
    db = new FDraftLocalDatabase(`postmortem-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const { items } = await seedExpiredDraftWithItems(repos, 5);

    const outcome = await submitLocalPostmortemResponse(repos, {
      profileId: "someone-else",
      draftId: "draft-1",
      draftItemId: items[0].id,
      response: "wanted_more_time",
    });
    expect(outcome).toEqual({
      ok: false,
      error: "not_found",
      message: expect.any(String),
    });
  });
});

describe("generateLocalFreeformBatch", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("adds another batch, never reusing a film already in the draft", async () => {
    db = new FDraftLocalDatabase(`freeform-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 10);

    const created = await createLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        config: { difficulty: "freeform", timeMode: "calendar" },
      },
      { rng: createSeededRng(1) },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const firstBatchItems = await repos.drafts.listItemsForDraft(
      created.draftId,
    );
    expect(firstBatchItems).toHaveLength(5);

    const outcome = await generateLocalFreeformBatch(
      repos,
      { profileId: PROFILE_ID, draftId: created.draftId },
      { rng: createSeededRng(2) },
    );
    expect(outcome).toEqual({ ok: true, addedCount: 5 });

    const allItems = await repos.drafts.listItemsForDraft(created.draftId);
    expect(allItems).toHaveLength(10);
    expect(new Set(allItems.map((item) => item.filmId)).size).toBe(10); // no repeats

    const draft = await repos.drafts.getById(PROFILE_ID, created.draftId);
    expect(draft?.totalFilms).toBe(10);
  });

  it("fails with nothing_left once every active watchlist film is already in the draft", async () => {
    db = new FDraftLocalDatabase(`freeform-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 5);

    const created = await createLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        config: { difficulty: "freeform", timeMode: "calendar" },
      },
      { rng: createSeededRng(1) },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const outcome = await generateLocalFreeformBatch(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
    });
    expect(outcome).toEqual({
      ok: false,
      error: "nothing_left",
      message: expect.any(String),
    });
  });

  it("refuses to add films to a non-freeform draft", async () => {
    db = new FDraftLocalDatabase(`freeform-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 10);

    const created = await createLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        config: {
          difficulty: "baby",
          timeMode: "timer",
          randomCount: 5,
          challengeCount: 0,
        },
      },
      { rng: createSeededRng(1) },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const outcome = await generateLocalFreeformBatch(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
    });
    expect(outcome).toEqual({
      ok: false,
      error: "not_freeform",
      message: expect.any(String),
    });
  });
});

describe("settleAndDiscardLocalDraft", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  async function seedActiveDraftWithItems(
    repos: Repositories,
    itemCount: number,
    overrides: Partial<
      Parameters<Repositories["drafts"]["createDraft"]>[0]
    > = {},
  ) {
    const entryIds = await seedActiveFilms(repos, itemCount);
    await repos.drafts.createDraft({
      id: "draft-1",
      profileId: PROFILE_ID,
      difficulty: "baby",
      timeMode: "timer",
      status: "active",
      totalFilms: itemCount,
      randomFilmCount: itemCount,
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
      ...overrides,
    });
    const items = entryIds.map((entryId, index) => ({
      id: `item-${index}`,
      draftId: "draft-1",
      filmId: `film-${index}`,
      watchlistEntryId: entryId,
      source: "random" as const,
      challengeId: null,
      challengeAttemptId: null,
      challengeDisplayValue: null,
      orderIndex: index,
      isCompleted: false,
      completedAt: null,
      watchedHistoryId: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    }));
    await repos.drafts.createItems(items);
    return { entryIds, items };
  }

  it("discards an active draft with unresolved items — no postmortem required", async () => {
    db = new FDraftLocalDatabase(`settle-discard-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveDraftWithItems(repos, 3);

    const clock = new FixedClock(new Date("2026-01-15T00:00:00.000Z"));
    const result = await settleAndDiscardLocalDraft(
      repos,
      { profileId: PROFILE_ID, draftId: "draft-1" },
      { clock },
    );
    expect(result).toBe(true);

    const draft = await repos.drafts.getById(PROFILE_ID, "draft-1");
    expect(draft?.status).toBe("discarded");
    expect(draft?.completedAt).toBe("2026-01-15T00:00:00.000Z");
    expect(draft?.rewardsGrantedAt).toBe("2026-01-15T00:00:00.000Z");

    // Items are left exactly as they were — this never touches them.
    const items = await repos.drafts.listItemsForDraft("draft-1");
    expect(items.every((item) => !item.isCompleted)).toBe(true);
  });

  it("never assigns the outgoing draft to any event — sourceEventId is untouched", async () => {
    db = new FDraftLocalDatabase(`settle-discard-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveDraftWithItems(repos, 1, { sourceEventId: null });

    await settleAndDiscardLocalDraft(repos, {
      profileId: PROFILE_ID,
      draftId: "draft-1",
    });

    const draft = await repos.drafts.getById(PROFILE_ID, "draft-1");
    expect(draft?.sourceEventId).toBeNull();
  });

  it("is idempotent: calling it twice only discards and grants rewards once", async () => {
    db = new FDraftLocalDatabase(`settle-discard-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveDraftWithItems(repos, 1);

    const first = await settleAndDiscardLocalDraft(repos, {
      profileId: PROFILE_ID,
      draftId: "draft-1",
    });
    expect(first).toBe(true);
    const afterFirst = await repos.drafts.getById(PROFILE_ID, "draft-1");

    const second = await settleAndDiscardLocalDraft(repos, {
      profileId: PROFILE_ID,
      draftId: "draft-1",
    });
    expect(second).toBe(false);
    const afterSecond = await repos.drafts.getById(PROFILE_ID, "draft-1");
    expect(afterSecond).toEqual(afterFirst);
  });

  it("leaves a draft that already auto-archived (every film watched during Say Goodbye) as archived, not discarded — only settles its rewards", async () => {
    db = new FDraftLocalDatabase(`settle-discard-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveDraftWithItems(repos, 1);

    // Simulate the last film being watched during the Say Goodbye screen,
    // which auto-archives via the normal path (see markLocalFilmWatched ->
    // archiveLocalDraftIfResolved) before settleAndDiscardLocalDraft runs.
    const items = await repos.drafts.listItemsForDraft("draft-1");
    await repos.drafts.updateItem({
      ...items[0],
      isCompleted: true,
      completedAt: "2026-01-10T00:00:00.000Z",
    });
    const archived = await archiveLocalDraftIfResolved(repos, {
      profileId: PROFILE_ID,
      draftId: "draft-1",
    });
    expect(archived).toBe(true);

    // archiveLocalDraftIfResolved itself already granted the reward as
    // part of this normal completion (see event system Phase 5) — so
    // settleAndDiscardLocalDraft now finds nothing left to do.
    const draftAfterArchive = await repos.drafts.getById(PROFILE_ID, "draft-1");
    expect(draftAfterArchive?.rewardsGrantedAt).not.toBeNull();

    const result = await settleAndDiscardLocalDraft(repos, {
      profileId: PROFILE_ID,
      draftId: "draft-1",
    });
    expect(result).toBe(false);

    const draft = await repos.drafts.getById(PROFILE_ID, "draft-1");
    expect(draft?.status).toBe("archived"); // never downgraded to discarded
    expect(draft?.rewardsGrantedAt).toBe(draftAfterArchive?.rewardsGrantedAt);
  });

  it("returns false for a draft that doesn't exist", async () => {
    db = new FDraftLocalDatabase(`settle-discard-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    const result = await settleAndDiscardLocalDraft(repos, {
      profileId: PROFILE_ID,
      draftId: "does-not-exist",
    });
    expect(result).toBe(false);
  });

  it("a discarded draft is never resurrected to archived — the race between watching its last film and confirming Say Goodbye", async () => {
    db = new FDraftLocalDatabase(`settle-discard-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveDraftWithItems(repos, 1);

    // Say Goodbye's confirm lands first...
    await settleAndDiscardLocalDraft(repos, {
      profileId: PROFILE_ID,
      draftId: "draft-1",
    });
    const discarded = await repos.drafts.getById(PROFILE_ID, "draft-1");
    expect(discarded?.status).toBe("discarded");

    // ...then a concurrently in-flight "mark last film watched" call's own
    // archiveLocalDraftIfResolved resolves — this must be a no-op, never
    // flipping the draft back to "archived".
    const items = await repos.drafts.listItemsForDraft("draft-1");
    await repos.drafts.updateItem({
      ...items[0],
      isCompleted: true,
      completedAt: "2026-01-10T00:00:00.000Z",
    });
    const resurrected = await archiveLocalDraftIfResolved(repos, {
      profileId: PROFILE_ID,
      draftId: "draft-1",
    });
    expect(resurrected).toBe(false);

    const draft = await repos.drafts.getById(PROFILE_ID, "draft-1");
    expect(draft?.status).toBe("discarded");
  });
});
