import { afterEach, describe, expect, it } from "vitest";
import {
  attemptOneAtATimeChallenge,
  finalizeOneAtATimeDraft,
  pickOneAtATimeRandomFilm,
} from "@/application/drafts/one-at-a-time-service";
import type { OneAtATimeStagedItem } from "@/domain/drafts/one-at-a-time";
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

function stagedItem(
  overrides: Partial<OneAtATimeStagedItem> = {},
): OneAtATimeStagedItem {
  return {
    localId: crypto.randomUUID(),
    filmId: "film-0",
    watchlistEntryId: "entry-0",
    source: "random",
    challengeId: null,
    challengeDisplayValue: null,
    title: "Film 0",
    releaseYear: 2000,
    posterUrl: null,
    ...overrides,
  };
}

describe("pickOneAtATimeRandomFilm", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("picks an eligible film not already excluded", async () => {
    db = new FDraftLocalDatabase(`oaat-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 3);

    const outcome = await pickOneAtATimeRandomFilm(
      repos,
      { profileId: PROFILE_ID, excludeFilmIds: ["film-0", "film-1"] },
      { rng: createSeededRng(1) },
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.film.filmId).toBe("film-2");
  });

  it("reports nothing_available once every eligible film is excluded", async () => {
    db = new FDraftLocalDatabase(`oaat-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 2);

    const outcome = await pickOneAtATimeRandomFilm(
      repos,
      { profileId: PROFILE_ID, excludeFilmIds: ["film-0", "film-1"] },
      { rng: createSeededRng(1) },
    );

    expect(outcome).toEqual({
      ok: false,
      error: "nothing_available",
      message: expect.any(String),
    });
  });

  it("never returns a film already staged, across many draws", async () => {
    db = new FDraftLocalDatabase(`oaat-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 5);

    const excluded = ["film-0", "film-2"];
    for (let seed = 0; seed < 10; seed++) {
      const outcome = await pickOneAtATimeRandomFilm(
        repos,
        { profileId: PROFILE_ID, excludeFilmIds: excluded },
        { rng: createSeededRng(seed) },
      );
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(excluded).not.toContain(outcome.film.filmId);
      }
    }
  });

  it("respects an exclusion list that also names the current candidate — a Reroll never re-shows it", async () => {
    db = new FDraftLocalDatabase(`oaat-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 2);

    const first = await pickOneAtATimeRandomFilm(
      repos,
      { profileId: PROFILE_ID, excludeFilmIds: [] },
      { rng: createSeededRng(1) },
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const reroll = await pickOneAtATimeRandomFilm(
      repos,
      // The caller (the builder UI) is responsible for adding the current
      // candidate to the exclusion list on Reroll — see this function's
      // own doc comment.
      { profileId: PROFILE_ID, excludeFilmIds: [first.film.filmId] },
      { rng: createSeededRng(1) },
    );
    expect(reroll.ok).toBe(true);
    if (reroll.ok) {
      expect(reroll.film.filmId).not.toBe(first.film.filmId);
    }
  });

  it("enriches the picked candidate with its poster, when metadata exists", async () => {
    db = new FDraftLocalDatabase(`oaat-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 1);
    await repos.films.upsertMetadata({
      id: "film-0-meta",
      filmId: "film-0",
      provider: "tmdb",
      posterUrl: "https://example.invalid/poster.jpg",
      runtimeMinutes: 120,
      genres: null,
      directors: null,
      countries: null,
      languages: null,
      collectionId: null,
      collectionName: null,
      collectionOrder: null,
      averageRating: 4.2,
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

    const outcome = await pickOneAtATimeRandomFilm(
      repos,
      { profileId: PROFILE_ID, excludeFilmIds: [] },
      { rng: createSeededRng(1) },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.film.posterUrl).toBe("https://example.invalid/poster.jpg");
    expect(outcome.film.runtimeMinutes).toBe(120);
    expect(outcome.film.averageRating).toBe(4.2);
  });
});

describe("attemptOneAtATimeChallenge", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("succeeds with a film for an eligible, non-interactive challenge", async () => {
    db = new FDraftLocalDatabase(`oaat-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 3);

    const outcome = await attemptOneAtATimeChallenge(
      repos,
      { profileId: PROFILE_ID, challengeId: "no-homework", excludeFilmIds: [] },
      {
        rng: createSeededRng(1),
        clock: new FixedClock(new Date("2026-01-01")),
      },
    );

    expect(outcome.challengeId).toBe("no-homework");
    expect(outcome.result.status).toBe("success");
  });

  it("enriches a successful resolution with the resolved film's poster", async () => {
    db = new FDraftLocalDatabase(`oaat-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 1);
    await repos.films.upsertMetadata({
      id: "film-0-meta",
      filmId: "film-0",
      provider: "tmdb",
      posterUrl: "https://example.invalid/poster.jpg",
      runtimeMinutes: null,
      genres: null,
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

    const outcome = await attemptOneAtATimeChallenge(
      repos,
      { profileId: PROFILE_ID, challengeId: "no-homework", excludeFilmIds: [] },
      {
        rng: createSeededRng(1),
        clock: new FixedClock(new Date("2026-01-01")),
      },
    );

    expect(outcome.result.status).toBe("success");
    expect(outcome.posterUrl).toBe("https://example.invalid/poster.jpg");
  });

  it("reports a null posterUrl for a non-success result", async () => {
    db = new FDraftLocalDatabase(`oaat-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    // No watchlist films — the attempt cannot succeed.

    const outcome = await attemptOneAtATimeChallenge(
      repos,
      { profileId: PROFILE_ID, challengeId: "no-homework", excludeFilmIds: [] },
      {
        rng: createSeededRng(1),
        clock: new FixedClock(new Date("2026-01-01")),
      },
    );

    expect(outcome.result.status).not.toBe("success");
    expect(outcome.posterUrl).toBeNull();
  });

  it("excludes already-staged films from the attempt's candidate pool", async () => {
    db = new FDraftLocalDatabase(`oaat-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 1);

    const outcome = await attemptOneAtATimeChallenge(
      repos,
      {
        profileId: PROFILE_ID,
        challengeId: "no-homework",
        excludeFilmIds: ["film-0"],
      },
      {
        rng: createSeededRng(1),
        clock: new FixedClock(new Date("2026-01-01")),
      },
    );

    expect(outcome.result.status).not.toBe("success");
  });

  it("returns an ineligible/failure result for an unwinnable challenge, never throwing", async () => {
    db = new FDraftLocalDatabase(`oaat-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    // No watchlist films at all.

    const outcome = await attemptOneAtATimeChallenge(
      repos,
      { profileId: PROFILE_ID, challengeId: "no-homework", excludeFilmIds: [] },
      {
        rng: createSeededRng(1),
        clock: new FixedClock(new Date("2026-01-01")),
      },
    );

    expect(outcome.result.status).not.toBe("success");
  });
});

describe("finalizeOneAtATimeDraft", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("creates a normal active draft with difficulty one-at-a-time and totalFilms equal to the actual count", async () => {
    db = new FDraftLocalDatabase(`oaat-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entryIds = await seedActiveFilms(repos, 1);

    const outcome = await finalizeOneAtATimeDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      timeMode: "timer",
      items: [stagedItem({ filmId: "film-0", watchlistEntryId: entryIds[0] })],
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const draft = await repos.drafts.getById(PROFILE_ID, outcome.draftId);
    expect(draft?.difficulty).toBe("one-at-a-time");
    expect(draft?.status).toBe("active");
    expect(draft?.totalFilms).toBe(1);
    expect(draft?.sourceEventId).toBeNull();
  });

  it("allows an arbitrary staged count (2, 17, ...) — never a fixed size", async () => {
    db = new FDraftLocalDatabase(`oaat-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entryIds = await seedActiveFilms(repos, 17);

    const outcome = await finalizeOneAtATimeDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      timeMode: "timer",
      items: entryIds.map((entryId, index) =>
        stagedItem({
          localId: `local-${index}`,
          filmId: `film-${index}`,
          watchlistEntryId: entryId,
        }),
      ),
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const draft = await repos.drafts.getById(PROFILE_ID, outcome.draftId);
    expect(draft?.totalFilms).toBe(17);
  });

  it("persists each item's own source and challenge metadata, computing randomFilmCount/challengeFilmCount from the actual mix", async () => {
    db = new FDraftLocalDatabase(`oaat-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entryIds = await seedActiveFilms(repos, 3);

    const outcome = await finalizeOneAtATimeDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      timeMode: "timer",
      items: [
        stagedItem({
          localId: "a",
          filmId: "film-0",
          watchlistEntryId: entryIds[0],
          source: "random",
        }),
        stagedItem({
          localId: "b",
          filmId: "film-1",
          watchlistEntryId: entryIds[1],
          source: "manual",
        }),
        stagedItem({
          localId: "c",
          filmId: "film-2",
          watchlistEntryId: entryIds[2],
          source: "challenge",
          challengeId: "no-homework",
          challengeDisplayValue: { some: "value" },
        }),
      ],
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const draft = await repos.drafts.getById(PROFILE_ID, outcome.draftId);
    expect(draft?.randomFilmCount).toBe(1);
    expect(draft?.challengeFilmCount).toBe(1);

    const items = await repos.drafts.listItemsForDraft(outcome.draftId);
    const bySource = new Map(items.map((item) => [item.filmId, item]));
    expect(bySource.get("film-0")?.source).toBe("random");
    expect(bySource.get("film-1")?.source).toBe("manual");
    expect(bySource.get("film-2")?.source).toBe("challenge");
    expect(bySource.get("film-2")?.challengeId).toBe("no-homework");
    expect(bySource.get("film-2")?.challengeDisplayValue).toEqual({
      some: "value",
    });
    // Order preserved exactly as staged.
    expect(items.map((item) => item.orderIndex)).toEqual([0, 1, 2]);
  });

  it("refuses an empty selection", async () => {
    db = new FDraftLocalDatabase(`oaat-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 1);

    const outcome = await finalizeOneAtATimeDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      timeMode: "timer",
      items: [],
    });

    expect(outcome).toEqual({
      ok: false,
      error: "empty_selection",
      message: expect.any(String),
    });
  });

  it("refuses a duplicate staged film", async () => {
    db = new FDraftLocalDatabase(`oaat-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entryIds = await seedActiveFilms(repos, 1);

    const outcome = await finalizeOneAtATimeDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      timeMode: "timer",
      items: [
        stagedItem({
          localId: "a",
          filmId: "film-0",
          watchlistEntryId: entryIds[0],
        }),
        stagedItem({
          localId: "b",
          filmId: "film-0",
          watchlistEntryId: entryIds[0],
        }),
      ],
    });

    expect(outcome).toEqual({
      ok: false,
      error: "duplicate_film",
      message: expect.any(String),
    });
  });

  it("refuses when the profile already has an active normal draft", async () => {
    db = new FDraftLocalDatabase(`oaat-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entryIds = await seedActiveFilms(repos, 2);

    const first = await finalizeOneAtATimeDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      timeMode: "timer",
      items: [stagedItem({ filmId: "film-0", watchlistEntryId: entryIds[0] })],
    });
    expect(first.ok).toBe(true);

    const second = await finalizeOneAtATimeDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      timeMode: "timer",
      items: [stagedItem({ filmId: "film-1", watchlistEntryId: entryIds[1] })],
    });
    expect(second).toEqual({
      ok: false,
      error: "already_active",
      message: expect.any(String),
    });
  });

  it("does not block starting a Halloween Event draft, and vice versa — separate scopes", async () => {
    db = new FDraftLocalDatabase(`oaat-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entryIds = await seedActiveFilms(repos, 1);

    await repos.drafts.createDraft({
      id: "halloween-draft",
      profileId: PROFILE_ID,
      difficulty: "baby",
      timeMode: "timer",
      status: "active",
      totalFilms: 1,
      randomFilmCount: 1,
      challengeFilmCount: 0,
      challengeMode: null,
      startedAt: "2026-10-01T00:00:00.000Z",
      deadlineAt: "2026-11-01T00:00:00.000Z",
      timezone: "UTC",
      completedAt: null,
      freeformAchievedRank: null,
      sourceEventId: "halloween",
      sourceEventManuallyEnabled: false,
      rewardsGrantedAt: null,
      customName: null,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    });

    const outcome = await finalizeOneAtATimeDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      timeMode: "timer",
      items: [stagedItem({ filmId: "film-0", watchlistEntryId: entryIds[0] })],
    });
    expect(outcome.ok).toBe(true);
  });

  it("allows starting a new One At A Time draft once the previous one is archived — restart after completion", async () => {
    db = new FDraftLocalDatabase(`oaat-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const entryIds = await seedActiveFilms(repos, 2);

    const first = await finalizeOneAtATimeDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      timeMode: "timer",
      items: [stagedItem({ filmId: "film-0", watchlistEntryId: entryIds[0] })],
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const draft = await repos.drafts.getById(PROFILE_ID, first.draftId);
    await repos.drafts.updateDraft({
      ...draft!,
      status: "archived",
      completedAt: "2026-01-02T00:00:00.000Z",
    });

    const second = await finalizeOneAtATimeDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      timeMode: "timer",
      items: [stagedItem({ filmId: "film-1", watchlistEntryId: entryIds[1] })],
    });
    expect(second.ok).toBe(true);
  });

  it("picking/attempting candidates alone never creates a draft — only finalize does (cancellation leaves nothing behind)", async () => {
    db = new FDraftLocalDatabase(`oaat-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 3);

    await pickOneAtATimeRandomFilm(
      repos,
      { profileId: PROFILE_ID, excludeFilmIds: [] },
      { rng: createSeededRng(1) },
    );
    await attemptOneAtATimeChallenge(
      repos,
      { profileId: PROFILE_ID, challengeId: "no-homework", excludeFilmIds: [] },
      {
        rng: createSeededRng(1),
        clock: new FixedClock(new Date("2026-01-01")),
      },
    );

    // "Cancelling" the builder is simply never calling finalize — nothing
    // above should have written a draft, an item, or granted any reward.
    expect(await repos.drafts.hasActiveDraft(PROFILE_ID, null)).toBe(false);
  });
});
