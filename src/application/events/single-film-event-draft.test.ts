import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { archiveLocalDraftIfResolved } from "@/application/drafts/local-draft-service";
import { markLocalDraftItemWatchedWithoutEntry } from "@/application/watchlist/local-watchlist-service";
import { finalizeExpiredEventDraftIfNeeded } from "@/application/events/event-draft-finalization";
import { beginEventOptIn } from "@/application/events/event-opt-in";
import { rollSingleFilmEventDraft } from "@/application/events/single-film-event-draft";
import { getDraftDisplayName } from "@/domain/drafts/draft-name";
import {
  resetEventCategoryFilmIdsForTests,
  setEventCategoryFilmIds,
} from "@/domain/events/event-category-manifest-overlay";
import {
  F_YOU_ITS_JANUARY_EVENT_ID,
  HALLOWEEN_EVENT_ID,
} from "@/domain/events/event-registry";
import { FixedClock } from "@/domain/time/clock";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import type { Repositories } from "@/repositories";

const PROFILE_ID = "alex";
/** Inside January's window (25 Jan – 1 Feb) in UTC. */
const IN_JANUARY_2027 = new FixedClock(new Date("2027-01-28T12:00:00.000Z"));
const JANUARY_2027_END = "2027-02-01T00:00:00.000Z";

/**
 * Every film the fake curated pool holds — stands in for
 * `public/events/january/films.json`'s `curated` entries AFTER the generic
 * `loadEventCategoryFilmContent` pass has resolved them into real local
 * `FilmRecord`s (which is exactly the seam
 * `event-category-manifest-overlay.ts` exists to be). The real shipped
 * file's own schema/duplication validation lives in
 * `event-film-content.test.ts`, and the title+year → local film resolution
 * in `resolve-or-create-halloween-films.test.ts` — neither is re-tested
 * here.
 */
const CURATED = [
  { filmId: "january-film-1", title: "Movie 43", year: 2013 },
  { filmId: "january-film-2", title: "Norm of the North", year: 2016 },
  { filmId: "january-film-3", title: "Dirty Grandpa", year: 2016 },
];

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

/** The curated films as real local records, plus the resolved overlay the roll reads. */
async function seedCuratedPool(repos: Repositories) {
  for (const film of CURATED) {
    await repos.films.create({
      id: film.filmId,
      title: film.title,
      releaseYear: film.year,
      letterboxdSlug: null,
      letterboxdUri: null,
      createdAt: "2027-01-01T00:00:00.000Z",
      updatedAt: "2027-01-01T00:00:00.000Z",
    });
  }
  setEventCategoryFilmIds(F_YOU_ITS_JANUARY_EVENT_ID, {
    curated: CURATED.map((film) => film.filmId),
  });
}

/** A film on the profile's own active watchlist that is NOT in January's curated pool. */
async function seedOffPoolWatchlistFilm(
  repos: Repositories,
  params: { filmId: string; entryId: string },
) {
  await repos.films.create({
    id: params.filmId,
    title: `Watchlist ${params.filmId}`,
    releaseYear: 1999,
    letterboxdSlug: params.filmId,
    letterboxdUri: null,
    createdAt: "2027-01-01T00:00:00.000Z",
    updatedAt: "2027-01-01T00:00:00.000Z",
  });
  await repos.watchlist.createEntry({
    id: params.entryId,
    profileId: PROFILE_ID,
    filmId: params.filmId,
    dateAdded: "2027-01-01",
    position: 0,
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

/**
 * Covers docs/updates, "FDRAFT UPDATE 1 — F* YOU, IT'S JANUARY: SIMPLE
 * EVENT MECHANICS" §17's test list for the mechanic itself — JOIN → one
 * random curated film → that film IS the Draft. The UI half of that list
 * (no difficulty/slider/Challenge/One At A Time/Pick Your Own controls
 * anywhere on the page) lives in `january-page-client.test.tsx`.
 */
describe("rollSingleFilmEventDraft — F* You, It's January!", () => {
  let db: FDraftLocalDatabase;
  let repos: Repositories;

  beforeEach(async () => {
    resetEventCategoryFilmIdsForTests();
    db = new FDraftLocalDatabase(`single-film-${crypto.randomUUID()}`);
    repos = createLocalRepositories(db) as Repositories;
    await seedProfile(repos);
  });

  afterEach(async () => {
    resetEventCategoryFilmIdsForTests();
    await db?.delete();
  });

  it("joining January rolls exactly ONE film, from January's own curated list, with no second creation step", async () => {
    await seedCuratedPool(repos);

    const join = await beginEventOptIn(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock: IN_JANUARY_2027 },
    );

    expect(join.eventId).toBe(F_YOU_ITS_JANUARY_EVENT_ID);
    expect(join.rollError).toBeNull();
    expect(join.singleFilmDraftId).toBeTruthy();

    const draft = await repos.drafts.getActiveOrExpiredDraft(
      PROFILE_ID,
      F_YOU_ITS_JANUARY_EVENT_ID,
    );
    expect(draft?.id).toBe(join.singleFilmDraftId);
    expect(draft?.status).toBe("active");
    expect(draft?.totalFilms).toBe(1);
    expect(draft?.challengeFilmCount).toBe(0);
    expect(draft?.challengeMode).toBeNull();
    expect(draft?.sourceEventManuallyEnabled).toBe(false);

    const items = await repos.drafts.listItemsForDraft(draft!.id);
    expect(items).toHaveLength(1);
    expect(CURATED.map((film) => film.filmId)).toContain(items[0].filmId);
  });

  it("uses January's canonical occurrence Draft name, never a monthly one", async () => {
    await seedCuratedPool(repos);
    await beginEventOptIn(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock: IN_JANUARY_2027 },
    );

    const draft = (await repos.drafts.getActiveOrExpiredDraft(
      PROFILE_ID,
      F_YOU_ITS_JANUARY_EVENT_ID,
    ))!;
    expect(draft.eventOccurrenceYear).toBe(2027);
    expect(getDraftDisplayName(draft)).toBe("F* You, It's January! 2027 Draft");
    expect(getDraftDisplayName(draft)).not.toContain("January Baby");
  });

  it("pins the Draft's deadline to the Event occurrence end (1 February 00:00), not a profile-chosen mode", async () => {
    await seedCuratedPool(repos);
    await beginEventOptIn(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock: IN_JANUARY_2027 },
    );

    const draft = (await repos.drafts.getActiveOrExpiredDraft(
      PROFILE_ID,
      F_YOU_ITS_JANUARY_EVENT_ID,
    ))!;
    expect(draft.deadlineAt).toBe(JANUARY_2027_END);
  });

  it("is idempotent — re-rolling (a reload, a restart, leaving and returning) never picks a different film", async () => {
    await seedCuratedPool(repos);
    const first = await rollSingleFilmEventDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        eventId: F_YOU_ITS_JANUARY_EVENT_ID,
        sourceEventManuallyEnabled: false,
      },
      { clock: IN_JANUARY_2027 },
    );
    expect(first).toMatchObject({ ok: true, created: true });

    for (let attempt = 0; attempt < 4; attempt++) {
      const again = await rollSingleFilmEventDraft(
        repos,
        {
          profileId: PROFILE_ID,
          timezone: "UTC",
          eventId: F_YOU_ITS_JANUARY_EVENT_ID,
          sourceEventManuallyEnabled: false,
        },
        { clock: IN_JANUARY_2027 },
      );
      expect(again.ok).toBe(true);
      if (again.ok && first.ok) {
        expect(again.created).toBe(false);
        expect(again.draftId).toBe(first.draftId);
        expect(again.filmId).toBe(first.filmId);
      }
    }

    // Exactly one January Draft exists, holding exactly one item.
    const januaryDrafts = (
      await repos.drafts.listAllForProfile(PROFILE_ID)
    ).filter((draft) => draft.sourceEventId === F_YOU_ITS_JANUARY_EVENT_ID);
    expect(januaryDrafts).toHaveLength(1);
    expect(
      await repos.drafts.listItemsForDraft(januaryDrafts[0].id),
    ).toHaveLength(1);
  });

  it("re-JOINING after leaving never rolls a second film", async () => {
    await seedCuratedPool(repos);
    const first = await beginEventOptIn(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock: IN_JANUARY_2027 },
    );
    const second = await beginEventOptIn(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock: IN_JANUARY_2027 },
    );
    expect(second.singleFilmDraftId).toBe(first.singleFilmDraftId);
  });

  it("still returns the SAME film once it has been watched and the Draft archived — a completed occurrence never re-rolls", async () => {
    await seedCuratedPool(repos);
    const roll = await rollSingleFilmEventDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        eventId: F_YOU_ITS_JANUARY_EVENT_ID,
        sourceEventManuallyEnabled: false,
      },
      { clock: IN_JANUARY_2027 },
    );
    expect(roll.ok).toBe(true);
    if (!roll.ok) return;

    const items = await repos.drafts.listItemsForDraft(roll.draftId);
    await markLocalDraftItemWatchedWithoutEntry(
      repos,
      {
        profileId: PROFILE_ID,
        draftItemId: items[0].id,
        profileTimezone: "UTC",
      },
      {
        clock: IN_JANUARY_2027,
        // Opt-in dep, exactly as the real Draft UI passes it — completing
        // January's ONLY film resolves the whole Draft.
        archiveIfResolved: archiveLocalDraftIfResolved,
      },
    );
    expect((await repos.drafts.getById(PROFILE_ID, roll.draftId))?.status).toBe(
      "archived",
    );

    const again = await rollSingleFilmEventDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        eventId: F_YOU_ITS_JANUARY_EVENT_ID,
        sourceEventManuallyEnabled: false,
      },
      { clock: IN_JANUARY_2027 },
    );
    expect(again).toMatchObject({
      ok: true,
      created: false,
      draftId: roll.draftId,
    });
  });

  it("gives each occurrence its OWN one-film Draft — next year rolls again, and last year's is preserved", async () => {
    await seedCuratedPool(repos);
    const twentySeven = await rollSingleFilmEventDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        eventId: F_YOU_ITS_JANUARY_EVENT_ID,
        sourceEventManuallyEnabled: false,
      },
      { clock: IN_JANUARY_2027 },
    );
    expect(twentySeven.ok).toBe(true);
    if (!twentySeven.ok) return;

    // 2027's occurrence closes — the same generic finalisation the ending
    // flow runs. Only then can a new occurrence's Draft exist (one active
    // Draft per Event slot).
    await finalizeExpiredEventDraftIfNeeded(
      repos,
      { profileId: PROFILE_ID, eventId: F_YOU_ITS_JANUARY_EVENT_ID },
      { clock: new FixedClock(new Date("2027-02-02T00:00:00.000Z")) },
    );

    const twentyEight = await rollSingleFilmEventDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        eventId: F_YOU_ITS_JANUARY_EVENT_ID,
        sourceEventManuallyEnabled: false,
      },
      { clock: new FixedClock(new Date("2028-01-26T12:00:00.000Z")) },
    );
    expect(twentyEight).toMatchObject({ ok: true, created: true });
    if (!twentyEight.ok) return;
    expect(twentyEight.draftId).not.toBe(twentySeven.draftId);

    const januaryDrafts = (
      await repos.drafts.listAllForProfile(PROFILE_ID)
    ).filter((draft) => draft.sourceEventId === F_YOU_ITS_JANUARY_EVENT_ID);
    expect(januaryDrafts).toHaveLength(2);
    expect(
      januaryDrafts.map((draft) => draft.eventOccurrenceYear).sort(),
    ).toEqual([2027, 2028]);
    // Last year's Draft is untouched — never reused, never deleted.
    const preserved = januaryDrafts.find(
      (draft) => draft.id === twentySeven.draftId,
    )!;
    expect(preserved.status).toBe("expired");
    expect(await repos.drafts.listItemsForDraft(preserved.id)).toHaveLength(1);
  });

  it("ignores the Watchlist entirely — a watchlist film outside the curated list is never rolled, and an empty watchlist still rolls", async () => {
    await seedCuratedPool(repos);
    await seedOffPoolWatchlistFilm(repos, {
      filmId: "not-curated",
      entryId: "entry-not-curated",
    });

    for (let attempt = 0; attempt < 15; attempt++) {
      const localDb = new FDraftLocalDatabase(
        `single-film-wl-${crypto.randomUUID()}`,
      );
      const localRepos = createLocalRepositories(localDb) as Repositories;
      await seedProfile(localRepos);
      await seedCuratedPool(localRepos);
      await seedOffPoolWatchlistFilm(localRepos, {
        filmId: "not-curated",
        entryId: "entry-not-curated",
      });
      const roll = await rollSingleFilmEventDraft(
        localRepos,
        {
          profileId: PROFILE_ID,
          timezone: "UTC",
          eventId: F_YOU_ITS_JANUARY_EVENT_ID,
          sourceEventManuallyEnabled: false,
        },
        { clock: IN_JANUARY_2027 },
      );
      expect(roll.ok).toBe(true);
      if (roll.ok) {
        expect(roll.filmId).not.toBe("not-curated");
        expect(CURATED.map((film) => film.filmId)).toContain(roll.filmId);
      }
      await localDb.delete();
    }
  });

  it("ignores average score entirely — a curated film rated 4.9 is rolled just the same", async () => {
    // Only ONE curated film, deliberately rated far above the old 3.5
    // ceiling this event used to enforce. The old eligibility rule would
    // have excluded it and produced nothing; the static list is now
    // authoritative, so it rolls.
    await repos.films.create({
      id: "beloved-film",
      title: "Highly Rated But Curated",
      releaseYear: 2001,
      letterboxdSlug: null,
      letterboxdUri: null,
      createdAt: "2027-01-01T00:00:00.000Z",
      updatedAt: "2027-01-01T00:00:00.000Z",
    });
    await repos.films.upsertMetadata({
      id: "beloved-film-meta",
      filmId: "beloved-film",
      provider: "tmdb",
      posterUrl: null,
      runtimeMinutes: 100,
      genres: ["Drama"],
      directors: null,
      countries: null,
      languages: null,
      collectionId: null,
      collectionName: null,
      collectionOrder: null,
      averageRating: 4.9,
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
      lastEnrichedAt: "2027-01-01T00:00:00.000Z",
      createdAt: "2027-01-01T00:00:00.000Z",
      updatedAt: "2027-01-01T00:00:00.000Z",
    });
    setEventCategoryFilmIds(F_YOU_ITS_JANUARY_EVENT_ID, {
      curated: ["beloved-film"],
    });

    const roll = await rollSingleFilmEventDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        eventId: F_YOU_ITS_JANUARY_EVENT_ID,
        sourceEventManuallyEnabled: false,
      },
      { clock: IN_JANUARY_2027 },
    );
    expect(roll).toMatchObject({ ok: true, filmId: "beloved-film" });
  });

  it("never rolls an unresolved curated entry while a usable one exists", async () => {
    await seedCuratedPool(repos);
    // Two ids that resolve to nothing locally (a curated title nobody has
    // a film record for yet) alongside the real ones.
    setEventCategoryFilmIds(F_YOU_ITS_JANUARY_EVENT_ID, {
      curated: [
        "unresolved-a",
        CURATED[0].filmId,
        "unresolved-b",
        CURATED[1].filmId,
      ],
    });

    for (let attempt = 0; attempt < 20; attempt++) {
      const localDb = new FDraftLocalDatabase(
        `single-film-unres-${crypto.randomUUID()}`,
      );
      const localRepos = createLocalRepositories(localDb) as Repositories;
      await seedProfile(localRepos);
      await seedCuratedPool(localRepos);
      setEventCategoryFilmIds(F_YOU_ITS_JANUARY_EVENT_ID, {
        curated: [
          "unresolved-a",
          CURATED[0].filmId,
          "unresolved-b",
          CURATED[1].filmId,
        ],
      });
      const roll = await rollSingleFilmEventDraft(
        localRepos,
        {
          profileId: PROFILE_ID,
          timezone: "UTC",
          eventId: F_YOU_ITS_JANUARY_EVENT_ID,
          sourceEventManuallyEnabled: false,
        },
        { clock: IN_JANUARY_2027 },
      );
      expect(roll.ok).toBe(true);
      if (roll.ok) {
        expect([CURATED[0].filmId, CURATED[1].filmId]).toContain(roll.filmId);
      }
      await localDb.delete();
    }
  });

  it("reports honestly, and creates nothing, when the curated pool resolves to nothing at all", async () => {
    setEventCategoryFilmIds(F_YOU_ITS_JANUARY_EVENT_ID, { curated: [] });
    const roll = await rollSingleFilmEventDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        eventId: F_YOU_ITS_JANUARY_EVENT_ID,
        sourceEventManuallyEnabled: false,
      },
      { clock: IN_JANUARY_2027 },
    );
    expect(roll).toMatchObject({ ok: false, error: "no_candidates" });
    expect(
      await repos.drafts.hasActiveDraft(PROFILE_ID, F_YOU_ITS_JANUARY_EVENT_ID),
    ).toBe(false);
  });

  it("refuses to roll for an event that isn't a single-film event", async () => {
    await seedCuratedPool(repos);
    const roll = await rollSingleFilmEventDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        eventId: HALLOWEEN_EVENT_ID,
        sourceEventManuallyEnabled: false,
      },
      { clock: IN_JANUARY_2027 },
    );
    expect(roll).toMatchObject({ ok: false, error: "not_single_film_event" });
    expect(
      await repos.drafts.hasActiveDraft(PROFILE_ID, HALLOWEEN_EVENT_ID),
    ).toBe(false);
  });

  it("joining a non-single-film event still creates no Draft at all", async () => {
    await seedCuratedPool(repos);
    const join = await beginEventOptIn(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        eventId: HALLOWEEN_EVENT_ID,
      },
      { clock: new FixedClock(new Date("2027-10-15T12:00:00.000Z")) },
    );
    expect(join.eventId).toBe(HALLOWEEN_EVENT_ID);
    expect(join.singleFilmDraftId).toBeNull();
    expect(join.rollError).toBeNull();
    expect(
      await repos.drafts.hasActiveDraft(PROFILE_ID, HALLOWEEN_EVENT_ID),
    ).toBe(false);
  });

  it("a manual off-season join still gets a real, future deadline rather than an already-expired Draft", async () => {
    await seedCuratedPool(repos);
    const june = new FixedClock(new Date("2027-06-15T12:00:00.000Z"));
    const join = await beginEventOptIn(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        eventId: F_YOU_ITS_JANUARY_EVENT_ID,
      },
      { clock: june },
    );
    expect(join.singleFilmDraftId).toBeTruthy();

    const draft = (await repos.drafts.getById(
      PROFILE_ID,
      join.singleFilmDraftId!,
    ))!;
    // Next January's end, not this year's already-passed one.
    expect(draft.deadlineAt).toBe("2028-02-01T00:00:00.000Z");
    expect(new Date(draft.deadlineAt!).getTime()).toBeGreaterThan(
      june.now().getTime(),
    );
    // Manual activation is captured on the Draft, so its reward is
    // downgraded to Lifetime Points by the existing central rule.
    expect(draft.sourceEventManuallyEnabled).toBe(true);
  });
});
