import { afterEach, describe, expect, it } from "vitest";
import {
  archiveLocalDraftIfResolved,
  createLocalDraft,
  expireLocalDraftIfDue,
  generateLocalFreeformBatch,
  submitLocalPostmortemResponse,
} from "@/application/drafts/local-draft-service";
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
