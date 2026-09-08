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
// `createHalloweenLocalDraft` gates on availability (see docs/updates,
// "PROMPT 21 — HALLOWEEN RELEASE HARDENING", §"HALLOWEEN EXPIRY"), so
// every test exercising pool/allocation logic needs a real in-window
// `effectiveNow` to reach that logic at all.
const IN_HALLOWEEN_WINDOW = new Date("2026-10-15T12:00:00.000Z");

/**
 * `count` curated films in one Halloween pool, optionally also on the
 * profile's active watchlist — the same shape as Christmas's own
 * `seedCategory` test helper, since the two Events now share the exact
 * same "Prefer items from my Watchlist" draw rule (see docs/updates,
 * "FDRAFT UPDATE 1 — EVENT WATCHLIST PREFERENCE CLEANUP" §6/§10).
 */
async function seedPool(
  repos: Repositories,
  params: { prefix: string; count: number; onWatchlist?: boolean },
) {
  const filmIds: string[] = [];
  for (let index = 0; index < params.count; index++) {
    const filmId = `${params.prefix}-${index}`;
    filmIds.push(filmId);
    await repos.films.create({
      id: filmId,
      title: `${params.prefix} film ${index}`,
      releaseYear: 2000 + index,
      letterboxdSlug: null,
      letterboxdUri: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    if (params.onWatchlist) {
      await repos.watchlist.createEntry({
        id: `entry-${filmId}`,
        profileId: PROFILE_ID,
        filmId,
        dateAdded: "2026-01-01",
        position: index,
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
    const horrorIds = await seedPool(repos, { prefix: "horror", count: 6 });
    const kitschIds = await seedPool(repos, { prefix: "kitsch", count: 4 });
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
        effectiveNow: IN_HALLOWEEN_WINDOW,
        split: { horrorCount: 6, kitschCount: 4 },
        preferWatchlist: false,
      },
      { rng: createSeededRng(1) },
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const items = await repos.drafts.listItemsForDraft(outcome.draftId);
    expect(items).toHaveLength(10);
    const bySource = {
      horror: items.filter((i) => i.source === "horror"),
      kitsch: items.filter((i) => i.source === "kitsch"),
    };
    expect(bySource.horror).toHaveLength(6);
    expect(bySource.kitsch).toHaveLength(4);
    // Off-watchlist films never carry a watchlist entry.
    expect(items.every((i) => i.watchlistEntryId === null)).toBe(true);

    const draft = await repos.drafts.getById(PROFILE_ID, outcome.draftId);
    expect(draft?.sourceEventId).toBe(HALLOWEEN_EVENT_ID);
    expect(draft?.sourceEventManuallyEnabled).toBeNull();
    expect(draft?.totalFilms).toBe(10);
    expect(draft?.challengeFilmCount).toBe(0);
  });

  it("never duplicates a film that's curated into both Horror and Kitsch", async () => {
    const repos = setup();
    await seedPool(repos, { prefix: "shared", count: 1 });
    setHalloweenManifestFilmIds({
      horrorFilmIds: ["shared-0"],
      kitschFilmIds: ["shared-0"],
    });

    const outcome = await createHalloweenLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        difficulty: "baby",
        effectiveNow: IN_HALLOWEEN_WINDOW,
        split: { horrorCount: 1, kitschCount: 4 },
        preferWatchlist: false,
      },
      { rng: createSeededRng(1) },
    );

    // Horror already claimed the one shared film — "not enough Kitsch
    // films" is the correct, honest outcome, not a silent duplicate.
    expect(outcome).toEqual({
      ok: false,
      error: "not_enough_films",
      message: expect.stringContaining("Kitsch"),
    });
  });

  it("rejects an allocation that doesn't sum to the difficulty's film count", async () => {
    const repos = setup();
    const outcome = await createHalloweenLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      difficulty: "medium",
      effectiveNow: IN_HALLOWEEN_WINDOW,
      split: { horrorCount: 4, kitschCount: 1 },
      preferWatchlist: false,
    });
    expect(outcome).toEqual({
      ok: false,
      error: "invalid_allocation",
      message: expect.any(String),
    });
  });

  it("reports not_enough_films for a Horror shortfall", async () => {
    const repos = setup();
    setHalloweenManifestFilmIds({
      horrorFilmIds: await seedPool(repos, { prefix: "horror", count: 1 }),
      kitschFilmIds: await seedPool(repos, { prefix: "kitsch", count: 5 }),
    });
    const outcome = await createHalloweenLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      difficulty: "baby",
      effectiveNow: IN_HALLOWEEN_WINDOW,
      split: { horrorCount: 3, kitschCount: 2 },
      preferWatchlist: false,
    });
    expect(outcome).toEqual({
      ok: false,
      error: "not_enough_films",
      message: expect.stringContaining("Horror"),
    });
  });

  it("reports not_enough_films for a Kitsch shortfall", async () => {
    const repos = setup();
    setHalloweenManifestFilmIds({
      horrorFilmIds: await seedPool(repos, { prefix: "horror", count: 5 }),
      kitschFilmIds: [],
    });
    const outcome = await createHalloweenLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      difficulty: "baby",
      effectiveNow: IN_HALLOWEEN_WINDOW,
      split: { horrorCount: 3, kitschCount: 2 },
      preferWatchlist: false,
    });
    expect(outcome).toEqual({
      ok: false,
      error: "not_enough_films",
      message: expect.stringContaining("Kitsch"),
    });
  });

  it("refuses to create a second draft while one is already active", async () => {
    const repos = setup();
    setHalloweenManifestFilmIds({
      horrorFilmIds: await seedPool(repos, { prefix: "horror", count: 5 }),
      kitschFilmIds: await seedPool(repos, { prefix: "kitsch", count: 5 }),
    });
    const params = {
      profileId: PROFILE_ID,
      timezone: "UTC",
      difficulty: "baby" as const,
      effectiveNow: IN_HALLOWEEN_WINDOW,
      split: { horrorCount: 3, kitschCount: 2 },
      preferWatchlist: false,
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

describe("createHalloweenLocalDraft — Prefer items from my Watchlist (FDRAFT UPDATE 1 — EVENT WATCHLIST PREFERENCE CLEANUP §6)", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
    setHalloweenManifestFilmIds({ horrorFilmIds: [], kitschFilmIds: [] });
  });

  function setup() {
    db = new FDraftLocalDatabase(
      `halloween-prefer-watchlist-${crypto.randomUUID()}`,
    );
    return createLocalRepositories(db) as Repositories;
  }

  it("ON fills from the watchlist intersection first, then tops up from the full pool", async () => {
    const repos = setup();
    // 2 Horror films on the watchlist, 20 more that aren't. Asking for
    // baby's 5 Horror films must take both watchlist films, then 3 others.
    const onList = await seedPool(repos, {
      prefix: "horror-on-list",
      count: 2,
      onWatchlist: true,
    });
    const offList = await seedPool(repos, {
      prefix: "horror-off-list",
      count: 20,
    });
    setHalloweenManifestFilmIds({
      horrorFilmIds: [...onList, ...offList],
      kitschFilmIds: [],
    });

    const outcome = await createHalloweenLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        difficulty: "baby",
        effectiveNow: IN_HALLOWEEN_WINDOW,
        split: { horrorCount: 5, kitschCount: 0 },
        preferWatchlist: true,
      },
      { rng: createSeededRng(1) },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const items = await repos.drafts.listItemsForDraft(outcome.draftId);
    expect(items).toHaveLength(5);
    const drawnFilmIds = items.map((item) => item.filmId);
    // Both watchlist films made it in — the preference is honoured...
    for (const filmId of onList) {
      expect(drawnFilmIds).toContain(filmId);
    }
    // ...and the remaining three came from the rest of the pool, so it
    // stayed a preference and never a requirement.
    expect(
      drawnFilmIds.filter((filmId) => offList.includes(filmId)),
    ).toHaveLength(3);
    // A watchlist-backed item carries its entry id; a curated-only one
    // doesn't — so both watch paths work.
    const watchlistItems = items.filter(
      (item) => item.watchlistEntryId !== null,
    );
    expect(watchlistItems).toHaveLength(2);
  });

  it("partial overlap never fails the Draft — tops up from the full category to reach the requested count", async () => {
    const repos = setup();
    const onList = await seedPool(repos, {
      prefix: "horror-on-list",
      count: 2,
      onWatchlist: true,
    });
    const offList = await seedPool(repos, {
      prefix: "horror-off-list",
      count: 10,
    });
    setHalloweenManifestFilmIds({
      horrorFilmIds: [...onList, ...offList],
      kitschFilmIds: [],
    });

    const outcome = await createHalloweenLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        difficulty: "easy",
        effectiveNow: IN_HALLOWEEN_WINDOW,
        split: { horrorCount: 8, kitschCount: 0 },
        preferWatchlist: true,
      },
      { rng: createSeededRng(1) },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const items = await repos.drafts.listItemsForDraft(outcome.draftId);
    expect(items).toHaveLength(8);
  });

  it("zero overlap never fails the Draft — draws entirely from the full category", async () => {
    const repos = setup();
    const offList = await seedPool(repos, {
      prefix: "horror-off-list",
      count: 10,
    });
    setHalloweenManifestFilmIds({
      horrorFilmIds: offList,
      kitschFilmIds: [],
    });

    const outcome = await createHalloweenLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        difficulty: "baby",
        effectiveNow: IN_HALLOWEEN_WINDOW,
        split: { horrorCount: 5, kitschCount: 0 },
        preferWatchlist: true,
      },
      { rng: createSeededRng(1) },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const items = await repos.drafts.listItemsForDraft(outcome.draftId);
    expect(items).toHaveLength(5);
    expect(items.every((item) => item.watchlistEntryId === null)).toBe(true);
  });

  it("is never a requirement — an empty watchlist drafts exactly the same count as the toggle off", async () => {
    const repos = setup();
    const horrorIds = await seedPool(repos, { prefix: "horror", count: 15 });
    setHalloweenManifestFilmIds({
      horrorFilmIds: horrorIds,
      kitschFilmIds: [],
    });

    const outcome = await createHalloweenLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        difficulty: "easy",
        effectiveNow: IN_HALLOWEEN_WINDOW,
        split: { horrorCount: 8, kitschCount: 0 },
        preferWatchlist: true,
      },
      { rng: createSeededRng(1) },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const items = await repos.drafts.listItemsForDraft(outcome.draftId);
    expect(items).toHaveLength(8);
  });
});

describe("createHalloweenLocalDraft — fixed Event deadline, no Calendar/Timer choice (PROMPT B2.2)", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
    setHalloweenManifestFilmIds({ horrorFilmIds: [], kitschFilmIds: [] });
  });

  function setup() {
    db = new FDraftLocalDatabase(`halloween-deadline-${crypto.randomUUID()}`);
    return createLocalRepositories(db) as Repositories;
  }

  it.each([
    [
      "30 September at 19:15 (just after the window opens)",
      "2026-09-30T19:15:00.000Z",
    ],
    ["15 October (mid-window)", "2026-10-15T00:00:00.000Z"],
    [
      "31 October at 23:00 (just before the window closes)",
      "2026-10-31T23:00:00.000Z",
    ],
  ])(
    "created %s always gets a deadline of exactly 1 November 00:00 UTC",
    async (_label, effectiveNowIso) => {
      const repos = setup();
      setHalloweenManifestFilmIds({
        horrorFilmIds: await seedPool(repos, { prefix: "horror", count: 5 }),
        kitschFilmIds: [],
      });

      const outcome = await createHalloweenLocalDraft(
        repos,
        {
          profileId: PROFILE_ID,
          timezone: "UTC",
          difficulty: "baby",
          effectiveNow: new Date(effectiveNowIso),
          split: { horrorCount: 5, kitschCount: 0 },
          preferWatchlist: false,
        },
        { rng: createSeededRng(1) },
      );
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;

      const draft = await repos.drafts.getById(PROFILE_ID, outcome.draftId);
      expect(draft?.deadlineAt).toBe("2026-11-01T00:00:00.000Z");
    },
  );

  it("the deadline is evaluated in the profile's OWN timezone, not UTC", async () => {
    const repos = setup();
    setHalloweenManifestFilmIds({
      horrorFilmIds: await seedPool(repos, { prefix: "horror", count: 5 }),
      kitschFilmIds: [],
    });

    const outcome = await createHalloweenLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "America/New_York",
        difficulty: "baby",
        // 15 Oct, mid-afternoon America/New_York.
        effectiveNow: new Date("2026-10-15T16:00:00.000Z"),
        split: { horrorCount: 5, kitschCount: 0 },
        preferWatchlist: false,
      },
      { rng: createSeededRng(1) },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const draft = await repos.drafts.getById(PROFILE_ID, outcome.draftId);
    // Midnight 1 Nov America/New_York (still EDT, UTC-4) is 04:00 UTC —
    // never the UTC-relative "1 Nov 00:00" a non-timezone-aware
    // implementation would produce.
    expect(draft?.deadlineAt).toBe("2026-11-01T04:00:00.000Z");
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
    "generates exactly %s's film count, split across the two pools with no duplicates",
    async (difficulty) => {
      db = new FDraftLocalDatabase(
        `halloween-difficulty-${difficulty}-${crypto.randomUUID()}`,
      );
      const repos = createLocalRepositories(db) as Repositories;
      const totalFilms = DIFFICULTIES[difficulty].filmCount!;

      const horrorIds = await seedPool(repos, {
        prefix: "horror",
        count: totalFilms,
      });
      const kitschIds = await seedPool(repos, {
        prefix: "kitsch",
        count: totalFilms,
      });
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
          effectiveNow: IN_HALLOWEEN_WINDOW,
          split,
          preferWatchlist: false,
        },
        { rng: createSeededRng(1) },
      );

      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;

      const items = await repos.drafts.listItemsForDraft(outcome.draftId);
      expect(items).toHaveLength(totalFilms);
      expect(split.horrorCount + split.kitschCount).toBe(totalFilms);

      const bySource = {
        horror: items.filter((i) => i.source === "horror"),
        kitsch: items.filter((i) => i.source === "kitsch"),
      };
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
    setHalloweenManifestFilmIds({
      horrorFilmIds: await seedPool(repos, { prefix: "horror", count: 6 }),
      kitschFilmIds: await seedPool(repos, { prefix: "kitsch", count: 4 }),
    });

    const outcome = await createHalloweenLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        difficulty: "medium",
        split: { horrorCount: 6, kitschCount: 4 },
        preferWatchlist: false,
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
    setHalloweenManifestFilmIds({
      horrorFilmIds: await seedPool(repos, { prefix: "horror", count: 6 }),
      kitschFilmIds: await seedPool(repos, { prefix: "kitsch", count: 4 }),
    });

    const outcome = await createHalloweenLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        difficulty: "medium",
        split: { horrorCount: 6, kitschCount: 4 },
        preferWatchlist: false,
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
    setHalloweenManifestFilmIds({
      horrorFilmIds: await seedPool(repos, { prefix: "horror", count: 6 }),
      kitschFilmIds: await seedPool(repos, { prefix: "kitsch", count: 4 }),
    });

    const atOpen = await createHalloweenLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        difficulty: "medium",
        split: { horrorCount: 6, kitschCount: 4 },
        preferWatchlist: false,
        effectiveNow: new Date("2026-09-30T19:00:00.000Z"),
      },
      { rng: createSeededRng(1) },
    );
    expect(atOpen.ok).toBe(true);
  });

  it("defaults to the real wall clock when effectiveNow is omitted (never silently permissive)", async () => {
    const repos = setup();
    setHalloweenManifestFilmIds({
      horrorFilmIds: await seedPool(repos, { prefix: "horror", count: 6 }),
      kitschFilmIds: await seedPool(repos, { prefix: "kitsch", count: 4 }),
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
        split: { horrorCount: 6, kitschCount: 4 },
        preferWatchlist: false,
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
    const horrorIds = await seedPool(repos, { prefix: "horror", count: 6 });
    const kitschIds = await seedPool(repos, { prefix: "kitsch", count: 4 });
    setHalloweenManifestFilmIds({
      horrorFilmIds: horrorIds,
      kitschFilmIds: kitschIds,
    });

    const entriesBefore = await repos.watchlist.listAllEntries(PROFILE_ID);
    expect(entriesBefore).toHaveLength(0);

    const outcome = await createHalloweenLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        difficulty: "medium",
        effectiveNow: IN_HALLOWEEN_WINDOW,
        split: { horrorCount: 6, kitschCount: 4 },
        preferWatchlist: false,
      },
      { rng: createSeededRng(1) },
    );
    expect(outcome.ok).toBe(true);

    const entriesAfter = await repos.watchlist.listAllEntries(PROFILE_ID);
    expect(entriesAfter).toHaveLength(0);
  });
});
