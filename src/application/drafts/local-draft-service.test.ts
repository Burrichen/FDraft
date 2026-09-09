import { afterEach, describe, expect, it } from "vitest";
import {
  abandonLocalDraft,
  addManualFilmToLocalDraft,
  archiveLocalDraftIfResolved,
  createLocalDraft,
  createLocalDraftFromSelection,
  expireLocalDraftIfDue,
  replaceDraftSlot,
  rerollLocalDraftItemForMissingMetadata,
  setLocalDraftCustomName,
  submitLocalPostmortemResponse,
} from "@/application/drafts/local-draft-service";
import {
  F_YOU_ITS_JANUARY_EVENT_ID,
  HALLOWEEN_EVENT_ID,
  SIGNAL_FROM_BEYOND_EVENT_ID,
  WATCHLIST_FRONTIER_EVENT_ID,
} from "@/domain/events/event-registry";
import {
  markLocalDraftItemWatchedWithoutEntry,
  markLocalFilmWatched,
} from "@/application/watchlist/local-watchlist-service";
import { summariseWatchedDraftFilmsBySource } from "@/domain/drafts/draft-source-stats";
import {
  MAX_DRAFT_FILMS,
  resolveDraftCapacity,
  resolveOriginalTargetFilms,
} from "@/domain/drafts/living-draft";
import { createSeededRng } from "@/domain/shared/rng";
import { FixedClock } from "@/domain/time/clock";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import type {
  DraftItemRecord,
  DraftRecord,
  Repositories,
} from "@/repositories";

const PROFILE_ID = "alex";

async function seedActiveFilms(
  repos: Repositories,
  count: number,
  /** Release year of the first film; each subsequent one is a year later. Lower it when seeding enough films that `2000 + count` would land in the future, since an unreleased film is (correctly) never an eligible candidate. */
  firstReleaseYear = 2000,
) {
  const entryIds: string[] = [];
  for (let i = 0; i < count; i++) {
    const filmId = `film-${i}`;
    await repos.films.create({
      id: filmId,
      title: `Film ${i}`,
      releaseYear: firstReleaseYear + i,
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
    releaseDate: null,
    releaseStatus: null,
    providerTitle: null,
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

/** Seeds one active watchlist film with real collection/franchise metadata — for franchise-ordering tests, unlike `seedActiveFilms`'s films, which carry no metadata at all. */
async function seedFranchiseFilm(
  repos: Repositories,
  params: {
    filmId: string;
    entryId: string;
    releaseYear: number;
    collectionId: string | null;
    selectionWeight?: number;
  },
) {
  await repos.films.create({
    id: params.filmId,
    title: params.filmId,
    releaseYear: params.releaseYear,
    letterboxdSlug: params.filmId,
    letterboxdUri: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  await repos.films.upsertMetadata({
    id: `${params.filmId}-meta`,
    filmId: params.filmId,
    provider: "tmdb",
    posterUrl: null,
    runtimeMinutes: null,
    genres: null,
    directors: null,
    countries: null,
    languages: null,
    collectionId: params.collectionId,
    collectionName: null,
    collectionOrder: null,
    averageRating: null,
    popularity: null,
    watchCount: null,
    fansCount: null,
    listAppearances: null,
    externalIds: null,
    raw: null,
    releaseDate: null,
    releaseStatus: null,
    providerTitle: null,
    matchMethod: "automatic",
    lastEnrichedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  await repos.watchlist.createEntry({
    id: params.entryId,
    profileId: PROFILE_ID,
    filmId: params.filmId,
    dateAdded: "2026-01-01",
    position: 0,
    isActive: true,
    selectionWeight: params.selectionWeight ?? 1,
    importSource: null,
    importId: null,
    removedAt: null,
    removedReason: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
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
      eventOccurrenceYear: null,
      customName: null,
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
      eventOccurrenceYear: null,
      customName: null,
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
      originFilmId: null,
      substitutionReason: null,
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

describe("createLocalDraft — franchise chronological order", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("OFF (default): never substitutes, regardless of which franchise entry the normal roll lands on", async () => {
    db = new FDraftLocalDatabase(`franchise-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedFranchiseFilm(repos, {
      filmId: "mi1",
      entryId: "entry-mi1",
      releaseYear: 1996,
      collectionId: "mission-impossible",
    });
    await seedFranchiseFilm(repos, {
      filmId: "mi3",
      entryId: "entry-mi3",
      releaseYear: 2006,
      collectionId: "mission-impossible",
    });

    const outcome = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 1,
        challengeCount: 0,
      },
      // franchiseChronologicalOrder omitted — defaults to off.
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const items = await repos.drafts.listItemsForDraft(outcome.draftId);
    expect(items).toHaveLength(1);
    expect(items[0].originFilmId).toBeNull();
    expect(items[0].substitutionReason).toBeNull();
  });

  it("ON: a later franchise entry is always replaced by the earliest available unwatched entry in the same franchise", async () => {
    db = new FDraftLocalDatabase(`franchise-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedFranchiseFilm(repos, {
      filmId: "mi1",
      entryId: "entry-mi1",
      releaseYear: 1996,
      collectionId: "mission-impossible",
    });
    await seedFranchiseFilm(repos, {
      filmId: "mi3",
      entryId: "entry-mi3",
      releaseYear: 2006,
      collectionId: "mission-impossible",
    });

    // Deterministic regardless of which of the two candidates the plain
    // roll happens to land on: with only these two films in the same
    // franchise and a single random slot, the earliest (mi1) must always
    // be what ends up in the draft — either because it was rolled
    // directly, or because franchise ordering substituted it in for mi3.
    const outcome = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 1,
        challengeCount: 0,
      },
      franchiseChronologicalOrder: true,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const items = await repos.drafts.listItemsForDraft(outcome.draftId);
    expect(items).toHaveLength(1);
    expect(items[0].filmId).toBe("mi1");
    expect(items[0].source).toBe("random");
  });

  it("ON: when the substitution actually happens, records the originally-rolled film and the reason for the UI to explain later", async () => {
    db = new FDraftLocalDatabase(`franchise-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    // A heavily skewed weight makes the later film overwhelmingly likely
    // to be what the plain roll lands on first, so this test can assert
    // on the substitution's own provenance fields specifically.
    await seedFranchiseFilm(repos, {
      filmId: "mi3",
      entryId: "entry-mi3",
      releaseYear: 2006,
      collectionId: "mission-impossible",
      selectionWeight: 1_000_000,
    });
    // mi1 is BOTH a previously-watched entry (an earlier collection
    // member the profile has already seen — see docs/updates, v1.1.0,
    // "DRAFT CANDIDATE INTEGRITY": the baseline eligibility rule added
    // there would otherwise exclude mi3 outright as an "unstarted later
    // series entry", which is exactly what should happen by default —
    // and unrelatedly re-added to the watchlist for a rewatch), so
    // there's still a genuinely eligible mi3 for the opt-in setting to
    // substitute away from.
    await repos.history.addWatchedHistory({
      id: "watched-mi1",
      profileId: PROFILE_ID,
      filmId: "mi1-original-watch",
      watchlistEntryId: null,
      source: "app_watchlist_action",
      watchedDate: "2020-01-01",
      createdAt: "2020-01-01T00:00:00.000Z",
    });
    await repos.films.create({
      id: "mi1-original-watch",
      title: "mi1",
      releaseYear: 1996,
      letterboxdSlug: null,
      letterboxdUri: null,
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
    });
    await repos.films.upsertMetadata({
      id: "mi1-original-watch-meta",
      filmId: "mi1-original-watch",
      provider: "tmdb",
      posterUrl: null,
      runtimeMinutes: null,
      genres: null,
      directors: null,
      countries: null,
      languages: null,
      collectionId: "mission-impossible",
      collectionName: null,
      collectionOrder: null,
      averageRating: null,
      popularity: null,
      watchCount: null,
      fansCount: null,
      listAppearances: null,
      externalIds: null,
      releaseDate: null,
      releaseStatus: null,
      providerTitle: null,
      raw: null,
      matchMethod: "automatic",
      lastEnrichedAt: "2020-01-01T00:00:00.000Z",
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
    });
    await seedFranchiseFilm(repos, {
      filmId: "mi1",
      entryId: "entry-mi1",
      releaseYear: 1996,
      collectionId: "mission-impossible",
      selectionWeight: 1,
    });

    const outcome = await createLocalDraft(
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
        franchiseChronologicalOrder: true,
      },
      { rng: createSeededRng(1) },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const items = await repos.drafts.listItemsForDraft(outcome.draftId);
    expect(items).toHaveLength(1);
    expect(items[0].filmId).toBe("mi1");
    expect(items[0].originFilmId).toBe("mi3");
    expect(items[0].substitutionReason).toBe("franchise_order");
  });

  it("baseline eligibility (unconditional): a later, unstarted series entry is never drafted even with the setting OFF — the earliest unwatched entry is selected directly instead", async () => {
    db = new FDraftLocalDatabase(`franchise-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    // The exact scenario the setting being off-by-default used to leave
    // unprotected (see docs/updates, v1.1.0, "DRAFT CANDIDATE INTEGRITY"
    // — the "Evangelion 2.0" bug report): mi1 hasn't been watched and is
    // still sitting right there on the watchlist, so mi3 must never be
    // the one that ends up in the draft, regardless of the opt-in
    // "Franchises in chronological order?" setting.
    await seedFranchiseFilm(repos, {
      filmId: "mi3",
      entryId: "entry-mi3",
      releaseYear: 2006,
      collectionId: "mission-impossible",
      selectionWeight: 1_000_000,
    });
    await seedFranchiseFilm(repos, {
      filmId: "mi1",
      entryId: "entry-mi1",
      releaseYear: 1996,
      collectionId: "mission-impossible",
      selectionWeight: 1,
    });

    const outcome = await createLocalDraft(
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
        // franchiseChronologicalOrder omitted — defaults to off.
      },
      { rng: createSeededRng(1) },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const items = await repos.drafts.listItemsForDraft(outcome.draftId);
    expect(items).toHaveLength(1);
    expect(items[0].filmId).toBe("mi1");
  });

  it("ON: never substitutes when the earlier entry is already watched (inactive) — general eligibility still applies", async () => {
    db = new FDraftLocalDatabase(`franchise-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedFranchiseFilm(repos, {
      filmId: "mi3",
      entryId: "entry-mi3",
      releaseYear: 2006,
      collectionId: "mission-impossible",
    });
    // mi1 exists but has already been watched — inactive, so it never
    // enters the eligible candidate pool at all.
    await repos.films.create({
      id: "mi1",
      title: "mi1",
      releaseYear: 1996,
      letterboxdSlug: "mi1",
      letterboxdUri: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await repos.films.upsertMetadata({
      id: "mi1-meta",
      filmId: "mi1",
      provider: "tmdb",
      posterUrl: null,
      runtimeMinutes: null,
      genres: null,
      directors: null,
      countries: null,
      languages: null,
      collectionId: "mission-impossible",
      collectionName: null,
      collectionOrder: null,
      averageRating: null,
      popularity: null,
      watchCount: null,
      fansCount: null,
      listAppearances: null,
      externalIds: null,
      raw: null,
      releaseDate: null,
      releaseStatus: null,
      providerTitle: null,
      matchMethod: "automatic",
      lastEnrichedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await repos.watchlist.createEntry({
      id: "entry-mi1",
      profileId: PROFILE_ID,
      filmId: "mi1",
      dateAdded: "2026-01-01",
      position: 0,
      isActive: false,
      selectionWeight: 1,
      importSource: null,
      importId: null,
      removedAt: "2026-01-01T00:00:00.000Z",
      removedReason: "watched",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const outcome = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 1,
        challengeCount: 0,
      },
      franchiseChronologicalOrder: true,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const items = await repos.drafts.listItemsForDraft(outcome.draftId);
    expect(items[0].filmId).toBe("mi3");
    expect(items[0].originFilmId).toBeNull();
  });
});

describe("createLocalDraftFromSelection", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("creates an active draft from exactly the selected films, tagged as manual, in the given order", async () => {
    db = new FDraftLocalDatabase(`diy-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entryIds = await seedActiveFilms(repos, 5);

    const outcome = await createLocalDraftFromSelection(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      difficulty: "baby",
      timeMode: "timer",
      watchlistEntryIds: [
        entryIds[3],
        entryIds[1],
        entryIds[4],
        entryIds[0],
        entryIds[2],
      ],
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const draft = await repos.drafts.getById(PROFILE_ID, outcome.draftId);
    expect(draft?.status).toBe("active");
    expect(draft?.difficulty).toBe("baby");
    expect(draft?.totalFilms).toBe(5);
    expect(draft?.randomFilmCount).toBe(0);
    expect(draft?.challengeFilmCount).toBe(0);

    const items = await repos.drafts.listItemsForDraft(outcome.draftId);
    expect(items).toHaveLength(5);
    expect(items.every((item) => item.source === "manual")).toBe(true);
    expect(items.every((item) => !item.isCompleted)).toBe(true);
    expect(items.map((item) => item.watchlistEntryId)).toEqual([
      entryIds[3],
      entryIds[1],
      entryIds[4],
      entryIds[0],
      entryIds[2],
    ]);
  });

  it("rejects a selection that doesn't exactly match the difficulty's film count", async () => {
    db = new FDraftLocalDatabase(`diy-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entryIds = await seedActiveFilms(repos, 5);

    const outcome = await createLocalDraftFromSelection(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      difficulty: "baby", // needs 5
      timeMode: "timer",
      watchlistEntryIds: entryIds.slice(0, 3),
    });
    expect(outcome).toEqual({
      ok: false,
      error: "invalid_selection_count",
      message: expect.any(String),
    });
  });

  it("rejects an empty selection", async () => {
    db = new FDraftLocalDatabase(`diy-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 5);

    const outcome = await createLocalDraftFromSelection(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      difficulty: "baby",
      timeMode: "timer",
      watchlistEntryIds: [],
    });
    expect(outcome).toEqual({
      ok: false,
      error: "invalid_selection_count",
      message: expect.any(String),
    });
  });

  it("rejects a duplicate entry in the selection", async () => {
    db = new FDraftLocalDatabase(`diy-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entryIds = await seedActiveFilms(repos, 5);

    const outcome = await createLocalDraftFromSelection(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      difficulty: "baby",
      timeMode: "timer",
      watchlistEntryIds: [
        entryIds[0],
        entryIds[0],
        entryIds[1],
        entryIds[2],
        entryIds[3],
      ],
    });
    expect(outcome).toEqual({
      ok: false,
      error: "duplicate_selection",
      message: expect.any(String),
    });
  });

  it("rejects a selection containing an ineligible film (e.g. not on the active watchlist)", async () => {
    db = new FDraftLocalDatabase(`diy-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entryIds = await seedActiveFilms(repos, 4);

    const outcome = await createLocalDraftFromSelection(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      difficulty: "baby", // needs 5, but only 4 exist — one id is invented
      timeMode: "timer",
      watchlistEntryIds: [...entryIds, "not-a-real-entry"],
    });
    expect(outcome).toEqual({
      ok: false,
      error: "entry_not_eligible",
      message: expect.any(String),
    });
  });

  it("does NOT apply the generated-draft 'unstarted later series entry' rule — a later sequel is directly selectable (see docs/updates, v1.1.2)", async () => {
    db = new FDraftLocalDatabase(`diy-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const fillerEntryIds = await seedActiveFilms(repos, 4);
    await seedFranchiseFilm(repos, {
      filmId: "mi1",
      entryId: "entry-mi1",
      releaseYear: 1996,
      collectionId: "mission-impossible",
    });
    await seedFranchiseFilm(repos, {
      filmId: "mi3",
      entryId: "entry-mi3",
      releaseYear: 2006,
      collectionId: "mission-impossible",
    });

    const outcome = await createLocalDraftFromSelection(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      difficulty: "baby",
      timeMode: "timer",
      // A random roll would refuse mi3 while mi1 sits unwatched, but manual
      // DIY selection must not inherit that restriction — the user is
      // choosing deliberately, not being handed a sequel out of order.
      watchlistEntryIds: [...fillerEntryIds, "entry-mi3"],
    });
    expect(outcome.ok).toBe(true);
  });

  it("refuses to create a second DIY draft while one is already active", async () => {
    db = new FDraftLocalDatabase(`diy-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entryIds = await seedActiveFilms(repos, 10);

    const first = await createLocalDraftFromSelection(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      difficulty: "baby",
      timeMode: "timer",
      watchlistEntryIds: entryIds.slice(0, 5),
    });
    expect(first.ok).toBe(true);

    const second = await createLocalDraftFromSelection(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      difficulty: "baby",
      timeMode: "timer",
      watchlistEntryIds: entryIds.slice(5, 10),
    });
    expect(second).toEqual({
      ok: false,
      error: "already_active",
      message: expect.any(String),
    });
  });

  it("a DIY draft can be regenerated (Admin Mode) exactly like any other draft", async () => {
    db = new FDraftLocalDatabase(`diy-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entryIds = await seedActiveFilms(repos, 5);

    const created = await createLocalDraftFromSelection(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      difficulty: "baby",
      timeMode: "timer",
      watchlistEntryIds: entryIds,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const outcome = await abandonLocalDraft(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
    });
    expect(outcome).toEqual({
      ok: true,
      result: { revertedWatchlistEntryIds: [], revertedDraftItemIds: [] },
    });
    expect(await repos.drafts.hasActiveDraft(PROFILE_ID, null)).toBe(false);
  });

  it("survives an app restart/reload — a fresh database connection to the same profile still sees the DIY draft and its items", async () => {
    const dbName = `diy-${crypto.randomUUID()}`;
    db = new FDraftLocalDatabase(dbName);
    const repos = createLocalRepositories(db);
    const entryIds = await seedActiveFilms(repos, 5);

    const created = await createLocalDraftFromSelection(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      difficulty: "baby",
      timeMode: "timer",
      watchlistEntryIds: [
        entryIds[2],
        entryIds[0],
        entryIds[4],
        entryIds[1],
        entryIds[3],
      ],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await db.close();

    // A fresh `FDraftLocalDatabase` opened against the same name is exactly
    // what a new app session does on restart — no data is carried over in
    // memory, only what was actually persisted.
    db = new FDraftLocalDatabase(dbName);
    const reloadedRepos = createLocalRepositories(db);

    const draft = await reloadedRepos.drafts.getById(
      PROFILE_ID,
      created.draftId,
    );
    expect(draft?.status).toBe("active");
    expect(draft?.totalFilms).toBe(5);

    const items = await reloadedRepos.drafts.listItemsForDraft(created.draftId);
    expect(items.every((item) => item.source === "manual")).toBe(true);
    expect(items.map((item) => item.watchlistEntryId)).toEqual([
      entryIds[2],
      entryIds[0],
      entryIds[4],
      entryIds[1],
      entryIds[3],
    ]);
  });
});

describe("setLocalDraftCustomName", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("sets a custom name that a later read reflects", async () => {
    db = new FDraftLocalDatabase(`custom-name-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 5);
    const created = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 5,
        challengeCount: 0,
      },
    });
    if (!created.ok) throw new Error("unreachable");

    const outcome = await setLocalDraftCustomName(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
      customName: "Horror Marathon",
    });
    expect(outcome).toEqual({ ok: true });

    const draft = await repos.drafts.getById(PROFILE_ID, created.draftId);
    expect(draft?.customName).toBe("Horror Marathon");
  });

  it("clearing the custom name (null) restores the generated default", async () => {
    db = new FDraftLocalDatabase(`custom-name-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 5);
    const created = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 5,
        challengeCount: 0,
      },
    });
    if (!created.ok) throw new Error("unreachable");
    await setLocalDraftCustomName(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
      customName: "Horror Marathon",
    });

    await setLocalDraftCustomName(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
      customName: null,
    });

    const draft = await repos.drafts.getById(PROFILE_ID, created.draftId);
    expect(draft?.customName).toBeNull();
  });

  it("an all-whitespace name is treated the same as clearing it", async () => {
    db = new FDraftLocalDatabase(`custom-name-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 5);
    const created = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 5,
        challengeCount: 0,
      },
    });
    if (!created.ok) throw new Error("unreachable");

    await setLocalDraftCustomName(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
      customName: "   ",
    });

    const draft = await repos.drafts.getById(PROFILE_ID, created.draftId);
    expect(draft?.customName).toBeNull();
  });

  it("returns not_found for a draft that doesn't exist", async () => {
    db = new FDraftLocalDatabase(`custom-name-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    const outcome = await setLocalDraftCustomName(repos, {
      profileId: PROFILE_ID,
      draftId: "does-not-exist",
      customName: "X",
    });
    expect(outcome).toEqual({
      ok: false,
      error: "not_found",
      message: expect.any(String),
    });
  });
});

describe("addManualFilmToLocalDraft", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("adds the film as a manual item, growing draft capacity by one, without touching watched state", async () => {
    db = new FDraftLocalDatabase(`manual-add-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entryIds = await seedActiveFilms(repos, 6);
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
    if (!created.ok) throw new Error("unreachable");

    const before = await repos.drafts.listItemsForDraft(created.draftId);
    const unusedEntryId = entryIds.find(
      (id) => !before.some((item) => item.watchlistEntryId === id),
    )!;

    const outcome = await addManualFilmToLocalDraft(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
      watchlistEntryId: unusedEntryId,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const item = await repos.drafts.getItemById(outcome.draftItemId);
    expect(item?.source).toBe("manual");
    expect(item?.isCompleted).toBe(false);
    expect(item?.watchedHistoryId).toBeNull();
    expect(item?.watchlistEntryId).toBe(unusedEntryId);

    const draft = await repos.drafts.getById(PROFILE_ID, created.draftId);
    expect(draft?.totalFilms).toBe(6);
    // Neither the random count nor anything reward/roll-shaped changed —
    // this was never counted as a random pick.
    expect(draft?.randomFilmCount).toBe(5);

    const entry = await repos.watchlist.getEntryById(PROFILE_ID, unusedEntryId);
    expect(entry?.isActive).toBe(true);
  });

  it("refuses a film already in the draft — no duplicates", async () => {
    db = new FDraftLocalDatabase(`manual-add-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entryIds = await seedActiveFilms(repos, 5);
    const created = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 5,
        challengeCount: 0,
      },
    });
    if (!created.ok) throw new Error("unreachable");

    const outcome = await addManualFilmToLocalDraft(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
      watchlistEntryId: entryIds[0],
    });
    expect(outcome).toEqual({
      ok: false,
      error: "already_in_draft",
      message: expect.any(String),
    });
  });

  it("refuses a watchlist entry that isn't active (e.g. already watched)", async () => {
    db = new FDraftLocalDatabase(`manual-add-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entryIds = await seedActiveFilms(repos, 6);
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
    if (!created.ok) throw new Error("unreachable");
    const before = await repos.drafts.listItemsForDraft(created.draftId);
    const unusedEntryId = entryIds.find(
      (id) => !before.some((item) => item.watchlistEntryId === id),
    )!;
    const entry = await repos.watchlist.getEntryById(PROFILE_ID, unusedEntryId);
    await repos.watchlist.updateEntry({
      ...entry!,
      isActive: false,
      removedAt: "2026-01-01T00:00:00.000Z",
      removedReason: "watched",
    });

    const outcome = await addManualFilmToLocalDraft(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
      watchlistEntryId: unusedEntryId,
    });
    expect(outcome).toEqual({
      ok: false,
      error: "entry_not_eligible",
      message: expect.any(String),
    });
  });

  it("refuses to add to a non-active draft", async () => {
    db = new FDraftLocalDatabase(`manual-add-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entryIds = await seedActiveFilms(repos, 6);
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
    if (!created.ok) throw new Error("unreachable");
    const draft = await repos.drafts.getById(PROFILE_ID, created.draftId);
    await repos.drafts.updateDraft({ ...draft!, status: "archived" });
    const before = await repos.drafts.listItemsForDraft(created.draftId);
    const unusedEntryId = entryIds.find(
      (id) => !before.some((item) => item.watchlistEntryId === id),
    )!;

    const outcome = await addManualFilmToLocalDraft(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
      watchlistEntryId: unusedEntryId,
    });
    expect(outcome).toEqual({
      ok: false,
      error: "draft_not_active",
      message: expect.any(String),
    });
  });
});

describe("rerollLocalDraftItemForMissingMetadata", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("replaces a metadata-less item's film in place, without changing draft capacity", async () => {
    db = new FDraftLocalDatabase(`reroll-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    // seedActiveFilms's films carry no metadata at all.
    await seedActiveFilms(repos, 6);
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
    if (!created.ok) throw new Error("unreachable");
    const items = await repos.drafts.listItemsForDraft(created.draftId);
    const target = items[0];

    const outcome = await rerollLocalDraftItemForMissingMetadata(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
      draftItemId: target.id,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const updated = await repos.drafts.getItemById(target.id);
    expect(updated?.filmId).toBe(outcome.newFilmId);
    expect(updated?.filmId).not.toBe(target.filmId);
    expect(updated?.originFilmId).toBe(target.filmId);
    expect(updated?.substitutionReason).toBe("missing_metadata");
    expect(updated?.orderIndex).toBe(target.orderIndex);
    expect(updated?.watchedHistoryId).toBeNull();
    expect(updated?.isCompleted).toBe(false);

    const draft = await repos.drafts.getById(PROFILE_ID, created.draftId);
    expect(draft?.totalFilms).toBe(5); // unchanged — a replacement, not an addition

    // No duplicate: the new film doesn't collide with any other item.
    const allItems = await repos.drafts.listItemsForDraft(created.draftId);
    const filmIds = allItems.map((item) => item.filmId);
    expect(new Set(filmIds).size).toBe(filmIds.length);
  });

  it("refuses to reroll an item whose film already has usable metadata", async () => {
    db = new FDraftLocalDatabase(`reroll-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    // A non-null collectionId is enough real metadata to count as "has
    // usable metadata" — the other fields being null doesn't matter.
    await seedFranchiseFilm(repos, {
      filmId: "has-metadata",
      entryId: "entry-1",
      releaseYear: 2020,
      collectionId: "some-franchise",
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
    });
    if (!created.ok) throw new Error("unreachable");
    const items = await repos.drafts.listItemsForDraft(created.draftId);

    const outcome = await rerollLocalDraftItemForMissingMetadata(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
      draftItemId: items[0].id,
    });
    expect(outcome).toEqual({
      ok: false,
      error: "has_metadata",
      message: expect.any(String),
    });
  });

  it("reports nothing_available when no other watchlist film can replace it", async () => {
    db = new FDraftLocalDatabase(`reroll-${crypto.randomUUID()}`);
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
    const items = await repos.drafts.listItemsForDraft(created.draftId);

    const outcome = await rerollLocalDraftItemForMissingMetadata(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
      draftItemId: items[0].id,
    });
    expect(outcome).toEqual({
      ok: false,
      error: "nothing_available",
      message: expect.any(String),
    });
  });
});

describe("replaceDraftSlot — manual replacement", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("replaces a random slot's film in place with the manually chosen one, keeping the slot random", async () => {
    db = new FDraftLocalDatabase(`replace-manual-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 3);
    const created = await createLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        config: {
          difficulty: "baby",
          timeMode: "timer",
          randomCount: 2,
          challengeCount: 0,
        },
      },
      { rng: createSeededRng(1) },
    );
    if (!created.ok) throw new Error("unreachable");
    const draftBefore = await repos.drafts.getById(PROFILE_ID, created.draftId);
    const items = await repos.drafts.listItemsForDraft(created.draftId);
    const target = items[0];
    const usedFilmIds = new Set(items.map((item) => item.filmId));
    const allEntries = await repos.watchlist.listActiveEntries(PROFILE_ID);
    const unusedEntry = allEntries.find(
      (entry) => !usedFilmIds.has(entry.filmId),
    )!;

    const outcome = await replaceDraftSlot(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
      draftItemId: target.id,
      adminModeEnabled: false,
      mode: { kind: "manual", watchlistEntryId: unusedEntry.id },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.newFilmId).toBe(unusedEntry.filmId);

    const updated = await repos.drafts.getItemById(target.id);
    expect(updated?.filmId).toBe(unusedEntry.filmId);
    expect(updated?.watchlistEntryId).toBe(unusedEntry.id);
    expect(updated?.source).toBe("random");
    expect(updated?.orderIndex).toBe(target.orderIndex);
    expect(updated?.originFilmId).toBe(target.filmId);
    expect(updated?.substitutionReason).toBe("manual_replace");
    expect(updated?.isCompleted).toBe(false);

    // Exactly one slot changed — draft capacity is untouched, and every
    // other item is exactly as it was.
    const draft = await repos.drafts.getById(PROFILE_ID, created.draftId);
    expect(draft?.totalFilms).toBe(draftBefore?.totalFilms);
    const allItemsAfter = await repos.drafts.listItemsForDraft(created.draftId);
    expect(allItemsAfter).toHaveLength(items.length);
    for (const item of items) {
      if (item.id === target.id) continue;
      expect(allItemsAfter.find((other) => other.id === item.id)).toEqual(item);
    }
  });

  it("rejects a film already occupying this or another slot in the draft", async () => {
    db = new FDraftLocalDatabase(`replace-manual-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 3);
    const created = await createLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        config: {
          difficulty: "baby",
          timeMode: "timer",
          randomCount: 2,
          challengeCount: 0,
        },
      },
      { rng: createSeededRng(1) },
    );
    if (!created.ok) throw new Error("unreachable");
    const items = await repos.drafts.listItemsForDraft(created.draftId);
    const [target, other] = items;

    const outcome = await replaceDraftSlot(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
      draftItemId: target.id,
      adminModeEnabled: false,
      mode: { kind: "manual", watchlistEntryId: other.watchlistEntryId! },
    });
    expect(outcome).toEqual({
      ok: false,
      error: "already_in_draft",
      message: expect.any(String),
    });
  });

  it("rejects a watchlist entry that isn't in the manual/DIY-eligible pool", async () => {
    db = new FDraftLocalDatabase(`replace-manual-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 2);
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
      },
      { rng: createSeededRng(1) },
    );
    if (!created.ok) throw new Error("unreachable");
    const items = await repos.drafts.listItemsForDraft(created.draftId);

    const outcome = await replaceDraftSlot(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
      draftItemId: items[0].id,
      adminModeEnabled: false,
      mode: { kind: "manual", watchlistEntryId: "does-not-exist" },
    });
    expect(outcome).toEqual({
      ok: false,
      error: "invalid_candidate",
      message: expect.any(String),
    });
  });

  it("allows manually selecting a later franchise entry — manual selection ignores sequel/franchise restrictions", async () => {
    db = new FDraftLocalDatabase(`replace-manual-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedFranchiseFilm(repos, {
      filmId: "first",
      entryId: "entry-first",
      releaseYear: 2000,
      collectionId: "saga",
    });
    await seedFranchiseFilm(repos, {
      filmId: "second",
      entryId: "entry-second",
      releaseYear: 2010,
      collectionId: "saga",
    });
    await seedActiveFilms(repos, 1);
    // "second" is excluded from the RANDOM pool by the default franchise-
    // ordering rule (an earlier, unwatched "first" is still on the
    // watchlist) — the random slot lands on "first" or "film-0" instead.
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
      },
      { rng: createSeededRng(1) },
    );
    if (!created.ok) throw new Error("unreachable");
    const items = await repos.drafts.listItemsForDraft(created.draftId);
    const target = items[0];
    expect(target.filmId).not.toBe("second");

    const outcome = await replaceDraftSlot(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
      draftItemId: target.id,
      adminModeEnabled: false,
      mode: { kind: "manual", watchlistEntryId: "entry-second" },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.newFilmId).toBe("second");
  });
});

describe("replaceDraftSlot — reroll", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("draws a new random film from the normal candidate pool, never duplicating another slot, keeping the slot random", async () => {
    db = new FDraftLocalDatabase(`replace-reroll-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 6);
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
    if (!created.ok) throw new Error("unreachable");
    const items = await repos.drafts.listItemsForDraft(created.draftId);
    const target = items[0];

    const outcome = await replaceDraftSlot(
      repos,
      {
        profileId: PROFILE_ID,
        draftId: created.draftId,
        draftItemId: target.id,
        adminModeEnabled: false,
        mode: { kind: "reroll" },
      },
      { rng: createSeededRng(2) },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const updated = await repos.drafts.getItemById(target.id);
    expect(updated?.filmId).toBe(outcome.newFilmId);
    expect(updated?.filmId).not.toBe(target.filmId);
    expect(updated?.source).toBe("random");
    expect(updated?.substitutionReason).toBe("user_reroll");
    expect(updated?.originFilmId).toBe(target.filmId);
    expect(updated?.orderIndex).toBe(target.orderIndex);

    const allItems = await repos.drafts.listItemsForDraft(created.draftId);
    const filmIds = allItems.map((item) => item.filmId);
    expect(new Set(filmIds).size).toBe(filmIds.length); // no duplicate
  });

  it("reports nothing_available (no hang) when the candidate pool is exhausted", async () => {
    db = new FDraftLocalDatabase(`replace-reroll-${crypto.randomUUID()}`);
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
    const items = await repos.drafts.listItemsForDraft(created.draftId);

    const outcome = await replaceDraftSlot(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
      draftItemId: items[0].id,
      adminModeEnabled: false,
      mode: { kind: "reroll" },
    });
    expect(outcome).toEqual({
      ok: false,
      error: "nothing_available",
      message: expect.any(String),
    });
  });
});

describe("replaceDraftSlot — permissions", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("refuses to edit a challenge slot in either mode, even with Admin Mode on", async () => {
    db = new FDraftLocalDatabase(`replace-perm-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 2);
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
    const challengeItem: DraftItemRecord = {
      id: "challenge-item-1",
      draftId: created.draftId,
      filmId: "film-1",
      watchlistEntryId: "entry-1",
      source: "challenge",
      challengeId: "some-challenge",
      challengeAttemptId: null,
      challengeDisplayValue: null,
      orderIndex: 99,
      isCompleted: false,
      completedAt: null,
      watchedHistoryId: null,
      originFilmId: null,
      substitutionReason: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    await repos.drafts.createItems([challengeItem]);

    for (const mode of [
      { kind: "manual" as const, watchlistEntryId: "entry-0" },
      { kind: "reroll" as const },
    ]) {
      const outcome = await replaceDraftSlot(repos, {
        profileId: PROFILE_ID,
        draftId: created.draftId,
        draftItemId: challengeItem.id,
        adminModeEnabled: true,
        mode,
      });
      expect(outcome).toEqual({
        ok: false,
        error: "not_permitted",
        message: expect.any(String),
      });
    }
  });

  it("blocks a normal user from editing a random slot on an event-owned draft", async () => {
    db = new FDraftLocalDatabase(`replace-perm-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 3);
    const created = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 2,
        challengeCount: 0,
      },
      sourceEventId: HALLOWEEN_EVENT_ID,
    });
    if (!created.ok) throw new Error("unreachable");
    const items = await repos.drafts.listItemsForDraft(created.draftId);

    const outcome = await replaceDraftSlot(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
      draftItemId: items[0].id,
      adminModeEnabled: false,
      mode: { kind: "reroll" },
    });
    expect(outcome).toEqual({
      ok: false,
      error: "not_permitted",
      message: expect.any(String),
    });
  });

  it("allows Admin Mode to edit a random slot on an event-owned draft", async () => {
    db = new FDraftLocalDatabase(`replace-perm-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 3);
    const created = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 2,
        challengeCount: 0,
      },
      sourceEventId: HALLOWEEN_EVENT_ID,
    });
    if (!created.ok) throw new Error("unreachable");
    const items = await repos.drafts.listItemsForDraft(created.draftId);

    const outcome = await replaceDraftSlot(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
      draftItemId: items[0].id,
      adminModeEnabled: true,
      mode: { kind: "reroll" },
    });
    expect(outcome.ok).toBe(true);
  });
});

describe("replaceDraftSlot — watched-state reconciliation", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("replacing an already-watched slot clears its draft-specific completion but leaves the watched history and watchlist entry untouched", async () => {
    db = new FDraftLocalDatabase(`replace-watched-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 3);
    const created = await createLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        config: {
          difficulty: "baby",
          timeMode: "timer",
          randomCount: 2,
          challengeCount: 0,
        },
      },
      { rng: createSeededRng(1) },
    );
    if (!created.ok) throw new Error("unreachable");
    const items = await repos.drafts.listItemsForDraft(created.draftId);
    const target = items[0];

    const watched = await markLocalFilmWatched(repos, {
      profileId: PROFILE_ID,
      watchlistEntryId: target.watchlistEntryId!,
      profileTimezone: "UTC",
    });
    expect(watched.ok).toBe(true);
    if (!watched.ok) return;

    const watchedItem = await repos.drafts.getItemById(target.id);
    expect(watchedItem?.isCompleted).toBe(true);
    const watchedHistoryId = watchedItem!.watchedHistoryId!;
    const watchedEntryBefore = await repos.watchlist.getEntryById(
      PROFILE_ID,
      target.watchlistEntryId!,
    );
    expect(watchedEntryBefore?.isActive).toBe(false);
    expect(watchedEntryBefore?.removedReason).toBe("watched");

    const usedFilmIds = new Set(items.map((item) => item.filmId));
    const allEntries = await repos.watchlist.listActiveEntries(PROFILE_ID);
    // "watched" deactivated the entry, so `listActiveEntries` no longer
    // returns it — need the unwatched leftover entry to replace into.
    const replacementEntry = allEntries.find(
      (entry) => !usedFilmIds.has(entry.filmId),
    )!;

    const outcome = await replaceDraftSlot(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
      draftItemId: target.id,
      adminModeEnabled: false,
      mode: { kind: "manual", watchlistEntryId: replacementEntry.id },
    });
    expect(outcome.ok).toBe(true);

    const replacedItem = await repos.drafts.getItemById(target.id);
    expect(replacedItem?.isCompleted).toBe(false);
    expect(replacedItem?.completedAt).toBeNull();
    expect(replacedItem?.watchedHistoryId).toBeNull();
    expect(replacedItem?.filmId).toBe(replacementEntry.filmId);

    // The old watched history record and watchlist entry are untouched —
    // the person genuinely watched that film; only its draft credit was
    // revoked.
    const historyAfter = await repos.history.listWatchedHistory(PROFILE_ID);
    expect(historyAfter.some((entry) => entry.id === watchedHistoryId)).toBe(
      true,
    );
    const watchedEntryAfter = await repos.watchlist.getEntryById(
      PROFILE_ID,
      target.watchlistEntryId!,
    );
    expect(watchedEntryAfter).toEqual(watchedEntryBefore);

    // The draft is still active — no reward was granted (and nothing to
    // reverse), since this draft was never fully resolved.
    const draft = await repos.drafts.getById(PROFILE_ID, created.draftId);
    expect(draft?.status).toBe("active");
    expect(draft?.rewardsGrantedAt).toBeNull();
  });
});

describe("abandonLocalDraft", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("deletes an active draft and all of its own rows, with no stale state left behind", async () => {
    db = new FDraftLocalDatabase(`abandon-${crypto.randomUUID()}`);
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

    const outcome = await abandonLocalDraft(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
    });
    expect(outcome).toEqual({
      ok: true,
      result: { revertedWatchlistEntryIds: [], revertedDraftItemIds: [] },
    });

    expect(await repos.drafts.getById(PROFILE_ID, created.draftId)).toBeNull();
    expect(await repos.drafts.listItemsForDraft(created.draftId)).toEqual([]);
    expect(await repos.drafts.hasActiveDraft(PROFILE_ID, null)).toBe(false);
  });

  it("reverts a watch this draft caused, but never touches an unrelated watched film", async () => {
    db = new FDraftLocalDatabase(`abandon-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entryIds = await seedActiveFilms(repos, 4);

    // A film watched entirely independently of the draft below — must
    // still be watched after the draft is abandoned.
    const independentWatch = await markLocalFilmWatched(repos, {
      profileId: PROFILE_ID,
      watchlistEntryId: entryIds[3],
      profileTimezone: "UTC",
    });
    if (!independentWatch.ok) throw new Error("unreachable");

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
    const items = await repos.drafts.listItemsForDraft(created.draftId);
    expect(items).toHaveLength(3);

    // Watch exactly one of the three drafted films through the normal
    // flow — this both marks it watched AND completes its draft item.
    const watched = await markLocalFilmWatched(repos, {
      profileId: PROFILE_ID,
      watchlistEntryId: items[0].watchlistEntryId!,
      profileTimezone: "UTC",
    });
    if (!watched.ok) throw new Error("unreachable");
    expect(watched.draftItemId).toBe(items[0].id);

    const outcome = await abandonLocalDraft(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
    });
    expect(outcome).toEqual({
      ok: true,
      result: {
        revertedWatchlistEntryIds: [items[0].watchlistEntryId],
        revertedDraftItemIds: [items[0].id],
      },
    });

    // The film watched to complete the draft is back on the watchlist,
    // and the watched-history event that draft caused is gone.
    const revertedEntry = await repos.watchlist.getEntryById(
      PROFILE_ID,
      items[0].watchlistEntryId!,
    );
    expect(revertedEntry?.isActive).toBe(true);
    expect(revertedEntry?.removedReason).toBeNull();
    const remainingHistory = await repos.history.listWatchedHistory(PROFILE_ID);
    expect(
      remainingHistory.some((h) => h.id === watched.watchedHistoryId),
    ).toBe(false);

    // The film watched independently of this draft is completely
    // unaffected — never unwatched, its history entry never removed.
    const independentEntry = await repos.watchlist.getEntryById(
      PROFILE_ID,
      entryIds[3],
    );
    expect(independentEntry?.isActive).toBe(false);
    expect(independentEntry?.removedReason).toBe("watched");
    expect(
      remainingHistory.some((h) => h.id === independentWatch.watchedHistoryId),
    ).toBe(true);

    // Every other film that was simply never watched is untouched too —
    // still active, still on the watchlist, ready to be drafted again.
    for (const entryId of entryIds.slice(0, 3)) {
      if (entryId === items[0].watchlistEntryId) continue;
      const entry = await repos.watchlist.getEntryById(PROFILE_ID, entryId);
      expect(entry?.isActive).toBe(true);
    }
  });

  it("reverts a completed Halloween off-watchlist item (null watchlistEntryId) instead of silently skipping it", async () => {
    db = new FDraftLocalDatabase(`abandon-no-entry-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await repos.films.create({
      id: "horror-film-1",
      title: "The Exorcist",
      releaseYear: 1973,
      letterboxdSlug: null,
      letterboxdUri: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const draft: DraftRecord = {
      id: "halloween-draft-1",
      profileId: PROFILE_ID,
      difficulty: "baby",
      timeMode: "timer",
      status: "active",
      totalFilms: 1,
      randomFilmCount: 1,
      challengeFilmCount: 0,
      challengeMode: null,
      startedAt: "2026-01-01T00:00:00.000Z",
      deadlineAt: "2026-02-01T00:00:00.000Z",
      timezone: "UTC",
      completedAt: null,
      freeformAchievedRank: null,
      sourceEventId: HALLOWEEN_EVENT_ID,
      sourceEventManuallyEnabled: null,
      rewardsGrantedAt: null,
      eventOccurrenceYear: null,
      customName: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    await repos.drafts.createDraft(draft);
    await repos.drafts.createItems([
      {
        id: "horror-item-1",
        draftId: draft.id,
        filmId: "horror-film-1",
        watchlistEntryId: null,
        source: "horror",
        challengeId: null,
        challengeAttemptId: null,
        challengeDisplayValue: null,
        orderIndex: 0,
        isCompleted: false,
        completedAt: null,
        watchedHistoryId: null,
        originFilmId: null,
        substitutionReason: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    const watched = await markLocalDraftItemWatchedWithoutEntry(repos, {
      profileId: PROFILE_ID,
      draftItemId: "horror-item-1",
      profileTimezone: "UTC",
    });
    expect(watched.ok).toBe(true);

    const outcome = await abandonLocalDraft(repos, {
      profileId: PROFILE_ID,
      draftId: draft.id,
    });
    expect(outcome).toEqual({
      ok: true,
      result: {
        revertedWatchlistEntryIds: [],
        revertedDraftItemIds: ["horror-item-1"],
      },
    });

    const remainingHistory = await repos.history.listWatchedHistory(PROFILE_ID);
    expect(remainingHistory).toHaveLength(0);
    expect(await repos.drafts.getById(PROFILE_ID, draft.id)).toBeNull();
  });

  it("allows a fresh draft to be created normally afterward", async () => {
    db = new FDraftLocalDatabase(`abandon-${crypto.randomUUID()}`);
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

    // Without abandoning first, a second draft is correctly refused.
    const blocked = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 3,
        challengeCount: 0,
      },
    });
    expect(blocked).toEqual({
      ok: false,
      error: "already_active",
      message: expect.any(String),
    });

    await abandonLocalDraft(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
    });

    const recreated = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 3,
        challengeCount: 0,
      },
    });
    expect(recreated.ok).toBe(true);
  });

  it("fails with not_found for an unknown draft id", async () => {
    db = new FDraftLocalDatabase(`abandon-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    const outcome = await abandonLocalDraft(repos, {
      profileId: PROFILE_ID,
      draftId: "nonexistent",
    });
    expect(outcome).toEqual({
      ok: false,
      error: "not_found",
      message: expect.any(String),
    });
  });

  it("fails with not_active for an expired draft", async () => {
    db = new FDraftLocalDatabase(`abandon-${crypto.randomUUID()}`);
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

    const draft = await repos.drafts.getById(PROFILE_ID, created.draftId);
    await repos.drafts.updateDraft({ ...draft!, status: "expired" });

    const outcome = await abandonLocalDraft(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
    });
    expect(outcome).toEqual({
      ok: false,
      error: "not_active",
      message: expect.any(String),
    });
  });
});
describe("archiveLocalDraftIfResolved — a discarded draft is never resurrected (defensive guard, PROMPT B2.1)", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("leaves a discarded draft discarded even after completing its last item", async () => {
    db = new FDraftLocalDatabase(`discarded-guard-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const [entryId] = await seedActiveFilms(repos, 1);
    await repos.drafts.createDraft({
      id: "draft-1",
      profileId: PROFILE_ID,
      difficulty: "baby",
      timeMode: "timer",
      // No live flow produces "discarded" anymore (the "Say Goodbye" event
      // transition this status was originally for was removed — see
      // docs/updates, "PROMPT B2.1 — DUAL DRAFT ARCHITECTURE" §1), but an
      // older backup can still carry one, so `archiveLocalDraftIfResolved`
      // must keep treating it as terminal regardless of how it got there.
      status: "discarded",
      totalFilms: 1,
      randomFilmCount: 1,
      challengeFilmCount: 0,
      challengeMode: null,
      startedAt: "2026-01-01T00:00:00.000Z",
      deadlineAt: "2026-02-01T00:00:00.000Z",
      timezone: "UTC",
      completedAt: "2026-01-05T00:00:00.000Z",
      freeformAchievedRank: null,
      sourceEventId: null,
      sourceEventManuallyEnabled: null,
      rewardsGrantedAt: null,
      eventOccurrenceYear: null,
      customName: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-05T00:00:00.000Z",
    });
    await repos.drafts.createItems([
      {
        id: "item-0",
        draftId: "draft-1",
        filmId: "film-0",
        watchlistEntryId: entryId,
        source: "random",
        challengeId: null,
        challengeAttemptId: null,
        challengeDisplayValue: null,
        orderIndex: 0,
        isCompleted: true,
        completedAt: "2026-01-10T00:00:00.000Z",
        watchedHistoryId: null,
        originFilmId: null,
        substitutionReason: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    const resurrected = await archiveLocalDraftIfResolved(repos, {
      profileId: PROFILE_ID,
      draftId: "draft-1",
    });
    expect(resurrected).toBe(false);

    const draft = await repos.drafts.getById(PROFILE_ID, "draft-1");
    expect(draft?.status).toBe("discarded");
    expect(draft?.rewardsGrantedAt).toBeNull();
  });
});

/**
 * docs/updates, "FDRAFT v1.2.1 — LIVING DRAFTS" §1/§2: every film records
 * HOW it entered its Draft, and a Challenge film records WHICH Challenge
 * put it there. The pure derivation rules live in
 * `domain/drafts/living-draft.test.ts`; these are the persistence ones.
 */
describe("Living Drafts — per-film entry source (§1/§2)", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("tags a generated draft's random films as random, with their own entry time", async () => {
    db = new FDraftLocalDatabase(`entry-source-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 6);
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
      {
        rng: createSeededRng(1),
        clock: new FixedClock(new Date("2026-01-02T00:00:00.000Z")),
      },
    );
    if (!created.ok) throw new Error("unreachable");

    const items = await repos.drafts.listItemsForDraft(created.draftId);
    expect(items).toHaveLength(5);
    for (const item of items) {
      expect(item.entrySource).toBe("random");
      expect(item.enteredAt).toBe("2026-01-02T00:00:00.000Z");
    }
  });

  it("tags a DIY-selected draft's films as diy, distinguishing them from a later manual add", async () => {
    db = new FDraftLocalDatabase(`entry-source-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entryIds = await seedActiveFilms(repos, 6);
    const created = await createLocalDraftFromSelection(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      difficulty: "baby",
      timeMode: "timer",
      watchlistEntryIds: entryIds.slice(0, 5),
    });
    if (!created.ok) throw new Error("unreachable");

    const diyItems = await repos.drafts.listItemsForDraft(created.draftId);
    expect(diyItems.map((item) => item.entrySource)).toEqual([
      "diy",
      "diy",
      "diy",
      "diy",
      "diy",
    ]);
    // Both write `source: "manual"` — which is exactly why `entrySource`
    // exists as its own field rather than being derived from it.
    expect(diyItems.every((item) => item.source === "manual")).toBe(true);

    const added = await addManualFilmToLocalDraft(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
      watchlistEntryId: entryIds[5],
    });
    if (!added.ok) throw new Error(`add failed: ${added.error}`);
    const addedItem = await repos.drafts.getItemById(added.draftItemId);
    expect(addedItem?.source).toBe("manual");
    expect(addedItem?.entrySource).toBe("manual_add");
  });

  it("tags a manual replacement and a reroll differently from the slot they replaced", async () => {
    db = new FDraftLocalDatabase(`entry-source-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entryIds = await seedActiveFilms(repos, 8);
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
      { rng: createSeededRng(2) },
    );
    if (!created.ok) throw new Error("unreachable");
    const items = await repos.drafts.listItemsForDraft(created.draftId);
    const spare = entryIds.find(
      (id) => !items.some((item) => item.watchlistEntryId === id),
    )!;

    const replaced = await replaceDraftSlot(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
      draftItemId: items[0].id,
      adminModeEnabled: false,
      mode: { kind: "manual", watchlistEntryId: spare },
    });
    expect(replaced.ok).toBe(true);
    expect((await repos.drafts.getItemById(items[0].id))?.entrySource).toBe(
      "manual_replace",
    );

    const rerolled = await replaceDraftSlot(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
      draftItemId: items[1].id,
      adminModeEnabled: false,
      mode: { kind: "reroll" },
    });
    expect(rerolled.ok).toBe(true);
    expect((await repos.drafts.getItemById(items[1].id))?.entrySource).toBe(
      "reroll",
    );
  });

  it("keeps a Challenge film's Challenge identity through persistence and archival (§2)", async () => {
    db = new FDraftLocalDatabase(`entry-source-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 6);
    const created = await createLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        config: {
          difficulty: "baby",
          timeMode: "timer",
          randomCount: 4,
          challengeCount: 1,
        },
      },
      { rng: createSeededRng(4) },
    );
    if (!created.ok) throw new Error("unreachable");

    const items = await repos.drafts.listItemsForDraft(created.draftId);
    const challengeItem = items.find((item) => item.source === "challenge");
    if (!challengeItem) throw new Error("no challenge slot generated");
    expect(challengeItem.entrySource).toBe("challenge");
    // WHICH Challenge, not merely "a challenge" — the whole point of §2.
    expect(challengeItem.challengeId).toBeTruthy();

    // Watch everything so the draft archives, then re-read it: a completed
    // Draft must still carry the Challenge context Stats will want (§8).
    for (const item of items) {
      await markLocalFilmWatched(
        repos,
        {
          profileId: PROFILE_ID,
          watchlistEntryId: item.watchlistEntryId!,
          profileTimezone: "UTC",
        },
        { archiveIfResolved: archiveLocalDraftIfResolved },
      );
    }
    expect(
      (await repos.drafts.getById(PROFILE_ID, created.draftId))?.status,
    ).toBe("archived");
    const archivedItem = await repos.drafts.getItemById(challengeItem.id);
    expect(archivedItem?.entrySource).toBe("challenge");
    expect(archivedItem?.challengeId).toBe(challengeItem.challengeId);
    expect(archivedItem?.challengeAttemptId).toBe(
      challengeItem.challengeAttemptId,
    );
    expect(archivedItem?.challengeDisplayValue).toEqual(
      challengeItem.challengeDisplayValue,
    );
  });
});

/** docs/updates, "FDRAFT v1.2.1 — LIVING DRAFTS" §3: a Draft may change size; its difficulty may not. */
describe("Living Drafts — size and capacity (§3)", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("grows the Draft's current size while leaving its difficulty and original target alone", async () => {
    db = new FDraftLocalDatabase(`capacity-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entryIds = await seedActiveFilms(repos, 8);
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
      { rng: createSeededRng(5) },
    );
    if (!created.ok) throw new Error("unreachable");

    const before = await repos.drafts.getById(PROFILE_ID, created.draftId);
    expect(before?.originalTargetFilms).toBe(5);

    const items = await repos.drafts.listItemsForDraft(created.draftId);
    const spares = entryIds.filter(
      (id) => !items.some((item) => item.watchlistEntryId === id),
    );
    for (const entryId of spares.slice(0, 2)) {
      const added = await addManualFilmToLocalDraft(repos, {
        profileId: PROFILE_ID,
        draftId: created.draftId,
        watchlistEntryId: entryId,
      });
      if (!added.ok) throw new Error(`add failed: ${added.error}`);
    }

    const after = await repos.drafts.getById(PROFILE_ID, created.draftId);
    expect(await repos.drafts.listItemsForDraft(created.draftId)).toHaveLength(
      7,
    );
    expect(after?.totalFilms).toBe(7);
    // The Draft is bigger; what it WAS is untouched.
    expect(after?.difficulty).toBe("baby");
    expect(after?.originalTargetFilms).toBe(5);
    expect(resolveOriginalTargetFilms(after!)).toBe(5);
    expect(after?.randomFilmCount).toBe(5);
  });

  it("refuses to exceed the 30-film maximum, rather than silently overflowing (§3)", async () => {
    db = new FDraftLocalDatabase(`capacity-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entryIds = await seedActiveFilms(repos, MAX_DRAFT_FILMS + 3, 1970);
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
      { rng: createSeededRng(6) },
    );
    if (!created.ok) throw new Error("unreachable");
    const items = await repos.drafts.listItemsForDraft(created.draftId);
    const spares = entryIds.filter(
      (id) => !items.some((item) => item.watchlistEntryId === id),
    );

    // Fill it exactly to the cap.
    for (const entryId of spares.slice(0, MAX_DRAFT_FILMS - 5)) {
      const added = await addManualFilmToLocalDraft(repos, {
        profileId: PROFILE_ID,
        draftId: created.draftId,
        watchlistEntryId: entryId,
      });
      if (!added.ok) throw new Error(`add failed: ${added.error}`);
    }
    expect(await repos.drafts.listItemsForDraft(created.draftId)).toHaveLength(
      MAX_DRAFT_FILMS,
    );

    const overflow = await addManualFilmToLocalDraft(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
      watchlistEntryId: spares[MAX_DRAFT_FILMS - 5],
    });
    expect(overflow).toEqual({
      ok: false,
      error: "draft_full",
      message: expect.stringContaining(String(MAX_DRAFT_FILMS)),
    });
    // Nothing was written — the refusal is total, not partial.
    expect(await repos.drafts.listItemsForDraft(created.draftId)).toHaveLength(
      MAX_DRAFT_FILMS,
    );
    const draft = await repos.drafts.getById(PROFILE_ID, created.draftId);
    expect(draft?.totalFilms).toBe(MAX_DRAFT_FILMS);
    // The capacity helper the UI will use agrees with what the service did.
    expect(resolveDraftCapacity(MAX_DRAFT_FILMS)).toMatchObject({
      canAddFilm: false,
      refusal: "at_capacity",
    });
  });
});

/** docs/updates, "FDRAFT v1.2.1 — LIVING DRAFTS" §7: a manual choice is not a generated one. */
describe("Living Drafts — manual selection overrides generation settings (§7)", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("adds a later franchise entry that random generation would never roll", async () => {
    db = new FDraftLocalDatabase(`manual-override-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    // mi1 (1996) unwatched makes mi3 (2006) an "unstarted later series
    // entry" — excluded from GENERATION candidates by the baseline
    // eligibility rule (see `evaluateCandidateEligibility`'s
    // `later_series_entry`), which is why the single random slot below can
    // only ever be mi1.
    await seedFranchiseFilm(repos, {
      filmId: "mi1",
      entryId: "entry-mi1",
      releaseYear: 1996,
      collectionId: "mission-impossible",
    });
    await seedFranchiseFilm(repos, {
      filmId: "mi3",
      entryId: "entry-mi3",
      releaseYear: 2006,
      collectionId: "mission-impossible",
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
        franchiseChronologicalOrder: true,
      },
      { rng: createSeededRng(9) },
    );
    if (!created.ok) throw new Error("unreachable");
    const generated = await repos.drafts.listItemsForDraft(created.draftId);
    expect(generated).toHaveLength(1);
    expect(generated[0].filmId).toBe("mi1");

    // Explicitly asking for mi3 is a different question from "what should
    // the engine roll?", and gets a different answer.
    const added = await addManualFilmToLocalDraft(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
      watchlistEntryId: "entry-mi3",
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const addedItem = await repos.drafts.getItemById(added.draftItemId);
    expect(addedItem?.filmId).toBe("mi3");
    expect(addedItem?.entrySource).toBe("manual_add");
  });

  it("still refuses a film that is objectively unusable, not merely restricted", async () => {
    db = new FDraftLocalDatabase(`manual-override-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entryIds = await seedActiveFilms(repos, 7);
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
      { rng: createSeededRng(11) },
    );
    if (!created.ok) throw new Error("unreachable");
    const items = await repos.drafts.listItemsForDraft(created.draftId);
    const spares = entryIds.filter(
      (id) => !items.some((item) => item.watchlistEntryId === id),
    );

    // Already watched outside any draft: overriding generation preferences
    // is not the same as overriding reality.
    const watched = await markLocalFilmWatched(repos, {
      profileId: PROFILE_ID,
      watchlistEntryId: spares[0],
      profileTimezone: "UTC",
    });
    expect(watched.ok).toBe(true);

    expect(
      await addManualFilmToLocalDraft(repos, {
        profileId: PROFILE_ID,
        draftId: created.draftId,
        watchlistEntryId: spares[0],
      }),
    ).toEqual({
      ok: false,
      error: "entry_not_eligible",
      message: expect.any(String),
    });
  });
});

/** docs/updates, "FDRAFT v1.2.1 — LIVING DRAFTS" §4: completion counts what is in the Draft NOW. */
describe("Living Drafts — completion uses the current film count (§4)", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("a 10-film Draft with three films added needs all 13 watched, not 10", async () => {
    db = new FDraftLocalDatabase(`completion-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entryIds = await seedActiveFilms(repos, 16);
    const created = await createLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        config: {
          difficulty: "medium",
          timeMode: "timer",
          randomCount: 10,
          challengeCount: 0,
        },
      },
      { rng: createSeededRng(13) },
    );
    if (!created.ok) throw new Error("unreachable");
    const original = await repos.drafts.listItemsForDraft(created.draftId);
    expect(original).toHaveLength(10);

    const spares = entryIds.filter(
      (id) => !original.some((item) => item.watchlistEntryId === id),
    );
    for (const entryId of spares.slice(0, 3)) {
      const added = await addManualFilmToLocalDraft(repos, {
        profileId: PROFILE_ID,
        draftId: created.draftId,
        watchlistEntryId: entryId,
      });
      if (!added.ok) throw new Error(`add failed: ${added.error}`);
    }

    // The original ten watched — a fixed-size reading of completion would
    // award the Draft here. It must not.
    for (const item of original) {
      await markLocalFilmWatched(
        repos,
        {
          profileId: PROFILE_ID,
          watchlistEntryId: item.watchlistEntryId!,
          profileTimezone: "UTC",
        },
        { archiveIfResolved: archiveLocalDraftIfResolved },
      );
    }
    const midway = await repos.drafts.getById(PROFILE_ID, created.draftId);
    expect(midway?.status).toBe("active");
    expect(midway?.completedAt).toBeNull();
    expect(midway?.rewardsGrantedAt).toBeNull();
    expect(await repos.points.getBalance(PROFILE_ID, "lifetime")).toBe(0);
    // Progress is judged against 13, so ten watched is not "done".
    const midwayItems = await repos.drafts.listItemsForDraft(created.draftId);
    expect(midwayItems).toHaveLength(13);
    expect(midwayItems.filter((item) => item.isCompleted)).toHaveLength(10);

    const remaining = midwayItems.filter((item) => !item.isCompleted);
    expect(remaining).toHaveLength(3);
    for (const item of remaining) {
      await markLocalFilmWatched(
        repos,
        {
          profileId: PROFILE_ID,
          watchlistEntryId: item.watchlistEntryId!,
          profileTimezone: "UTC",
        },
        { archiveIfResolved: archiveLocalDraftIfResolved },
      );
    }

    const finished = await repos.drafts.getById(PROFILE_ID, created.draftId);
    expect(finished?.status).toBe("archived");
    expect(finished?.completedAt).not.toBeNull();
    expect(finished?.rewardsGrantedAt).not.toBeNull();
    expect(await repos.points.getBalance(PROFILE_ID, "lifetime")).toBe(1);
    // The Draft's identity still says Medium, ten films.
    expect(finished?.difficulty).toBe("medium");
    expect(finished?.originalTargetFilms).toBe(10);
  });
});

/** docs/updates, "FDRAFT v1.2.1 — LIVING DRAFTS" §8: what Stats will read, from completed Drafts as well as the active one. */
describe("Living Drafts — completed Drafts retain their source data (§8)", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("summarises watched films by source across a finished Draft's persisted items", async () => {
    db = new FDraftLocalDatabase(`stats-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entryIds = await seedActiveFilms(repos, 8);
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
      { rng: createSeededRng(17) },
    );
    if (!created.ok) throw new Error("unreachable");
    const original = await repos.drafts.listItemsForDraft(created.draftId);
    const spares = entryIds.filter(
      (id) => !original.some((item) => item.watchlistEntryId === id),
    );

    const added = await addManualFilmToLocalDraft(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
      watchlistEntryId: spares[0],
    });
    if (!added.ok) throw new Error("unreachable");

    for (const item of await repos.drafts.listItemsForDraft(created.draftId)) {
      await markLocalFilmWatched(
        repos,
        {
          profileId: PROFILE_ID,
          watchlistEntryId: item.watchlistEntryId!,
          profileTimezone: "UTC",
        },
        { archiveIfResolved: archiveLocalDraftIfResolved },
      );
    }
    expect(
      (await repos.drafts.getById(PROFILE_ID, created.draftId))?.status,
    ).toBe("archived");

    // Read back exactly as a Stats surface would: the archived Draft's own
    // items, no separate historical copy required.
    const archivedItems = await repos.drafts.listItemsForDraft(created.draftId);
    const breakdown = summariseWatchedDraftFilmsBySource(archivedItems);
    expect(breakdown.totalWatchedFilms).toBe(6);
    expect(
      breakdown.stats.find((stat) => stat.source === "random")?.watchedFilms,
    ).toBe(5);
    expect(
      breakdown.stats.find((stat) => stat.source === "manual_add")
        ?.watchedFilms,
    ).toBe(1);
    expect(
      breakdown.stats.find((stat) => stat.source === "manual_add")
        ?.percentOfWatched,
    ).toBe(17);
  });
});

/** docs/updates, "FDRAFT v1.2.1 — LIVING DRAFTS" §9: an Event's Draft answers to that Event's rules, on whatever route the add arrives. */
describe("Living Drafts — Event additions (§9)", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  async function draftWithSourceEvent(
    repos: Repositories,
    sourceEventId: string | null,
  ) {
    const entryIds = await seedActiveFilms(repos, 7);
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
      { rng: createSeededRng(19) },
    );
    if (!created.ok) throw new Error("unreachable");
    const draft = await repos.drafts.getById(PROFILE_ID, created.draftId);
    // Re-tagged rather than generated through the event's own service:
    // what is under test is the mutation guard reading
    // `DraftRecord.sourceEventId`, not how the draft came to have one.
    await repos.drafts.updateDraft({ ...draft!, sourceEventId });
    const items = await repos.drafts.listItemsForDraft(created.draftId);
    const spares = entryIds.filter(
      (id) => !items.some((item) => item.watchlistEntryId === id),
    );
    return { draftId: created.draftId, spareEntryId: spares[0] };
  }

  it("refuses to add a film to a single-film Event's Draft (January)", async () => {
    db = new FDraftLocalDatabase(`event-add-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const { draftId, spareEntryId } = await draftWithSourceEvent(
      repos,
      F_YOU_ITS_JANUARY_EVENT_ID,
    );

    expect(
      await addManualFilmToLocalDraft(repos, {
        profileId: PROFILE_ID,
        draftId,
        watchlistEntryId: spareEntryId,
      }),
    ).toEqual({
      ok: false,
      error: "event_add_disabled",
      message: expect.any(String),
    });
    expect(await repos.drafts.listItemsForDraft(draftId)).toHaveLength(5);
  });

  it("still allows adds to a multi-film Event's Draft, and to a normal one", async () => {
    db = new FDraftLocalDatabase(`event-add-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const halloween = await draftWithSourceEvent(repos, HALLOWEEN_EVENT_ID);
    expect(
      (
        await addManualFilmToLocalDraft(repos, {
          profileId: PROFILE_ID,
          draftId: halloween.draftId,
          watchlistEntryId: halloween.spareEntryId,
        })
      ).ok,
    ).toBe(true);

    await db.delete();
    db = new FDraftLocalDatabase(`event-add-${crypto.randomUUID()}`);
    const normalRepos = createLocalRepositories(db);
    const normal = await draftWithSourceEvent(normalRepos, null);
    expect(
      (
        await addManualFilmToLocalDraft(normalRepos, {
          profileId: PROFILE_ID,
          draftId: normal.draftId,
          watchlistEntryId: normal.spareEntryId,
        })
      ).ok,
    ).toBe(true);
  });
});

/**
 * docs/updates, "FDRAFT v1.2.1 — LIVING DRAFTS" Part 2 §4: the Watchlist
 * card's Add action, taken when no draft exists, creates a NORMAL draft
 * that is guaranteed to contain the chosen film.
 */
describe("createLocalDraft — starting from a chosen film (Part 2 §4)", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("includes the chosen film as the draft's first, manually-added slot", async () => {
    db = new FDraftLocalDatabase(`start-with-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entryIds = await seedActiveFilms(repos, 10);

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
        startWithWatchlistEntryId: entryIds[7],
      },
      { rng: createSeededRng(21) },
    );
    if (!created.ok) throw new Error(`creation failed: ${created.error}`);

    const items = await repos.drafts.listItemsForDraft(created.draftId);
    const chosen = items.find((item) => item.watchlistEntryId === entryIds[7]);
    expect(chosen).toBeDefined();
    expect(chosen?.orderIndex).toBe(0);
    expect(chosen?.source).toBe("manual");
    expect(chosen?.entrySource).toBe("manual_add");
    // A normal draft of its difficulty's size — the chosen film takes one
    // of the five slots rather than being added on top of them.
    expect(items).toHaveLength(5);
    const draft = await repos.drafts.getById(PROFILE_ID, created.draftId);
    expect(draft?.difficulty).toBe("baby");
    expect(draft?.totalFilms).toBe(5);
    expect(draft?.originalTargetFilms).toBe(5);
    // And it is a plain draft, not a new kind of one.
    expect(draft?.sourceEventId).toBeNull();
    expect(draft?.mutationHistory).toEqual([]);
  });

  it("never rolls the chosen film a second time", async () => {
    db = new FDraftLocalDatabase(`start-with-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entryIds = await seedActiveFilms(repos, 6);

    // Five random slots from six films, one of which is pinned: the roll
    // has no room to avoid the pinned film by luck.
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
        startWithWatchlistEntryId: entryIds[0],
      },
      { rng: createSeededRng(22) },
    );
    if (!created.ok) throw new Error(`creation failed: ${created.error}`);

    const items = await repos.drafts.listItemsForDraft(created.draftId);
    expect(items).toHaveLength(5);
    expect(new Set(items.map((item) => item.filmId)).size).toBe(5);
    expect(
      items.filter((item) => item.watchlistEntryId === entryIds[0]),
    ).toHaveLength(1);
  });

  it("accepts a film normal generation would never roll (§3)", async () => {
    db = new FDraftLocalDatabase(`start-with-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    // mi3 is an "unstarted later series entry" while mi1 is unwatched —
    // excluded from the generation pool, but an explicit choice.
    await seedFranchiseFilm(repos, {
      filmId: "mi1",
      entryId: "entry-mi1",
      releaseYear: 1996,
      collectionId: "mission-impossible",
    });
    await seedFranchiseFilm(repos, {
      filmId: "mi3",
      entryId: "entry-mi3",
      releaseYear: 2006,
      collectionId: "mission-impossible",
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
        franchiseChronologicalOrder: true,
        startWithWatchlistEntryId: "entry-mi3",
      },
      { rng: createSeededRng(23) },
    );
    if (!created.ok) throw new Error(`creation failed: ${created.error}`);

    const items = await repos.drafts.listItemsForDraft(created.draftId);
    // The pinned sequel took the single random slot, so it is the whole
    // draft — and it is genuinely mi3, not substituted back to mi1.
    expect(items).toHaveLength(1);
    expect(items[0].filmId).toBe("mi3");
    expect(items[0].entrySource).toBe("manual_add");
    expect(items[0].substitutionReason).toBeNull();
  });

  it("takes a challenge slot when the user asked for no random films", async () => {
    db = new FDraftLocalDatabase(`start-with-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entryIds = await seedActiveFilms(repos, 10);

    const created = await createLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        config: {
          difficulty: "baby",
          timeMode: "timer",
          randomCount: 0,
          challengeCount: 5,
          challengeMode: "decide",
        },
        startWithWatchlistEntryId: entryIds[3],
      },
      { rng: createSeededRng(24) },
    );
    if (!created.ok) throw new Error(`creation failed: ${created.error}`);

    const items = await repos.drafts.listItemsForDraft(created.draftId);
    // Still a five-film Baby draft: the chosen film plus four challenge
    // slots, rather than five challenges plus an extra.
    expect(items.length).toBeLessThanOrEqual(5);
    const manual = items.filter((item) => item.entrySource === "manual_add");
    expect(manual).toHaveLength(1);
    expect(manual[0].watchlistEntryId).toBe(entryIds[3]);
    expect(
      items.filter((item) => item.source === "challenge").length,
    ).toBeLessThanOrEqual(4);
  });

  it("refuses a chosen film that is genuinely unusable, without creating a draft", async () => {
    db = new FDraftLocalDatabase(`start-with-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entryIds = await seedActiveFilms(repos, 8);
    // Watched outside any draft — not a restriction, an impossibility.
    const watched = await markLocalFilmWatched(repos, {
      profileId: PROFILE_ID,
      watchlistEntryId: entryIds[0],
      profileTimezone: "UTC",
    });
    expect(watched.ok).toBe(true);

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
        startWithWatchlistEntryId: entryIds[0],
      },
      { rng: createSeededRng(25) },
    );
    expect(outcome).toEqual({
      ok: false,
      error: "start_film_not_eligible",
      message: expect.any(String),
    });
    expect(await repos.drafts.hasActiveDraft(PROFILE_ID, null)).toBe(false);
  });

  it("counts the chosen film toward the films the draft needs", async () => {
    db = new FDraftLocalDatabase(`start-with-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    // Exactly five films for a five-film draft: pinning one leaves four to
    // roll for four remaining slots, which must be enough.
    const entryIds = await seedActiveFilms(repos, 5);

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
        startWithWatchlistEntryId: entryIds[2],
      },
      { rng: createSeededRng(26) },
    );
    if (!created.ok) throw new Error(`creation failed: ${created.error}`);
    expect(await repos.drafts.listItemsForDraft(created.draftId)).toHaveLength(
      5,
    );
  });
});

/**
 * docs/updates, "FDRAFT v1.2.1 — LIVING DRAFTS" Part 3 §6/§7/§10: a film
 * hand-added to an Event's Draft is an Event film, must be inside that
 * Event's own boundary, and is subject to the same 30-film maximum.
 */
describe("addManualFilmToLocalDraft — into an Event's Draft (Part 3)", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  /** A draft re-tagged as Event-owned — what is under test is the mutation's own Event gate, not how the draft came to have a `sourceEventId`. */
  async function eventDraftWithSpares(
    repos: Repositories,
    sourceEventId: string,
    seedCount = 8,
    // Lowered when seeding enough films that `2000 + count` would land in
    // the future, since an unreleased film is (correctly) never eligible.
    firstReleaseYear = 2000,
  ) {
    const entryIds = await seedActiveFilms(repos, seedCount, firstReleaseYear);
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
      { rng: createSeededRng(31) },
    );
    if (!created.ok) throw new Error("unreachable");
    const draft = await repos.drafts.getById(PROFILE_ID, created.draftId);
    await repos.drafts.updateDraft({ ...draft!, sourceEventId });
    const items = await repos.drafts.listItemsForDraft(created.draftId);
    return {
      draftId: created.draftId,
      spares: entryIds.filter(
        (id) => !items.some((item) => item.watchlistEntryId === id),
      ),
    };
  }

  it("stores an Event Draft's manual addition as an event film, not a manual add (§6)", async () => {
    db = new FDraftLocalDatabase(`event-add-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const { draftId, spares } = await eventDraftWithSpares(
      repos,
      HALLOWEEN_EVENT_ID,
    );

    const added = await addManualFilmToLocalDraft(repos, {
      profileId: PROFILE_ID,
      draftId,
      watchlistEntryId: spares[0],
    });
    if (!added.ok) throw new Error(`add failed: ${added.error}`);

    const item = await repos.drafts.getItemById(added.draftItemId);
    // `event` is what Stats counts it as (Part 3 §1/§6) — deliberately a
    // separate source from `manual_add`.
    expect(item?.entrySource).toBe("event");
    expect(item?.source).toBe("manual");
    // The Event's identity stays on the owning draft rather than being
    // duplicated per item, and no visible category label is invented.
    expect(item?.eventCategoryKey ?? null).toBeNull();
    const draft = await repos.drafts.getById(PROFILE_ID, draftId);
    expect(draft?.sourceEventId).toBe(HALLOWEEN_EVENT_ID);
    // Still a recorded, undoable mutation like any other addition (§11).
    expect(draft?.mutationHistory).toHaveLength(1);
    expect(draft?.mutationHistory?.[0]).toMatchObject({
      kind: "add",
      draftItemId: added.draftItemId,
    });
  });

  it("refuses a film outside a restrictive Event's own boundary (§7)", async () => {
    db = new FDraftLocalDatabase(`event-add-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    // The Watchlist Frontier requires Westerns.
    const { draftId } = await eventDraftWithSpares(
      repos,
      WATCHLIST_FRONTIER_EVENT_ID,
    );
    const horrorEntryId = await seedActiveFilmWithGenres(repos, "horror-film", [
      "Horror",
    ]);
    const westernEntryId = await seedActiveFilmWithGenres(
      repos,
      "western-film",
      ["Western"],
    );

    expect(
      await addManualFilmToLocalDraft(repos, {
        profileId: PROFILE_ID,
        draftId,
        watchlistEntryId: horrorEntryId,
      }),
    ).toEqual({
      ok: false,
      error: "film_not_eligible_for_event",
      message: expect.any(String),
    });

    // The same explicit choice IS accepted for a film the Event allows —
    // proving the refusal is the Event's boundary, not manual adds being
    // blocked wholesale.
    const allowed = await addManualFilmToLocalDraft(repos, {
      profileId: PROFILE_ID,
      draftId,
      watchlistEntryId: westernEntryId,
    });
    expect(allowed.ok).toBe(true);
    if (!allowed.ok) return;
    expect(
      (await repos.drafts.getItemById(allowed.draftItemId))?.entrySource,
    ).toBe("event");
  });

  it("never adds to January's Draft, whatever the film (§8)", async () => {
    db = new FDraftLocalDatabase(`event-add-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const { draftId, spares } = await eventDraftWithSpares(
      repos,
      F_YOU_ITS_JANUARY_EVENT_ID,
    );

    expect(
      await addManualFilmToLocalDraft(repos, {
        profileId: PROFILE_ID,
        draftId,
        watchlistEntryId: spares[0],
      }),
    ).toEqual({
      ok: false,
      error: "event_add_disabled",
      message: expect.any(String),
    });
    expect(await repos.drafts.listItemsForDraft(draftId)).toHaveLength(5);
  });

  it("applies the 30-film maximum to an Event Draft too (§10)", async () => {
    db = new FDraftLocalDatabase(`event-add-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const { draftId, spares } = await eventDraftWithSpares(
      repos,
      HALLOWEEN_EVENT_ID,
      MAX_DRAFT_FILMS + 3,
      1970,
    );

    for (const entryId of spares.slice(0, MAX_DRAFT_FILMS - 5)) {
      const added = await addManualFilmToLocalDraft(repos, {
        profileId: PROFILE_ID,
        draftId,
        watchlistEntryId: entryId,
      });
      if (!added.ok) throw new Error(`add failed: ${added.error}`);
    }
    expect(await repos.drafts.listItemsForDraft(draftId)).toHaveLength(
      MAX_DRAFT_FILMS,
    );

    expect(
      await addManualFilmToLocalDraft(repos, {
        profileId: PROFILE_ID,
        draftId,
        watchlistEntryId: spares[MAX_DRAFT_FILMS - 5],
      }),
    ).toMatchObject({ ok: false, error: "draft_full" });
  });
});
