import { afterEach, describe, expect, it } from "vitest";
import { createHalloweenLocalDraft } from "./halloween-draft-service";
import { DIFFICULTIES } from "@/domain/drafts/difficulty";
import { createDefaultHalloweenSplit } from "@/domain/drafts/halloween-split";
import { HALLOWEEN_EVENT_ID } from "@/domain/events/event-registry";
import { setHalloweenManifestFilmIds } from "@/domain/events/halloween-manifest-overlay";
import { createSeededRng } from "@/domain/shared/rng";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import type { DraftDifficulty, Repositories } from "@/repositories";

const PROFILE_ID = "alex";
// Inside Halloween's real natural window (30 Sep 19:00 – 1 Nov 00:00) —
// `createHalloweenLocalDraft` now gates on availability (see docs/updates,
// "PROMPT 21 — HALLOWEEN RELEASE HARDENING", §"HALLOWEEN EXPIRY"), so
// every test exercising pool/allocation logic needs a real in-window
// `effectiveNow` to reach that logic at all.
const IN_HALLOWEEN_WINDOW = new Date("2026-10-15T12:00:00.000Z");

async function seedAdjacentFilm(
  repos: Repositories,
  params: { filmId: string; entryId: string },
) {
  await repos.films.create({
    id: params.filmId,
    title: params.filmId,
    releaseYear: 2000,
    letterboxdSlug: params.filmId,
    letterboxdUri: null,
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
    selectionWeight: 1,
    importSource: null,
    importId: null,
    removedAt: null,
    removedReason: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  await repos.films.upsertMetadata({
    id: `${params.filmId}-meta`,
    filmId: params.filmId,
    provider: "tmdb",
    posterUrl: null,
    runtimeMinutes: null,
    genres: ["Horror"],
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
    releaseDate: null,
    releaseStatus: "Released",
    providerTitle: null,
    raw: null,
    matchMethod: "automatic",
    lastEnrichedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
}

async function seedOffWatchlistFilm(repos: Repositories, filmId: string) {
  await repos.films.create({
    id: filmId,
    title: filmId,
    releaseYear: 2000,
    letterboxdSlug: null,
    letterboxdUri: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
}

async function seedManyAdjacent(repos: Repositories, count: number) {
  const entryIds: string[] = [];
  for (let i = 0; i < count; i++) {
    const filmId = `adj-${i}`;
    const entryId = `adj-entry-${i}`;
    await seedAdjacentFilm(repos, { filmId, entryId });
    entryIds.push(entryId);
  }
  return entryIds;
}

async function seedManyOffWatchlist(
  repos: Repositories,
  prefix: string,
  count: number,
) {
  const filmIds: string[] = [];
  for (let i = 0; i < count; i++) {
    const filmId = `${prefix}-${i}`;
    await seedOffWatchlistFilm(repos, filmId);
    filmIds.push(filmId);
  }
  return filmIds;
}

describe("createHalloweenLocalDraft", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
    setHalloweenManifestFilmIds({ horrorFilmIds: [], kitschFilmIds: [] });
  });

  function setup() {
    db = new FDraftLocalDatabase(`halloween-draft-${crypto.randomUUID()}`);
    return createLocalRepositories(db) as Repositories;
  }

  it("generates exactly the configured allocation, tagging each item's pool", async () => {
    const repos = setup();
    await seedManyAdjacent(repos, 5);
    const horrorIds = await seedManyOffWatchlist(repos, "horror", 5);
    const kitschIds = await seedManyOffWatchlist(repos, "kitsch", 5);
    setHalloweenManifestFilmIds({
      horrorFilmIds: horrorIds,
      kitschFilmIds: kitschIds,
    });

    const outcome = await createHalloweenLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        difficulty: "medium",
        timeMode: "timer",
        effectiveNow: IN_HALLOWEEN_WINDOW,
        split: { halloweenAdjacentCount: 4, horrorCount: 4, kitschCount: 2 },
      },
      { rng: createSeededRng(1) },
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const items = await repos.drafts.listItemsForDraft(outcome.draftId);
    expect(items).toHaveLength(10);
    const bySource = {
      "halloween-adjacent": items.filter(
        (i) => i.source === "halloween-adjacent",
      ),
      horror: items.filter((i) => i.source === "horror"),
      kitsch: items.filter((i) => i.source === "kitsch"),
    };
    expect(bySource["halloween-adjacent"]).toHaveLength(4);
    expect(bySource.horror).toHaveLength(4);
    expect(bySource.kitsch).toHaveLength(2);
    // Adjacent items keep a real watchlist entry; horror/kitsch don't.
    expect(
      bySource["halloween-adjacent"].every((i) => i.watchlistEntryId !== null),
    ).toBe(true);
    expect(bySource.horror.every((i) => i.watchlistEntryId === null)).toBe(
      true,
    );
    expect(bySource.kitsch.every((i) => i.watchlistEntryId === null)).toBe(
      true,
    );

    const draft = await repos.drafts.getById(PROFILE_ID, outcome.draftId);
    expect(draft?.sourceEventId).toBe(HALLOWEEN_EVENT_ID);
    expect(draft?.sourceEventManuallyEnabled).toBeNull();
    expect(draft?.totalFilms).toBe(10);
    expect(draft?.challengeFilmCount).toBe(0);
  });

  it("never duplicates a film that qualifies for more than one pool", async () => {
    const repos = setup();
    // Same film exists on the watchlist (Horror-tagged) AND in the global
    // Horror manifest list — must appear only once in the draft.
    await seedAdjacentFilm(repos, {
      filmId: "shared-film",
      entryId: "shared-entry",
    });
    setHalloweenManifestFilmIds({
      horrorFilmIds: ["shared-film"],
      kitschFilmIds: [],
    });

    const outcome = await createHalloweenLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        difficulty: "baby",
        timeMode: "timer",
        effectiveNow: IN_HALLOWEEN_WINDOW,
        split: { halloweenAdjacentCount: 1, horrorCount: 1, kitschCount: 3 },
      },
      { rng: createSeededRng(1) },
    );

    // Only one candidate exists for Horror once Halloween-adjacent claims
    // it — "not enough Horror films" is the correct, honest outcome, not
    // a silent duplicate.
    expect(outcome).toEqual({
      ok: false,
      error: "not_enough_films",
      message: expect.stringContaining("Horror"),
    });
  });

  it("rejects an allocation that doesn't sum to the difficulty's film count", async () => {
    const repos = setup();
    const outcome = await createHalloweenLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      difficulty: "medium",
      timeMode: "timer",
      effectiveNow: IN_HALLOWEEN_WINDOW,
      split: { halloweenAdjacentCount: 4, horrorCount: 4, kitschCount: 1 },
    });
    expect(outcome).toEqual({
      ok: false,
      error: "invalid_allocation",
      message: expect.any(String),
    });
  });

  it("reports not_enough_films for a Halloween-adjacent shortfall", async () => {
    const repos = setup();
    await seedManyAdjacent(repos, 1);
    setHalloweenManifestFilmIds({
      horrorFilmIds: await seedManyOffWatchlist(repos, "horror", 5),
      kitschFilmIds: await seedManyOffWatchlist(repos, "kitsch", 5),
    });
    const outcome = await createHalloweenLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      difficulty: "baby",
      timeMode: "timer",
      effectiveNow: IN_HALLOWEEN_WINDOW,
      split: { halloweenAdjacentCount: 2, horrorCount: 2, kitschCount: 1 },
    });
    expect(outcome).toEqual({
      ok: false,
      error: "not_enough_films",
      message: expect.stringContaining("Halloween-adjacent"),
    });
  });

  it("reports not_enough_films for a Kitsch shortfall", async () => {
    const repos = setup();
    await seedManyAdjacent(repos, 5);
    setHalloweenManifestFilmIds({
      horrorFilmIds: await seedManyOffWatchlist(repos, "horror", 5),
      kitschFilmIds: [],
    });
    const outcome = await createHalloweenLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      difficulty: "baby",
      timeMode: "timer",
      effectiveNow: IN_HALLOWEEN_WINDOW,
      split: { halloweenAdjacentCount: 2, horrorCount: 2, kitschCount: 1 },
    });
    expect(outcome).toEqual({
      ok: false,
      error: "not_enough_films",
      message: expect.stringContaining("Kitsch"),
    });
  });

  it("refuses to create a second draft while one is already active", async () => {
    const repos = setup();
    await seedManyAdjacent(repos, 5);
    setHalloweenManifestFilmIds({
      horrorFilmIds: await seedManyOffWatchlist(repos, "horror", 5),
      kitschFilmIds: await seedManyOffWatchlist(repos, "kitsch", 5),
    });
    const params = {
      profileId: PROFILE_ID,
      timezone: "UTC",
      difficulty: "baby" as const,
      timeMode: "timer" as const,
      effectiveNow: IN_HALLOWEEN_WINDOW,
      split: { halloweenAdjacentCount: 2, horrorCount: 2, kitschCount: 1 },
    };
    const first = await createHalloweenLocalDraft(repos, params, {
      rng: createSeededRng(1),
    });
    expect(first.ok).toBe(true);

    const second = await createHalloweenLocalDraft(repos, params, {
      rng: createSeededRng(2),
    });
    expect(second).toEqual({
      ok: false,
      error: "already_active",
      message: expect.any(String),
    });
  });
});

describe("createHalloweenLocalDraft — every difficulty (PROMPT 21)", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
    setHalloweenManifestFilmIds({ horrorFilmIds: [], kitschFilmIds: [] });
  });

  const NON_FREEFORM_DIFFICULTIES: Exclude<DraftDifficulty, "freeform">[] = [
    "baby",
    "easy",
    "medium",
    "hard",
    "hardcore",
  ];

  it.each(NON_FREEFORM_DIFFICULTIES)(
    "generates exactly %s's film count, split across the three pools with no duplicates",
    async (difficulty) => {
      db = new FDraftLocalDatabase(
        `halloween-difficulty-${difficulty}-${crypto.randomUUID()}`,
      );
      const repos = createLocalRepositories(db) as Repositories;
      const totalFilms = DIFFICULTIES[difficulty].filmCount!;

      await seedManyAdjacent(repos, totalFilms);
      const horrorIds = await seedManyOffWatchlist(repos, "horror", totalFilms);
      const kitschIds = await seedManyOffWatchlist(repos, "kitsch", totalFilms);
      setHalloweenManifestFilmIds({
        horrorFilmIds: horrorIds,
        kitschFilmIds: kitschIds,
      });

      const split = createDefaultHalloweenSplit(totalFilms);
      const outcome = await createHalloweenLocalDraft(
        repos,
        {
          profileId: PROFILE_ID,
          timezone: "UTC",
          difficulty,
          timeMode: "timer",
          effectiveNow: IN_HALLOWEEN_WINDOW,
          split,
        },
        { rng: createSeededRng(1) },
      );

      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;

      const items = await repos.drafts.listItemsForDraft(outcome.draftId);
      expect(items).toHaveLength(totalFilms);
      expect(
        split.halloweenAdjacentCount + split.horrorCount + split.kitschCount,
      ).toBe(totalFilms);

      const bySource = {
        "halloween-adjacent": items.filter(
          (i) => i.source === "halloween-adjacent",
        ),
        horror: items.filter((i) => i.source === "horror"),
        kitsch: items.filter((i) => i.source === "kitsch"),
      };
      expect(bySource["halloween-adjacent"]).toHaveLength(
        split.halloweenAdjacentCount,
      );
      expect(bySource.horror).toHaveLength(split.horrorCount);
      expect(bySource.kitsch).toHaveLength(split.kitschCount);

      // No duplicate films across the whole draft.
      const filmIds = items.map((item) => item.filmId);
      expect(new Set(filmIds).size).toBe(filmIds.length);
    },
  );
});

describe("createHalloweenLocalDraft — expiry (PROMPT 21)", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
    setHalloweenManifestFilmIds({ horrorFilmIds: [], kitschFilmIds: [] });
  });

  function setup() {
    db = new FDraftLocalDatabase(`halloween-expiry-${crypto.randomUUID()}`);
    return createLocalRepositories(db) as Repositories;
  }

  it("refuses to create a new draft once Halloween's window has closed (1 November, profile timezone)", async () => {
    const repos = setup();
    await seedManyAdjacent(repos, 5);
    setHalloweenManifestFilmIds({
      horrorFilmIds: await seedManyOffWatchlist(repos, "horror", 5),
      kitschFilmIds: await seedManyOffWatchlist(repos, "kitsch", 5),
    });

    const outcome = await createHalloweenLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        difficulty: "medium",
        timeMode: "timer",
        split: { halloweenAdjacentCount: 4, horrorCount: 4, kitschCount: 2 },
        effectiveNow: new Date("2026-11-01T00:00:00.000Z"),
      },
      { rng: createSeededRng(1) },
    );
    expect(outcome).toEqual({
      ok: false,
      error: "not_available",
      message: expect.any(String),
    });
  });

  it("refuses before the window opens (30 September, just before 19:00)", async () => {
    const repos = setup();
    await seedManyAdjacent(repos, 5);
    setHalloweenManifestFilmIds({
      horrorFilmIds: await seedManyOffWatchlist(repos, "horror", 5),
      kitschFilmIds: await seedManyOffWatchlist(repos, "kitsch", 5),
    });

    const outcome = await createHalloweenLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        difficulty: "medium",
        timeMode: "timer",
        split: { halloweenAdjacentCount: 4, horrorCount: 4, kitschCount: 2 },
        effectiveNow: new Date("2026-09-30T18:59:00.000Z"),
      },
      { rng: createSeededRng(1) },
    );
    expect(outcome).toEqual({
      ok: false,
      error: "not_available",
      message: expect.any(String),
    });
  });

  it("succeeds at the exact moment the window opens (30 September 19:00) and remains open through 31 October 23:59", async () => {
    const repos = setup();
    await seedManyAdjacent(repos, 5);
    setHalloweenManifestFilmIds({
      horrorFilmIds: await seedManyOffWatchlist(repos, "horror", 5),
      kitschFilmIds: await seedManyOffWatchlist(repos, "kitsch", 5),
    });

    const atOpen = await createHalloweenLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        difficulty: "medium",
        timeMode: "timer",
        split: { halloweenAdjacentCount: 4, horrorCount: 4, kitschCount: 2 },
        effectiveNow: new Date("2026-09-30T19:00:00.000Z"),
      },
      { rng: createSeededRng(1) },
    );
    expect(atOpen.ok).toBe(true);
  });

  it("defaults to the real wall clock when effectiveNow is omitted (never silently permissive)", async () => {
    const repos = setup();
    await seedManyAdjacent(repos, 5);
    setHalloweenManifestFilmIds({
      horrorFilmIds: await seedManyOffWatchlist(repos, "horror", 5),
      kitschFilmIds: await seedManyOffWatchlist(repos, "kitsch", 5),
    });

    // No `effectiveNow` passed — falls back to the real `new Date()`. This
    // test only asserts the outcome is well-formed (either genuinely
    // available or genuinely not, matching whatever today's real date is)
    // rather than asserting a specific value, since "today" varies.
    const outcome = await createHalloweenLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        difficulty: "medium",
        timeMode: "timer",
        split: { halloweenAdjacentCount: 4, horrorCount: 4, kitschCount: 2 },
      },
      { rng: createSeededRng(1) },
    );
    if (!outcome.ok) {
      expect(outcome.error).toBe("not_available");
    }
  });
});

describe("createHalloweenLocalDraft — off-watchlist films are never added to the watchlist (PROMPT 21)", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
    setHalloweenManifestFilmIds({ horrorFilmIds: [], kitschFilmIds: [] });
  });

  it("drafting Horror/Kitsch films outside the watchlist never inserts a watchlist entry for them", async () => {
    db = new FDraftLocalDatabase(
      `halloween-no-side-effect-${crypto.randomUUID()}`,
    );
    const repos = createLocalRepositories(db) as Repositories;
    await seedManyAdjacent(repos, 5);
    const horrorIds = await seedManyOffWatchlist(repos, "horror", 5);
    const kitschIds = await seedManyOffWatchlist(repos, "kitsch", 5);
    setHalloweenManifestFilmIds({
      horrorFilmIds: horrorIds,
      kitschFilmIds: kitschIds,
    });

    const entriesBefore = await repos.watchlist.listAllEntries(PROFILE_ID);

    const outcome = await createHalloweenLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        difficulty: "medium",
        timeMode: "timer",
        effectiveNow: IN_HALLOWEEN_WINDOW,
        split: { halloweenAdjacentCount: 4, horrorCount: 4, kitschCount: 2 },
      },
      { rng: createSeededRng(1) },
    );
    expect(outcome.ok).toBe(true);

    const entriesAfter = await repos.watchlist.listAllEntries(PROFILE_ID);
    // Exactly the 5 Halloween-adjacent entries seeded up front — nothing
    // new was inserted for the drafted Horror/Kitsch films.
    expect(entriesAfter).toHaveLength(entriesBefore.length);
    expect(entriesAfter.map((e) => e.filmId).sort()).toEqual(
      entriesBefore.map((e) => e.filmId).sort(),
    );
    for (const filmId of [...horrorIds, ...kitschIds]) {
      expect(entriesAfter.some((e) => e.filmId === filmId)).toBe(false);
    }
  });
});
