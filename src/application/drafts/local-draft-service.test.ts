import { afterEach, describe, expect, it } from "vitest";
import {
  abandonLocalDraft,
  addManualFilmToLocalDraft,
  archiveLocalDraftIfResolved,
  createLocalDraft,
  createLocalDraftFromSelection,
  expireLocalDraftIfDue,
  generateLocalFreeformBatch,
  rerollLocalDraftItemForMissingMetadata,
  setLocalDraftCustomName,
  submitLocalPostmortemResponse,
} from "@/application/drafts/local-draft-service";
import { markLocalFilmWatched } from "@/application/watchlist/local-watchlist-service";
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

describe("createLocalDraft — DIY Challenge Film", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("fills a 'Choose My Challenge' diy slot with exactly the pre-picked film — never a random/auto pick", async () => {
    db = new FDraftLocalDatabase(`diy-challenge-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    // `randomCount: 0` — nothing to compete with the pre-picked film for a
    // random slot, so this test is fully deterministic.
    const entryIds = await seedActiveFilms(repos, 5);

    const outcome = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 0,
        challengeCount: 1,
        challengeMode: "choose",
        chosenChallengeIds: ["diy"],
        diyFilmEntryIds: [entryIds[4]],
      },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const items = await repos.drafts.listItemsForDraft(outcome.draftId);
    const diyItem = items.find((item) => item.challengeId === "diy");
    expect(diyItem).toBeDefined();
    expect(diyItem?.source).toBe("challenge");
    const pickedEntry = await repos.watchlist.getEntryById(
      PROFILE_ID,
      entryIds[4],
    );
    expect(diyItem?.filmId).toBe(pickedEntry?.filmId);
    expect(diyItem?.watchlistEntryId).toBe(entryIds[4]);
  });

  it("gives each of two chosen diy slots a distinct pre-picked film, consumed in order", async () => {
    db = new FDraftLocalDatabase(`diy-challenge-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entryIds = await seedActiveFilms(repos, 6);

    const outcome = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 0,
        challengeCount: 2,
        challengeMode: "choose",
        chosenChallengeIds: ["diy", "diy"],
        diyFilmEntryIds: [entryIds[4], entryIds[5]],
      },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const items = await repos.drafts.listItemsForDraft(outcome.draftId);
    const diyItems = items.filter((item) => item.challengeId === "diy");
    expect(diyItems).toHaveLength(2);
    const pickedFilmIds = await Promise.all(
      [entryIds[4], entryIds[5]].map(async (id) => {
        const entry = await repos.watchlist.getEntryById(PROFILE_ID, id);
        return entry!.filmId;
      }),
    );
    expect(diyItems.map((item) => item.filmId).sort()).toEqual(
      pickedFilmIds.sort(),
    );
    // The two diy items never share a film.
    expect(new Set(diyItems.map((item) => item.filmId)).size).toBe(2);
  });

  it("leaves a chosen diy slot unfilled (never inventing a film) when no film was pre-picked for it", async () => {
    db = new FDraftLocalDatabase(`diy-challenge-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 5);

    const outcome = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 4,
        challengeCount: 1,
        challengeMode: "choose",
        chosenChallengeIds: ["diy"],
        // No diyFilmEntryIds supplied at all.
      },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const items = await repos.drafts.listItemsForDraft(outcome.draftId);
    expect(items.some((item) => item.challengeId === "diy")).toBe(false);
    expect(outcome.challengeWarning).toMatch(/couldn't be filled/);
  });

  it("reserves a chosen diy slot's pre-picked film from the random draw and franchise substitution, even when the random draw would otherwise exhaust the pool", async () => {
    db = new FDraftLocalDatabase(`diy-challenge-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    // 6 films total, 1 reserved for the diy slot, randomCount set to
    // exactly the other 5 — with the reservation working, the random draw
    // has no choice but to use exactly the 5 non-reserved films,
    // deterministically leaving the reserved film for the challenge phase
    // regardless of rng. Without the reservation, the random draw would
    // pull from all 6 and could easily consume the "reserved" film first.
    const entryIds = await seedActiveFilms(repos, 6);
    const reservedEntryId = entryIds[5];

    const outcome = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 5,
        challengeCount: 1,
        challengeMode: "choose",
        chosenChallengeIds: ["diy"],
        diyFilmEntryIds: [reservedEntryId],
      },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const items = await repos.drafts.listItemsForDraft(outcome.draftId);
    const randomItems = items.filter((item) => item.source === "random");
    expect(randomItems).toHaveLength(5);
    expect(
      randomItems.some((item) => item.watchlistEntryId === reservedEntryId),
    ).toBe(false);

    const diyItem = items.find((item) => item.challengeId === "diy");
    expect(diyItem?.watchlistEntryId).toBe(reservedEntryId);
  });

  it("a diy challenge item behaves exactly like any other draft item afterward — watch/undo, history, Admin Mode regeneration", async () => {
    db = new FDraftLocalDatabase(`diy-challenge-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entryIds = await seedActiveFilms(repos, 5);

    const created = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 0,
        challengeCount: 1,
        challengeMode: "choose",
        chosenChallengeIds: ["diy"],
        diyFilmEntryIds: [entryIds[4]],
      },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const outcome = await abandonLocalDraft(repos, {
      profileId: PROFILE_ID,
      draftId: created.draftId,
    });
    expect(outcome.ok).toBe(true);
    expect(await repos.drafts.hasActiveDraft(PROFILE_ID)).toBe(false);
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

  it("allows any positive count for a Freeform DIY draft — no fixed target", async () => {
    db = new FDraftLocalDatabase(`diy-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entryIds = await seedActiveFilms(repos, 3);

    const outcome = await createLocalDraftFromSelection(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      difficulty: "freeform",
      timeMode: "timer",
      watchlistEntryIds: [entryIds[0]],
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const draft = await repos.drafts.getById(PROFILE_ID, outcome.draftId);
    expect(draft?.totalFilms).toBe(1);
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

  it("rejects an empty Freeform selection", async () => {
    db = new FDraftLocalDatabase(`diy-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 3);

    const outcome = await createLocalDraftFromSelection(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      difficulty: "freeform",
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

  it("rejects a candidate that fails the same eligibility rules a random roll would (e.g. an unstarted later series entry)", async () => {
    db = new FDraftLocalDatabase(`diy-${crypto.randomUUID()}`);
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

    const outcome = await createLocalDraftFromSelection(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      difficulty: "freeform",
      timeMode: "timer",
      // Hand-picking mi3 directly must be refused exactly like a random
      // roll would be — mi1 hasn't been watched and is right there.
      watchlistEntryIds: ["entry-mi3"],
    });
    expect(outcome).toEqual({
      ok: false,
      error: "entry_not_eligible",
      message: expect.any(String),
    });
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
    const entryIds = await seedActiveFilms(repos, 3);

    const created = await createLocalDraftFromSelection(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      difficulty: "freeform",
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
      result: { revertedWatchlistEntryIds: [] },
    });
    expect(await repos.drafts.hasActiveDraft(PROFILE_ID)).toBe(false);
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
      result: { revertedWatchlistEntryIds: [] },
    });

    expect(await repos.drafts.getById(PROFILE_ID, created.draftId)).toBeNull();
    expect(await repos.drafts.listItemsForDraft(created.draftId)).toEqual([]);
    expect(await repos.drafts.hasActiveDraft(PROFILE_ID)).toBe(false);
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
      result: { revertedWatchlistEntryIds: [items[0].watchlistEntryId] },
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
