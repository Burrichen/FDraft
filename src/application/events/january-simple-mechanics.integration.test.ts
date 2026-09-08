import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { archiveLocalDraftIfResolved } from "@/application/drafts/local-draft-service";
import { awardEventDraftItemReward } from "@/application/events/draft-completion-reward";
import { setEventDateOverride } from "@/application/events/event-date-override-store";
import {
  getEventDiscovery,
  isOccurrenceExpired,
  resolveEventEndingCandidate,
} from "@/application/events/event-discovery";
import { finalizeExpiredEventDraftIfNeeded } from "@/application/events/event-draft-finalization";
import { beginEventOptIn } from "@/application/events/event-opt-in";
import { markLocalDraftItemWatchedWithoutEntry } from "@/application/watchlist/local-watchlist-service";
import { getDraftDisplayName } from "@/domain/drafts/draft-name";
import {
  resetEventCategoryFilmIdsForTests,
  setEventCategoryFilmIds,
} from "@/domain/events/event-category-manifest-overlay";
import { F_YOU_ITS_JANUARY_EVENT_ID } from "@/domain/events/event-registry";
import { FixedClock } from "@/domain/time/clock";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import type { DraftItemRecord, DraftRecord } from "@/repositories/records";
import type { Repositories } from "@/repositories";

const PROFILE_ID = "alex";
const IN_JANUARY = new FixedClock(new Date("2027-01-28T12:00:00.000Z"));
const AFTER_JANUARY = new FixedClock(new Date("2027-02-01T00:00:00.000Z"));

async function seedProfile(repos: Repositories, adminMode = false) {
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
      adminMode,
      halloweenPumpkinState: "uncarved",
    },
    dataVersion: 1,
  });
}

async function seedCuratedPool(repos: Repositories) {
  await repos.films.create({
    id: "january-film-1",
    title: "Movie 43",
    releaseYear: 2013,
    letterboxdSlug: null,
    letterboxdUri: null,
    createdAt: "2027-01-01T00:00:00.000Z",
    updatedAt: "2027-01-01T00:00:00.000Z",
  });
  setEventCategoryFilmIds(F_YOU_ITS_JANUARY_EVENT_ID, {
    curated: ["january-film-1"],
  });
}

/**
 * The end-to-end January lifecycle through the NEW mechanic (see
 * docs/updates, "FDRAFT UPDATE 1 — F* YOU, IT'S JANUARY: SIMPLE EVENT
 * MECHANICS" §11/§12/§17): join → one rolled film → watch → +1 Misery →
 * occurrence expiry → ending → History. Every step deliberately goes
 * through the real generic engines (`beginEventOptIn`,
 * `awardEventDraftItemReward`, `finalizeExpiredEventDraftIfNeeded`,
 * `resolveEventEndingCandidate`) rather than hand-built records, so this
 * proves the simplified January genuinely rides the same rails every
 * other event does — no January-specific reward, expiry or ending code.
 */
describe("F* You, It's January! — full simple lifecycle", () => {
  let db: FDraftLocalDatabase;
  let repos: Repositories;

  beforeEach(async () => {
    resetEventCategoryFilmIdsForTests();
    db = new FDraftLocalDatabase(`january-lifecycle-${crypto.randomUUID()}`);
    repos = createLocalRepositories(db) as Repositories;
  });

  afterEach(async () => {
    resetEventCategoryFilmIdsForTests();
    await db?.delete();
  });

  it("join → 0 Misery; watch the one film → +1 Misery; expiry preserves it and blocks any further earning; the ending becomes eligible; History keeps the Draft", async () => {
    await seedProfile(repos);
    await seedCuratedPool(repos);

    // JOIN — rolls the film, and must award nothing at all.
    const join = await beginEventOptIn(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock: IN_JANUARY },
    );
    expect(join.singleFilmDraftId).toBeTruthy();
    expect(await repos.points.getBalance(PROFILE_ID, "misery")).toBe(0);
    expect(await repos.points.getBalance(PROFILE_ID, "lifetime")).toBe(0);

    const draftId = join.singleFilmDraftId!;
    const items = await repos.drafts.listItemsForDraft(draftId);
    expect(items).toHaveLength(1);

    // WATCH the one film — +1 Misery (per film watched, the generic
    // currency rule), plus the Lifetime Point every completed Draft earns.
    const watched = await markLocalDraftItemWatchedWithoutEntry(
      repos,
      {
        profileId: PROFILE_ID,
        draftItemId: items[0].id,
        profileTimezone: "UTC",
      },
      { clock: IN_JANUARY, archiveIfResolved: archiveLocalDraftIfResolved },
    );
    expect(watched.ok).toBe(true);
    expect(await repos.points.getBalance(PROFILE_ID, "misery")).toBe(1);

    // Idempotent: re-awarding the same item never double-counts.
    const reAwarded = await awardEventDraftItemReward(repos, {
      profileId: PROFILE_ID,
      draft: (await repos.drafts.getById(PROFILE_ID, draftId))!,
      item: (await repos.drafts.listItemsForDraft(draftId))[0],
    });
    expect(reAwarded).toBe(false);
    expect(await repos.points.getBalance(PROFILE_ID, "misery")).toBe(1);

    // The one-film Draft is fully resolved, so it archived as Completed.
    const archived = (await repos.drafts.getById(PROFILE_ID, draftId))!;
    expect(archived.status).toBe("archived");
    expect(archived.completedAt).not.toBeNull();

    // HISTORY — the Draft is listed, under January's canonical name,
    // keyed by its own persisted event/occurrence, with its film intact.
    const history = await repos.drafts.listHistorical(PROFILE_ID);
    expect(history.map((draft) => draft.id)).toContain(draftId);
    const historical = history.find((draft) => draft.id === draftId)!;
    expect(historical.sourceEventId).toBe(F_YOU_ITS_JANUARY_EVENT_ID);
    expect(historical.eventOccurrenceYear).toBe(2027);
    expect(getDraftDisplayName(historical)).toBe(
      "F* You, It's January! 2027 Draft",
    );
    expect(await repos.drafts.listItemsForDraft(draftId)).toHaveLength(1);

    // EXPIRY — the occurrence closes. Watched state and the earned Misery
    // Point survive untouched.
    await finalizeExpiredEventDraftIfNeeded(
      repos,
      { profileId: PROFILE_ID, eventId: F_YOU_ITS_JANUARY_EVENT_ID },
      { clock: AFTER_JANUARY },
    );
    expect((await repos.drafts.getById(PROFILE_ID, draftId))?.status).toBe(
      "archived",
    );
    expect(await repos.points.getBalance(PROFILE_ID, "misery")).toBe(1);
    expect((await repos.drafts.listItemsForDraft(draftId))[0].isCompleted).toBe(
      true,
    );

    // ENDING — with the occurrence closed and the profile joined, the
    // generic ending candidate resolves to January.
    const discovery = await getEventDiscovery(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock: AFTER_JANUARY },
    );
    const januaryStatus = discovery.statuses.find(
      (status) => status.event.id === F_YOU_ITS_JANUARY_EVENT_ID,
    )!;
    expect(januaryStatus.participation).toBe("joined");
    expect(isOccurrenceExpired(januaryStatus)).toBe(true);
    const ending = resolveEventEndingCandidate(discovery.statuses);
    expect(ending?.event.id).toBe(F_YOU_ITS_JANUARY_EVENT_ID);
    expect(ending?.occurrenceKey).toBe(`${F_YOU_ITS_JANUARY_EVENT_ID}:2027`);
  });

  it("an UNWATCHED January film expires rather than completing — and can earn no Misery afterwards", async () => {
    await seedProfile(repos);
    await seedCuratedPool(repos);
    const join = await beginEventOptIn(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock: IN_JANUARY },
    );
    const draftId = join.singleFilmDraftId!;

    const finalized = await finalizeExpiredEventDraftIfNeeded(
      repos,
      { profileId: PROFILE_ID, eventId: F_YOU_ITS_JANUARY_EVENT_ID },
      { clock: AFTER_JANUARY },
    );
    expect(finalized).toBe(true);

    const expired = (await repos.drafts.getById(PROFILE_ID, draftId))!;
    // "Expired" — never conflated with "Completed".
    expect(expired.status).toBe("expired");
    expect(expired.completedAt).toBeNull();
    // The unwatched film is preserved, not deleted.
    const items = await repos.drafts.listItemsForDraft(draftId);
    expect(items).toHaveLength(1);
    expect(items[0].isCompleted).toBe(false);

    // No post-expiry Misery farming: the item can no longer be watched
    // through the normal path at all (its Draft is not active).
    const attempt = await markLocalDraftItemWatchedWithoutEntry(
      repos,
      {
        profileId: PROFILE_ID,
        draftItemId: items[0].id,
        profileTimezone: "UTC",
      },
      { clock: AFTER_JANUARY },
    );
    expect(attempt).toMatchObject({ ok: false, error: "not_active" });
    expect(await repos.points.getBalance(PROFILE_ID, "misery")).toBe(0);

    // It still shows in History, as an expired occurrence.
    expect(
      (await repos.drafts.listHistorical(PROFILE_ID)).map((draft) => draft.id),
    ).toContain(draftId);
  });

  it("respects Admin Event Testing's simulated date for the rolled Draft's occurrence year and deadline", async () => {
    await seedProfile(repos, true);
    await seedCuratedPool(repos);
    await setEventDateOverride(repos, PROFILE_ID, {
      enabled: true,
      eventId: F_YOU_ITS_JANUARY_EVENT_ID,
      simulatedDate: "2031-01-27T12:00:00.000Z",
    });

    // The REAL clock is nowhere near January — only the override is.
    const join = await beginEventOptIn(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock: new FixedClock(new Date("2027-08-09T00:00:00.000Z")) },
    );
    expect(join.singleFilmDraftId).toBeTruthy();

    const draft = (await repos.drafts.getById(
      PROFILE_ID,
      join.singleFilmDraftId!,
    ))!;
    expect(draft.eventOccurrenceYear).toBe(2031);
    expect(draft.deadlineAt).toBe("2031-02-01T00:00:00.000Z");
    expect(getDraftDisplayName(draft)).toBe("F* You, It's January! 2031 Draft");
    // Real persisted timestamps still come from the REAL clock — the
    // override never corrupts them (see `getEffectiveEventDate`).
    expect(draft.startedAt).toBe("2027-08-09T00:00:00.000Z");
  });

  it("a HISTORICAL pre-simplification January Draft still loads and displays correctly", async () => {
    // Exactly the shape the OLD January produced: a numeric difficulty
    // with a random/challenge split, a profile-chosen Calendar deadline,
    // watchlist-entry-backed items (one of them a Challenge), a
    // `customName` from the pre-canonical-name era, and no
    // `eventOccurrenceYear` at all. None of this is creatable any more;
    // all of it must still read back intact (see docs/product-spec.md,
    // "EVENT HISTORY RETENTION" — History is never re-derived from
    // current rules or content files).
    await seedProfile(repos);
    for (const filmId of ["legacy-film-1", "legacy-film-2"]) {
      await repos.films.create({
        id: filmId,
        title: `Legacy ${filmId}`,
        releaseYear: 2011,
        letterboxdSlug: filmId,
        letterboxdUri: null,
        createdAt: "2026-01-20T00:00:00.000Z",
        updatedAt: "2026-01-20T00:00:00.000Z",
      });
    }
    const legacy: DraftRecord = {
      id: "legacy-january-draft",
      profileId: PROFILE_ID,
      difficulty: "baby",
      timeMode: "calendar",
      status: "archived",
      totalFilms: 2,
      randomFilmCount: 1,
      challengeFilmCount: 1,
      challengeMode: "decide",
      startedAt: "2026-01-26T12:00:00.000Z",
      deadlineAt: "2026-01-31T23:59:59.000Z",
      timezone: "UTC",
      completedAt: "2026-01-30T12:00:00.000Z",
      freeformAchievedRank: null,
      sourceEventId: F_YOU_ITS_JANUARY_EVENT_ID,
      sourceEventManuallyEnabled: false,
      rewardsGrantedAt: "2026-01-30T12:00:00.000Z",
      customName: "My Old January Draft",
      eventOccurrenceYear: null,
      createdAt: "2026-01-26T12:00:00.000Z",
      updatedAt: "2026-01-30T12:00:00.000Z",
    };
    await repos.drafts.createDraft(legacy);
    const legacyItems: DraftItemRecord[] = [
      {
        id: "legacy-item-1",
        draftId: legacy.id,
        filmId: "legacy-film-1",
        watchlistEntryId: "legacy-entry-1",
        source: "random",
        challengeId: null,
        challengeAttemptId: null,
        challengeDisplayValue: null,
        orderIndex: 0,
        isCompleted: true,
        completedAt: "2026-01-28T12:00:00.000Z",
        watchedHistoryId: "legacy-history-1",
        originFilmId: null,
        substitutionReason: null,
        createdAt: "2026-01-26T12:00:00.000Z",
      },
      {
        id: "legacy-item-2",
        draftId: legacy.id,
        filmId: "legacy-film-2",
        watchlistEntryId: "legacy-entry-2",
        source: "challenge",
        challengeId: "runtime-under-90",
        challengeAttemptId: null,
        challengeDisplayValue: { label: "Under 90 minutes" },
        orderIndex: 1,
        isCompleted: true,
        completedAt: "2026-01-30T12:00:00.000Z",
        watchedHistoryId: "legacy-history-2",
        originFilmId: null,
        substitutionReason: null,
        createdAt: "2026-01-26T12:00:00.000Z",
      },
    ];
    await repos.drafts.createItems(legacyItems);

    const history = await repos.drafts.listHistorical(PROFILE_ID);
    const loaded = history.find((draft) => draft.id === legacy.id)!;
    expect(loaded).toBeDefined();
    expect(loaded.difficulty).toBe("baby");
    expect(loaded.timeMode).toBe("calendar");
    expect(loaded.totalFilms).toBe(2);
    expect(loaded.challengeFilmCount).toBe(1);
    expect(loaded.sourceEventId).toBe(F_YOU_ITS_JANUARY_EVENT_ID);

    // Its display name falls back to `startedAt`'s own year, since this
    // record predates `eventOccurrenceYear` — and the canonical Event name
    // still wins over the leftover `customName`.
    expect(getDraftDisplayName(loaded)).toBe(
      "F* You, It's January! 2026 Draft",
    );

    const loadedItems = await repos.drafts.listItemsForDraft(legacy.id);
    expect(loadedItems).toHaveLength(2);
    // The historical Challenge item stays valid and readable — only
    // CREATING a new Event Challenge item was removed.
    const challengeItem = loadedItems.find(
      (item) => item.source === "challenge",
    )!;
    expect(challengeItem.challengeId).toBe("runtime-under-90");
    expect(challengeItem.challengeDisplayValue).toEqual({
      label: "Under 90 minutes",
    });
    expect(loadedItems.every((item) => item.isCompleted)).toBe(true);
  });
});
