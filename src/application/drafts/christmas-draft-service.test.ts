import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createChristmasLocalDraft } from "@/application/drafts/christmas-draft-service";
import { computeChristmasPoolCapacity } from "@/application/drafts/christmas-fetch-context";
import {
  EVENT_DIFFICULTY_ORDER,
  EventDifficultyPicker,
} from "@/components/drafts/event-difficulty-picker";
import { getDraftDisplayName } from "@/domain/drafts/draft-name";
import {
  createDefaultChristmasSplit,
  type ChristmasSplit,
} from "@/domain/drafts/christmas-split";
import { DIFFICULTIES, getFilmCount } from "@/domain/drafts/difficulty";
import {
  resetEventCategoryFilmIdsForTests,
  setEventCategoryFilmIds,
} from "@/domain/events/event-category-manifest-overlay";
import { CHRISTMAS_EVENT_ID } from "@/domain/events/event-registry";
import { EVENT_ONE_AT_A_TIME_CATEGORIES } from "@/domain/events/one-at-a-time-categories";
import { FixedClock } from "@/domain/time/clock";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import type { DraftDifficulty } from "@/repositories/records";
import type { Repositories } from "@/repositories";

const PROFILE_ID = "alex";
/** Inside Christmas's window (all of December) in UTC. */
const IN_DECEMBER_2027 = new FixedClock(new Date("2027-12-10T12:00:00.000Z"));
const CHRISTMAS_2027_END = "2028-01-01T00:00:00.000Z";

type FixedDifficulty = Exclude<DraftDifficulty, "freeform" | "one-at-a-time">;

async function seedProfile(repos: Repositories) {
  await repos.profiles.create({
    id: PROFILE_ID,
    displayName: "Alex",
    createdAt: "2027-01-01T00:00:00.000Z",
    lastOpenedAt: "2027-01-01T00:00:00.000Z",
    timezone: "UTC",
    settings: {
      reducedMotion: false,
      defaultPage: "watchlist",
      franchiseChronologicalOrder: false,
      adminMode: false,
      halloweenPumpkinState: "uncarved",
    },
    dataVersion: 1,
  });
}

/**
 * `count` curated films in one Christmas category, resolved into the
 * generic Event category overlay exactly as `loadEventCategoryFilmContent`
 * does at app start. `onWatchlist` additionally puts them on the profile's
 * ACTIVE watchlist, which is what "Prefer Watchlist" reads.
 */
async function seedCategory(
  repos: Repositories,
  params: {
    categoryKey: "classic" | "adjacent";
    count: number;
    onWatchlist?: boolean;
    idPrefix?: string;
  },
) {
  const prefix = params.idPrefix ?? params.categoryKey;
  const filmIds: string[] = [];
  for (let index = 0; index < params.count; index++) {
    const filmId = `${prefix}-${index}`;
    filmIds.push(filmId);
    await repos.films.create({
      id: filmId,
      title: `${prefix} film ${index}`,
      releaseYear: 2000 + index,
      letterboxdSlug: null,
      letterboxdUri: null,
      createdAt: "2027-01-01T00:00:00.000Z",
      updatedAt: "2027-01-01T00:00:00.000Z",
    });
    if (params.onWatchlist) {
      await repos.watchlist.createEntry({
        id: `entry-${filmId}`,
        profileId: PROFILE_ID,
        filmId,
        dateAdded: "2027-01-01",
        position: index,
        isActive: true,
        selectionWeight: 1,
        importSource: null,
        importId: null,
        removedAt: null,
        removedReason: null,
        createdAt: "2027-01-01T00:00:00.000Z",
        updatedAt: "2027-01-01T00:00:00.000Z",
      });
    }
  }
  return { filmIds };
}

/** Sets both categories' resolved ids in one write (the overlay is per-event, not per-category). */
function setPools(pools: { classic: string[]; adjacent: string[] }) {
  setEventCategoryFilmIds(CHRISTMAS_EVENT_ID, pools);
}

/**
 * Covers docs/updates, "FDRAFT UPDATE 1 — CHRISTMAS DRAFT DIFFICULTIES +
 * VISUAL POLISH" §1-§8's test list: every supported difficulty, no
 * Freeform, no Challenge, slider totals honoured at generation time,
 * Prefer Watchlist both ways, both categories, and the canonical Draft
 * name.
 */
describe("createChristmasLocalDraft", () => {
  let db: FDraftLocalDatabase;
  let repos: Repositories;

  beforeEach(async () => {
    resetEventCategoryFilmIdsForTests();
    db = new FDraftLocalDatabase(`christmas-draft-${crypto.randomUUID()}`);
    repos = createLocalRepositories(db) as Repositories;
    await seedProfile(repos);
  });

  afterEach(async () => {
    resetEventCategoryFilmIdsForTests();
    await db?.delete();
  });

  it("offers exactly the same difficulty set as every other Event — Baby through Hardcore plus One At A Time, and never Freeform", () => {
    // §1/§2 — read from the shared `CREATABLE_DIFFICULTY_ORDER`, so this
    // is what keeps Christmas and Halloween identical and makes Christmas
    // inherit future safe adjustments with no Christmas-only edit.
    expect(EVENT_DIFFICULTY_ORDER).toEqual([
      "baby",
      "easy",
      "medium",
      "hard",
      "hardcore",
      "one-at-a-time",
    ]);
    expect(EVENT_DIFFICULTY_ORDER).not.toContain("freeform");
    // The very same component Halloween's creation view renders.
    expect(typeof EventDifficultyPicker).toBe("function");
  });

  it("supports Christmas One At A Time with Classic/Christmas Adjacent and no Challenge source", () => {
    // §7 — identical support to Halloween, via the same shared map and
    // the same generic builder (which never offers Challenge).
    const categories = EVENT_ONE_AT_A_TIME_CATEGORIES[CHRISTMAS_EVENT_ID];
    expect(categories?.map((category) => category.key)).toEqual([
      "classic",
      "adjacent",
    ]);
  });

  it.each(["baby", "easy", "medium", "hard", "hardcore"] as FixedDifficulty[])(
    "creates a %s Christmas Draft at exactly the shared difficulty's film count",
    async (difficulty) => {
      const total = getFilmCount(difficulty);
      const classic = await seedCategory(repos, {
        categoryKey: "classic",
        count: total,
      });
      const adjacent = await seedCategory(repos, {
        categoryKey: "adjacent",
        count: total,
      });
      setPools({ classic: classic.filmIds, adjacent: adjacent.filmIds });

      const outcome = await createChristmasLocalDraft(
        repos,
        {
          profileId: PROFILE_ID,
          timezone: "UTC",
          difficulty,
          split: createDefaultChristmasSplit(total),
          preferWatchlist: false,
          sourceEventManuallyEnabled: false,
          effectiveNow: IN_DECEMBER_2027.now(),
        },
        { clock: IN_DECEMBER_2027 },
      );

      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      const draft = (await repos.drafts.getById(PROFILE_ID, outcome.draftId))!;
      expect(draft.difficulty).toBe(difficulty);
      expect(draft.totalFilms).toBe(total);
      expect(DIFFICULTIES[difficulty].filmCount).toBe(total);

      const items = await repos.drafts.listItemsForDraft(outcome.draftId);
      expect(items).toHaveLength(total);
      // §1 — no Challenge-based Event source, anywhere.
      expect(draft.challengeFilmCount).toBe(0);
      expect(draft.challengeMode).toBeNull();
      expect(items.every((item) => item.source === "random")).toBe(true);
      expect(items.every((item) => item.challengeId === null)).toBe(true);
    },
  );

  it("honours the slider allocation exactly, tagging each film with the category it came from", async () => {
    const classic = await seedCategory(repos, {
      categoryKey: "classic",
      count: 20,
    });
    const adjacent = await seedCategory(repos, {
      categoryKey: "adjacent",
      count: 20,
    });
    setPools({ classic: classic.filmIds, adjacent: adjacent.filmIds });

    const split: ChristmasSplit = { classicCount: 7, adjacentCount: 3 };
    const outcome = await createChristmasLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        difficulty: "medium",
        split,
        preferWatchlist: false,
        sourceEventManuallyEnabled: false,
        effectiveNow: IN_DECEMBER_2027.now(),
      },
      { clock: IN_DECEMBER_2027 },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const items = await repos.drafts.listItemsForDraft(outcome.draftId);
    expect(items).toHaveLength(10);
    expect(
      items.filter((item) => item.eventCategoryKey === "classic"),
    ).toHaveLength(7);
    expect(
      items.filter((item) => item.eventCategoryKey === "adjacent"),
    ).toHaveLength(3);
    // Every drawn film really came from the category it claims.
    for (const item of items) {
      const pool =
        item.eventCategoryKey === "classic"
          ? classic.filmIds
          : adjacent.filmIds;
      expect(pool).toContain(item.filmId);
    }
  });

  it("rejects an allocation that doesn't add up to the difficulty's count", async () => {
    const classic = await seedCategory(repos, {
      categoryKey: "classic",
      count: 20,
    });
    setPools({ classic: classic.filmIds, adjacent: [] });

    const outcome = await createChristmasLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        difficulty: "medium",
        split: { classicCount: 4, adjacentCount: 4 },
        preferWatchlist: false,
        sourceEventManuallyEnabled: false,
        effectiveNow: IN_DECEMBER_2027.now(),
      },
      { clock: IN_DECEMBER_2027 },
    );
    expect(outcome).toMatchObject({ ok: false, error: "invalid_allocation" });
  });

  it("never draws the same film into both categories", async () => {
    // One shared pool of films curated into BOTH categories — the exact
    // case cross-pool exclusion exists for.
    const shared = await seedCategory(repos, {
      categoryKey: "classic",
      count: 12,
      idPrefix: "shared",
    });
    setPools({ classic: shared.filmIds, adjacent: shared.filmIds });

    const outcome = await createChristmasLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        difficulty: "medium",
        split: { classicCount: 5, adjacentCount: 5 },
        preferWatchlist: false,
        sourceEventManuallyEnabled: false,
        effectiveNow: IN_DECEMBER_2027.now(),
      },
      { clock: IN_DECEMBER_2027 },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const items = await repos.drafts.listItemsForDraft(outcome.draftId);
    expect(items).toHaveLength(10);
    expect(new Set(items.map((item) => item.filmId)).size).toBe(10);
  });

  it("Prefer Watchlist ON fills from the watchlist intersection first, then tops up from the full pool", async () => {
    // 3 Classic films on the watchlist, 20 more that aren't. Asking for 8
    // Classic must take all 3 watchlist films, then 5 others.
    const onList = await seedCategory(repos, {
      categoryKey: "classic",
      count: 3,
      onWatchlist: true,
      idPrefix: "classic-on-list",
    });
    const offList = await seedCategory(repos, {
      categoryKey: "classic",
      count: 20,
      idPrefix: "classic-off-list",
    });
    setPools({
      classic: [...onList.filmIds, ...offList.filmIds],
      adjacent: [],
    });

    const outcome = await createChristmasLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        difficulty: "easy",
        split: { classicCount: 8, adjacentCount: 0 },
        preferWatchlist: true,
        sourceEventManuallyEnabled: false,
        effectiveNow: IN_DECEMBER_2027.now(),
      },
      { clock: IN_DECEMBER_2027 },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const items = await repos.drafts.listItemsForDraft(outcome.draftId);
    expect(items).toHaveLength(8);
    const drawnFilmIds = items.map((item) => item.filmId);
    // All three watchlist films made it in — the preference is honoured...
    for (const filmId of onList.filmIds) {
      expect(drawnFilmIds).toContain(filmId);
    }
    // ...and the remaining five came from the rest of the curated pool,
    // so it stayed a preference and never a requirement (§5).
    expect(
      drawnFilmIds.filter((filmId) => offList.filmIds.includes(filmId)),
    ).toHaveLength(5);
    // A watchlist-backed item carries its entry id; a curated-only one
    // doesn't — so both watch paths work.
    const watchlistItems = items.filter(
      (item) => item.watchlistEntryId !== null,
    );
    expect(watchlistItems).toHaveLength(3);
  });

  it("Prefer Watchlist is never a requirement — an empty watchlist drafts exactly the same count", async () => {
    const classic = await seedCategory(repos, {
      categoryKey: "classic",
      count: 15,
    });
    setPools({ classic: classic.filmIds, adjacent: [] });

    const outcome = await createChristmasLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        difficulty: "easy",
        split: { classicCount: 8, adjacentCount: 0 },
        preferWatchlist: true,
        sourceEventManuallyEnabled: false,
        effectiveNow: IN_DECEMBER_2027.now(),
      },
      { clock: IN_DECEMBER_2027 },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(await repos.drafts.listItemsForDraft(outcome.draftId)).toHaveLength(
      8,
    );
  });

  it("names the Draft canonically for its occurrence year, and pins the deadline to the Event's end", async () => {
    const classic = await seedCategory(repos, {
      categoryKey: "classic",
      count: 10,
    });
    setPools({ classic: classic.filmIds, adjacent: [] });

    const outcome = await createChristmasLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        difficulty: "baby",
        split: { classicCount: 5, adjacentCount: 0 },
        preferWatchlist: false,
        sourceEventManuallyEnabled: false,
        effectiveNow: IN_DECEMBER_2027.now(),
      },
      { clock: IN_DECEMBER_2027 },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const draft = (await repos.drafts.getById(PROFILE_ID, outcome.draftId))!;
    // §8 — "Christmas <current Event occurrence year> Draft".
    expect(draft.eventOccurrenceYear).toBe(2027);
    expect(getDraftDisplayName(draft)).toBe("Christmas 2027 Draft");
    expect(draft.deadlineAt).toBe(CHRISTMAS_2027_END);
    expect(draft.timeMode).toBe("timer");
  });

  it("refuses to create a second Christmas Draft while one is active, without blocking any other scope", async () => {
    const classic = await seedCategory(repos, {
      categoryKey: "classic",
      count: 20,
    });
    setPools({ classic: classic.filmIds, adjacent: [] });
    const params = {
      profileId: PROFILE_ID,
      timezone: "UTC",
      difficulty: "baby" as FixedDifficulty,
      split: { classicCount: 5, adjacentCount: 0 },
      preferWatchlist: false,
      sourceEventManuallyEnabled: false,
      effectiveNow: IN_DECEMBER_2027.now(),
    };

    expect(
      (
        await createChristmasLocalDraft(repos, params, {
          clock: IN_DECEMBER_2027,
        })
      ).ok,
    ).toBe(true);
    expect(
      await createChristmasLocalDraft(repos, params, {
        clock: IN_DECEMBER_2027,
      }),
    ).toMatchObject({ ok: false, error: "already_active" });
    // A normal Draft's own slot is untouched by Christmas's.
    expect(await repos.drafts.hasActiveDraft(PROFILE_ID, null)).toBe(false);
  });

  it("refuses outside Christmas's own window", async () => {
    const classic = await seedCategory(repos, {
      categoryKey: "classic",
      count: 10,
    });
    setPools({ classic: classic.filmIds, adjacent: [] });

    const outcome = await createChristmasLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        difficulty: "baby",
        split: { classicCount: 5, adjacentCount: 0 },
        preferWatchlist: false,
        sourceEventManuallyEnabled: false,
        effectiveNow: new Date("2027-06-15T12:00:00.000Z"),
      },
      { clock: IN_DECEMBER_2027 },
    );
    expect(outcome).toMatchObject({ ok: false, error: "not_available" });
  });

  it("reports honestly when a category can't fill its requested slots", async () => {
    const classic = await seedCategory(repos, {
      categoryKey: "classic",
      count: 2,
    });
    setPools({ classic: classic.filmIds, adjacent: [] });

    const outcome = await createChristmasLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        difficulty: "baby",
        split: { classicCount: 5, adjacentCount: 0 },
        preferWatchlist: false,
        sourceEventManuallyEnabled: false,
        effectiveNow: IN_DECEMBER_2027.now(),
      },
      { clock: IN_DECEMBER_2027 },
    );
    expect(outcome).toMatchObject({ ok: false, error: "not_enough_films" });
    expect(outcome.ok === false && outcome.message).toContain("Classic");
    expect(
      await repos.drafts.hasActiveDraft(PROFILE_ID, CHRISTMAS_EVENT_ID),
    ).toBe(false);
  });

  it("reports each category's availability, and how much of it is on the watchlist", async () => {
    const onList = await seedCategory(repos, {
      categoryKey: "classic",
      count: 4,
      onWatchlist: true,
      idPrefix: "classic-on-list",
    });
    const offList = await seedCategory(repos, {
      categoryKey: "classic",
      count: 6,
      idPrefix: "classic-off-list",
    });
    const adjacent = await seedCategory(repos, {
      categoryKey: "adjacent",
      count: 3,
    });
    setPools({
      classic: [...onList.filmIds, ...offList.filmIds],
      adjacent: adjacent.filmIds,
    });

    expect(await computeChristmasPoolCapacity(repos, PROFILE_ID)).toEqual({
      classicAvailable: 10,
      classicOnWatchlist: 4,
      adjacentAvailable: 3,
      adjacentOnWatchlist: 0,
    });
  });
});
