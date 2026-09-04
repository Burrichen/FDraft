import { afterEach, describe, expect, it } from "vitest";
import { archiveLocalDraftIfResolved } from "@/application/drafts/local-draft-service";
import {
  markLocalFilmWatched,
  undoLocalFilmWatched,
} from "@/application/watchlist/local-watchlist-service";
import { createHalloweenLocalDraft } from "./halloween-draft-service";
import { HALLOWEEN_EVENT_ID } from "@/domain/events/event-registry";
import { setHalloweenManifestFilmIds } from "@/domain/events/halloween-manifest-overlay";
import { createSeededRng } from "@/domain/shared/rng";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import type { DraftRecord } from "@/repositories/records";
import type { Repositories } from "@/repositories";

/**
 * Covers docs/updates, "PROMPT B2.1 — DUAL DRAFT ARCHITECTURE + EVENT
 * ROUTING/SETTINGS FIXES" §1: a profile's normal Draft and its Halloween
 * Draft are fully independent — both can be active at once, creating one
 * never touches the other, and a film shared between them is handled
 * safely (both items complete, each draft's own reward grants exactly
 * once, never twice for the same draft).
 */
const PROFILE_ID = "alex";

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

function baseNormalDraft(overrides: Partial<DraftRecord> = {}): DraftRecord {
  return {
    id: "normal-draft-1",
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
    sourceEventId: null,
    sourceEventManuallyEnabled: null,
    rewardsGrantedAt: null,
    eventOccurrenceYear: null,
    customName: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("Dual Draft Architecture — a normal Draft and a Halloween Draft are fully independent", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
    setHalloweenManifestFilmIds({ horrorFilmIds: [], kitschFilmIds: [] });
  });

  it("both can be active for the same profile at once, and each scope's hasActiveDraft/getActiveOrExpiredDraft sees only its own", async () => {
    db = new FDraftLocalDatabase(`dual-draft-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;

    await seedAdjacentFilm(repos, { filmId: "film-a", entryId: "entry-a" });
    await repos.drafts.createDraft(baseNormalDraft());
    await repos.drafts.createItems([
      {
        id: "normal-item-1",
        draftId: "normal-draft-1",
        filmId: "film-a",
        watchlistEntryId: "entry-a",
        source: "random",
        challengeId: null,
        challengeAttemptId: null,
        challengeDisplayValue: null,
        orderIndex: 0,
        isCompleted: false,
        completedAt: null,
        watchedHistoryId: null,
        originFilmId: null,
        substitutionReason: null,
        createdAt: "2026-10-01T00:00:00.000Z",
      },
    ]);

    // Baby difficulty needs exactly 5 films total, so the pool needs 5
    // eligible Halloween-adjacent entries for an `halloweenAdjacentCount: 5`
    // split to succeed.
    for (let i = 0; i < 5; i++) {
      await seedAdjacentFilm(repos, {
        filmId: `film-b-${i}`,
        entryId: `entry-b-${i}`,
      });
    }
    const halloweenCreated = await createHalloweenLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        difficulty: "baby",
        split: { halloweenAdjacentCount: 5, horrorCount: 0, kitschCount: 0 },
        effectiveNow: new Date("2026-10-15T12:00:00.000Z"),
      },
      { rng: createSeededRng(1) },
    );
    expect(halloweenCreated.ok).toBe(true);
    if (!halloweenCreated.ok) return;

    // Both are simultaneously active.
    expect(
      (await repos.drafts.getById(PROFILE_ID, "normal-draft-1"))?.status,
    ).toBe("active");
    expect(
      (await repos.drafts.getById(PROFILE_ID, halloweenCreated.draftId))
        ?.status,
    ).toBe("active");

    // Each scope only ever sees its own draft.
    expect(
      (await repos.drafts.getActiveOrExpiredDraft(PROFILE_ID, null))?.id,
    ).toBe("normal-draft-1");
    expect(
      (
        await repos.drafts.getActiveOrExpiredDraft(
          PROFILE_ID,
          HALLOWEEN_EVENT_ID,
        )
      )?.id,
    ).toBe(halloweenCreated.draftId);
    expect(await repos.drafts.hasActiveDraft(PROFILE_ID, null)).toBe(true);
    expect(
      await repos.drafts.hasActiveDraft(PROFILE_ID, HALLOWEEN_EVENT_ID),
    ).toBe(true);
    expect(
      await repos.drafts.hasActiveDraft(PROFILE_ID, "some-other-event"),
    ).toBe(false);

    // listActiveDrafts sees both, regardless of scope.
    const active = await repos.drafts.listActiveDrafts(PROFILE_ID);
    expect(active.map((d) => d.id).sort()).toEqual(
      ["normal-draft-1", halloweenCreated.draftId].sort(),
    );
  });

  it("creating a Halloween Draft never deletes, archives, modifies, or completes the active normal Draft", async () => {
    db = new FDraftLocalDatabase(`dual-draft-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;

    await seedAdjacentFilm(repos, { filmId: "film-a", entryId: "entry-a" });
    await repos.drafts.createDraft(baseNormalDraft());
    await repos.drafts.createItems([
      {
        id: "normal-item-1",
        draftId: "normal-draft-1",
        filmId: "film-a",
        watchlistEntryId: "entry-a",
        source: "random",
        challengeId: null,
        challengeAttemptId: null,
        challengeDisplayValue: null,
        orderIndex: 0,
        isCompleted: false,
        completedAt: null,
        watchedHistoryId: null,
        originFilmId: null,
        substitutionReason: null,
        createdAt: "2026-10-01T00:00:00.000Z",
      },
    ]);
    const normalBefore = await repos.drafts.getById(
      PROFILE_ID,
      "normal-draft-1",
    );

    for (let i = 0; i < 5; i++) {
      await seedAdjacentFilm(repos, {
        filmId: `film-b-${i}`,
        entryId: `entry-b-${i}`,
      });
    }
    const halloweenCreated = await createHalloweenLocalDraft(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        difficulty: "baby",
        split: { halloweenAdjacentCount: 5, horrorCount: 0, kitschCount: 0 },
        effectiveNow: new Date("2026-10-15T12:00:00.000Z"),
      },
      { rng: createSeededRng(1) },
    );
    expect(halloweenCreated.ok).toBe(true);

    const normalAfter = await repos.drafts.getById(
      PROFILE_ID,
      "normal-draft-1",
    );
    expect(normalAfter).toEqual(normalBefore);
    const normalItems = await repos.drafts.listItemsForDraft("normal-draft-1");
    expect(normalItems.every((item) => !item.isCompleted)).toBe(true);
  });

  it("watching a film shared by BOTH active drafts completes both items, earns exactly ONE Lifetime Point (never one per draft) plus ONE Haunted Point for the Halloween item — no duplicate point farming", async () => {
    db = new FDraftLocalDatabase(`dual-draft-shared-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;

    // The SAME watchlist entry is drafted into both the normal Draft and
    // the Halloween Draft (a genuine, if rare, real scenario — see
    // docs/updates, "a film can theoretically appear in both active
    // Drafts").
    await seedAdjacentFilm(repos, {
      filmId: "shared-film",
      entryId: "shared-entry",
    });
    await repos.drafts.createDraft(baseNormalDraft());
    await repos.drafts.createItems([
      {
        id: "normal-item-1",
        draftId: "normal-draft-1",
        filmId: "shared-film",
        watchlistEntryId: "shared-entry",
        source: "random",
        challengeId: null,
        challengeAttemptId: null,
        challengeDisplayValue: null,
        orderIndex: 0,
        isCompleted: false,
        completedAt: null,
        watchedHistoryId: null,
        originFilmId: null,
        substitutionReason: null,
        createdAt: "2026-10-01T00:00:00.000Z",
      },
    ]);
    await repos.drafts.createDraft(
      baseNormalDraft({
        id: "halloween-draft-1",
        sourceEventId: HALLOWEEN_EVENT_ID,
        sourceEventManuallyEnabled: false,
      }),
    );
    await repos.drafts.createItems([
      {
        id: "halloween-item-1",
        draftId: "halloween-draft-1",
        filmId: "shared-film",
        watchlistEntryId: "shared-entry",
        source: "halloween-adjacent",
        challengeId: null,
        challengeAttemptId: null,
        challengeDisplayValue: null,
        orderIndex: 0,
        isCompleted: false,
        completedAt: null,
        watchedHistoryId: null,
        originFilmId: null,
        substitutionReason: null,
        createdAt: "2026-10-01T00:00:00.000Z",
      },
    ]);

    const outcome = await markLocalFilmWatched(
      repos,
      {
        profileId: PROFILE_ID,
        watchlistEntryId: "shared-entry",
        profileTimezone: "UTC",
      },
      { archiveIfResolved: archiveLocalDraftIfResolved },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    // Both drafts' single item completed by ONE watch action — which one
    // reports as "primary" vs "secondary" isn't a guaranteed order, only
    // that BOTH are reported.
    expect(outcome.secondaryDraftCompletion).not.toBeNull();
    const completedDraftIds = [
      outcome.draftId,
      outcome.secondaryDraftCompletion?.draftId ?? null,
    ].sort();
    expect(completedDraftIds).toEqual(
      ["halloween-draft-1", "normal-draft-1"].sort(),
    );
    expect(outcome.draftArchivedByThisAction).toBe(true);
    expect(outcome.secondaryDraftCompletion?.draftArchivedByThisAction).toBe(
      true,
    );

    const normalItem = await repos.drafts.getItemById("normal-item-1");
    const halloweenItem = await repos.drafts.getItemById("halloween-item-1");
    expect(normalItem?.isCompleted).toBe(true);
    expect(halloweenItem?.isCompleted).toBe(true);

    // Both drafts archived and rewarded — INDEPENDENTLY, exactly once each
    // (two DIFFERENT drafts' rewards, never the same draft's reward twice).
    const normalDraft = await repos.drafts.getById(
      PROFILE_ID,
      "normal-draft-1",
    );
    const halloweenDraft = await repos.drafts.getById(
      PROFILE_ID,
      "halloween-draft-1",
    );
    expect(normalDraft?.status).toBe("archived");
    expect(halloweenDraft?.status).toBe("archived");
    expect(normalDraft?.rewardsGrantedAt).not.toBeNull();
    expect(halloweenDraft?.rewardsGrantedAt).not.toBeNull();

    // Only ONE watched-history row exists for this one real watch action —
    // it isn't duplicated just because it completed two drafts.
    const history = await repos.history.listWatchedHistory(PROFILE_ID);
    expect(history).toHaveLength(1);

    // Exactly ONE Lifetime Point for this one watch action — even though
    // it archived TWO drafts, both drafts' own completion reward resolves
    // to the SAME "lifetime" currency (Halloween now has its own
    // `currency`, so its completion reward is plain Lifetime too — see
    // `resolveDraftCompletionReward`), and a single currency is only ever
    // credited once per action (see docs/updates, "EVENT SYSTEM —
    // UNIVERSAL EVENT CURRENCY EARNING" §5: "+1 Lifetime, NOT +2
    // Lifetime").
    const lifetimeBalance = await repos.points.getBalance(
      PROFILE_ID,
      "lifetime",
    );
    expect(lifetimeBalance).toBe(1);

    // The Halloween item ALSO earned its own Haunted Point — per film
    // watched, independent of the Lifetime dedup above (a different
    // currency entirely) and independent of which item happened to be
    // "primary" vs "secondary" in this action.
    const hauntedBalance = await repos.points.getBalance(PROFILE_ID, "haunted");
    expect(hauntedBalance).toBe(1);

    // UNDO reverses BOTH completions and both rewards from this one action.
    const undone = await undoLocalFilmWatched(repos, {
      profileId: PROFILE_ID,
      record: {
        watchlistEntryId: outcome.watchlistEntryId,
        filmId: outcome.filmId,
        watchedHistoryId: outcome.watchedHistoryId,
        draftItemId: outcome.draftItemId,
        draftId: outcome.draftId,
        draftArchivedByThisAction: outcome.draftArchivedByThisAction,
        secondaryDraftCompletion: outcome.secondaryDraftCompletion,
      },
    });
    expect(undone).toEqual({ ok: true });

    expect((await repos.drafts.getItemById("normal-item-1"))?.isCompleted).toBe(
      false,
    );
    expect(
      (await repos.drafts.getItemById("halloween-item-1"))?.isCompleted,
    ).toBe(false);
    expect(
      (await repos.drafts.getById(PROFILE_ID, "normal-draft-1"))?.status,
    ).toBe("active");
    expect(
      (await repos.drafts.getById(PROFILE_ID, "halloween-draft-1"))?.status,
    ).toBe("active");
    expect(await repos.points.getBalance(PROFILE_ID, "lifetime")).toBe(0);
    expect(await repos.points.getBalance(PROFILE_ID, "haunted")).toBe(0);
    expect(await repos.history.listWatchedHistory(PROFILE_ID)).toHaveLength(0);
  });

  it("History shows both an archived normal Draft and an archived Halloween Draft, the latter retaining its Event identity", async () => {
    db = new FDraftLocalDatabase(`dual-draft-history-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db) as Repositories;

    await repos.drafts.createDraft(
      baseNormalDraft({
        status: "archived",
        completedAt: "2026-10-20T00:00:00.000Z",
      }),
    );
    await repos.drafts.createDraft(
      baseNormalDraft({
        id: "halloween-draft-1",
        sourceEventId: HALLOWEEN_EVENT_ID,
        sourceEventManuallyEnabled: false,
        status: "archived",
        completedAt: "2026-10-25T00:00:00.000Z",
      }),
    );

    const archived = await repos.drafts.listArchived(PROFILE_ID);
    expect(archived.map((d) => d.id).sort()).toEqual(
      ["normal-draft-1", "halloween-draft-1"].sort(),
    );
    const halloweenEntry = archived.find((d) => d.id === "halloween-draft-1");
    expect(halloweenEntry?.sourceEventId).toBe(HALLOWEEN_EVENT_ID);
    const normalEntry = archived.find((d) => d.id === "normal-draft-1");
    expect(normalEntry?.sourceEventId).toBeNull();
  });
});
