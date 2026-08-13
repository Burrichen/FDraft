import { afterEach, describe, expect, it } from "vitest";
import { createLocalDraft } from "@/application/drafts/local-draft-service";
import { awardDraftCompletionReward } from "@/application/events/draft-completion-reward";
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
