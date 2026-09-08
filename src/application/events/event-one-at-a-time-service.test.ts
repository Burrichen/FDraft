import { afterEach, describe, expect, it } from "vitest";
import {
  finalizeEventOneAtATimeDraft,
  pickEventOneAtATimeRandomFilm,
  resolveEventOneAtATimePickerCandidates,
} from "./event-one-at-a-time-service";
import { setEventCategoryFilmIds } from "@/domain/events/event-category-manifest-overlay";
import {
  CHRISTMAS_EVENT_ID,
  HALLOWEEN_EVENT_ID,
} from "@/domain/events/event-registry";
import type { OneAtATimeStagedItem } from "@/domain/drafts/one-at-a-time";
import { FixedClock } from "@/domain/time/clock";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import type { Repositories } from "@/repositories";

const PROFILE_ID = "alex";

async function seedProfile(repos: Repositories) {
  await repos.profiles.create({
    id: PROFILE_ID,
    displayName: "Alex",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastOpenedAt: "2026-01-01T00:00:00.000Z",
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

async function seedOffWatchlistFilm(
  repos: Repositories,
  filmId: string,
  title = filmId,
) {
  await repos.films.create({
    id: filmId,
    title,
    releaseYear: 2000,
    letterboxdSlug: null,
    letterboxdUri: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
}

function stagedItem(
  overrides: Partial<OneAtATimeStagedItem> & { filmId: string },
): OneAtATimeStagedItem {
  return {
    localId: `local-${overrides.filmId}`,
    watchlistEntryId: null,
    source: "random",
    challengeId: null,
    challengeDisplayValue: null,
    title: overrides.filmId,
    releaseYear: 2000,
    posterUrl: null,
    eventCategoryKey: null,
    ...overrides,
  };
}

describe("event-one-at-a-time-service (FDRAFT UPDATE 1 — EVENT ONE AT A TIME DRAFTING)", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
    setEventCategoryFilmIds(HALLOWEEN_EVENT_ID, {});
    setEventCategoryFilmIds(CHRISTMAS_EVENT_ID, {});
  });

  describe("Halloween", () => {
    it("Random Horror picks only from Horror, never Kitsch", async () => {
      db = new FDraftLocalDatabase(`event-oaat-${crypto.randomUUID()}`);
      const repos = createLocalRepositories(db) as Repositories;
      await seedProfile(repos);
      await seedOffWatchlistFilm(repos, "horror-1");
      await seedOffWatchlistFilm(repos, "kitsch-1");
      setEventCategoryFilmIds(HALLOWEEN_EVENT_ID, {
        horror: ["horror-1"],
        kitsch: ["kitsch-1"],
      });

      const outcome = await pickEventOneAtATimeRandomFilm(repos, {
        profileId: PROFILE_ID,
        eventId: HALLOWEEN_EVENT_ID,
        categoryKey: "horror",
        excludeFilmIds: [],
      });
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.film.filmId).toBe("horror-1");
        expect(outcome.film.eventCategoryKey).toBe("horror");
      }
    });

    it("Random Kitsch, and a reroll excludes the current candidate", async () => {
      db = new FDraftLocalDatabase(`event-oaat-${crypto.randomUUID()}`);
      const repos = createLocalRepositories(db) as Repositories;
      await seedProfile(repos);
      await seedOffWatchlistFilm(repos, "kitsch-1");
      await seedOffWatchlistFilm(repos, "kitsch-2");
      setEventCategoryFilmIds(HALLOWEEN_EVENT_ID, {
        kitsch: ["kitsch-1", "kitsch-2"],
      });

      const first = await pickEventOneAtATimeRandomFilm(repos, {
        profileId: PROFILE_ID,
        eventId: HALLOWEEN_EVENT_ID,
        categoryKey: "kitsch",
        excludeFilmIds: [],
      });
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      expect(first.film.eventCategoryKey).toBe("kitsch");

      const reroll = await pickEventOneAtATimeRandomFilm(repos, {
        profileId: PROFILE_ID,
        eventId: HALLOWEEN_EVENT_ID,
        categoryKey: "kitsch",
        excludeFilmIds: [first.film.filmId],
      });
      expect(reroll.ok).toBe(true);
      if (reroll.ok) {
        expect(reroll.film.filmId).not.toBe(first.film.filmId);
      }
    });

    it("Choose Horror / Choose Kitsch pickers only ever list their own category", async () => {
      db = new FDraftLocalDatabase(`event-oaat-${crypto.randomUUID()}`);
      const repos = createLocalRepositories(db) as Repositories;
      await seedProfile(repos);
      await seedOffWatchlistFilm(repos, "horror-1");
      await seedOffWatchlistFilm(repos, "kitsch-1");
      setEventCategoryFilmIds(HALLOWEEN_EVENT_ID, {
        horror: ["horror-1"],
        kitsch: ["kitsch-1"],
      });

      const horrorPicker = await resolveEventOneAtATimePickerCandidates(repos, {
        profileId: PROFILE_ID,
        eventId: HALLOWEEN_EVENT_ID,
        categoryKey: "horror",
        excludeFilmIds: [],
      });
      expect(horrorPicker.map((c) => c.filmId)).toEqual(["horror-1"]);

      const kitschPicker = await resolveEventOneAtATimePickerCandidates(repos, {
        profileId: PROFILE_ID,
        eventId: HALLOWEEN_EVENT_ID,
        categoryKey: "kitsch",
        excludeFilmIds: [],
      });
      expect(kitschPicker.map((c) => c.filmId)).toEqual(["kitsch-1"]);
    });

    it("a mixed-source Draft (Random Horror + Chosen Kitsch) finalizes with correct category/source and fixed deadline", async () => {
      db = new FDraftLocalDatabase(`event-oaat-${crypto.randomUUID()}`);
      const repos = createLocalRepositories(db) as Repositories;
      await seedProfile(repos);
      await seedOffWatchlistFilm(repos, "horror-random");
      await seedOffWatchlistFilm(repos, "kitsch-chosen");
      setEventCategoryFilmIds(HALLOWEEN_EVENT_ID, {
        horror: ["horror-random"],
        kitsch: ["kitsch-chosen"],
      });

      const items: OneAtATimeStagedItem[] = [
        stagedItem({
          filmId: "horror-random",
          source: "random",
          eventCategoryKey: "horror",
        }),
        stagedItem({
          filmId: "kitsch-chosen",
          source: "manual",
          eventCategoryKey: "kitsch",
        }),
      ];

      const outcome = await finalizeEventOneAtATimeDraft(repos, {
        profileId: PROFILE_ID,
        timezone: "UTC",
        eventId: HALLOWEEN_EVENT_ID,
        items,
        sourceEventManuallyEnabled: false,
      });
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;

      const draft = await repos.drafts.getById(PROFILE_ID, outcome.draftId);
      expect(draft?.sourceEventId).toBe(HALLOWEEN_EVENT_ID);
      expect(draft?.totalFilms).toBe(2);
      expect(draft?.difficulty).toBe("one-at-a-time");
      // Halloween's fixed deadline — 1 November 00:00, independent of
      // whatever the real clock happened to be at creation.
      expect(draft?.deadlineAt).toBe("2026-11-01T00:00:00.000Z");

      const draftItems = await repos.drafts.listItemsForDraft(outcome.draftId);
      const byFilmId = new Map(draftItems.map((item) => [item.filmId, item]));
      expect(byFilmId.get("horror-random")?.source).toBe("random");
      expect(byFilmId.get("horror-random")?.eventCategoryKey).toBe("horror");
      expect(byFilmId.get("kitsch-chosen")?.source).toBe("manual");
      expect(byFilmId.get("kitsch-chosen")?.eventCategoryKey).toBe("kitsch");
      // Every category item's watchlistEntryId is null — never a real
      // watchlist row, matching the existing Halloween convention.
      expect(byFilmId.get("horror-random")?.watchlistEntryId).toBeNull();
    });

    // Event One At A Time no longer offers Challenge as a creation source,
    // but a historical Draft item persisted with `source: "challenge"`
    // (created before this change, or restored from a backup) must still
    // finalize/read back correctly — this only exercises the persistence
    // shape, not the (removed) Challenge attempt step.
    it("still persists/reads back a historical source: 'challenge' item correctly (legacy shape compatibility)", async () => {
      db = new FDraftLocalDatabase(`event-oaat-${crypto.randomUUID()}`);
      const repos = createLocalRepositories(db) as Repositories;
      await seedProfile(repos);
      await seedOffWatchlistFilm(repos, "horror-challenge");
      setEventCategoryFilmIds(HALLOWEEN_EVENT_ID, {
        horror: ["horror-challenge"],
      });

      const items: OneAtATimeStagedItem[] = [
        stagedItem({
          filmId: "horror-challenge",
          source: "challenge",
          challengeId: "the-eldest",
          eventCategoryKey: "horror",
        }),
      ];

      const outcome = await finalizeEventOneAtATimeDraft(repos, {
        profileId: PROFILE_ID,
        timezone: "UTC",
        eventId: HALLOWEEN_EVENT_ID,
        items,
        sourceEventManuallyEnabled: false,
      });
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;

      const draftItems = await repos.drafts.listItemsForDraft(outcome.draftId);
      const item = draftItems.find((i) => i.filmId === "horror-challenge");
      expect(item?.source).toBe("challenge");
      expect(item?.challengeId).toBe("the-eldest");
      expect(item?.eventCategoryKey).toBe("horror");
    });

    it("arbitrary Done count — 1 film is a valid finalized Draft, no fixed size", async () => {
      db = new FDraftLocalDatabase(`event-oaat-${crypto.randomUUID()}`);
      const repos = createLocalRepositories(db) as Repositories;
      await seedProfile(repos);
      await seedOffWatchlistFilm(repos, "only-film");
      setEventCategoryFilmIds(HALLOWEEN_EVENT_ID, { horror: ["only-film"] });

      const outcome = await finalizeEventOneAtATimeDraft(repos, {
        profileId: PROFILE_ID,
        timezone: "UTC",
        eventId: HALLOWEEN_EVENT_ID,
        items: [
          stagedItem({
            filmId: "only-film",
            source: "random",
            eventCategoryKey: "horror",
          }),
        ],
        sourceEventManuallyEnabled: false,
      });
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        const draft = await repos.drafts.getById(PROFILE_ID, outcome.draftId);
        expect(draft?.totalFilms).toBe(1);
      }
    });
  });

  describe("Christmas — same generic code, proving reuse rather than duplication", () => {
    it("Random Classic / Random Adjacent, Choose, and finalize with correct total/deadline", async () => {
      db = new FDraftLocalDatabase(`event-oaat-${crypto.randomUUID()}`);
      const repos = createLocalRepositories(db) as Repositories;
      await seedProfile(repos);
      for (let i = 0; i < 3; i++) {
        await seedOffWatchlistFilm(repos, `classic-${i}`, `Classic ${i}`);
      }
      await seedOffWatchlistFilm(repos, "adjacent-1", "Adjacent Film");
      setEventCategoryFilmIds(CHRISTMAS_EVENT_ID, {
        classic: ["classic-0", "classic-1", "classic-2"],
        adjacent: ["adjacent-1"],
      });

      const randomClassic = await pickEventOneAtATimeRandomFilm(repos, {
        profileId: PROFILE_ID,
        eventId: CHRISTMAS_EVENT_ID,
        categoryKey: "classic",
        excludeFilmIds: [],
      });
      expect(randomClassic.ok).toBe(true);
      if (randomClassic.ok) {
        expect(randomClassic.film.eventCategoryKey).toBe("classic");
      }

      const randomAdjacent = await pickEventOneAtATimeRandomFilm(repos, {
        profileId: PROFILE_ID,
        eventId: CHRISTMAS_EVENT_ID,
        categoryKey: "adjacent",
        excludeFilmIds: [],
      });
      expect(randomAdjacent.ok).toBe(true);
      if (randomAdjacent.ok) {
        expect(randomAdjacent.film.filmId).toBe("adjacent-1");
      }

      const picker = await resolveEventOneAtATimePickerCandidates(repos, {
        profileId: PROFILE_ID,
        eventId: CHRISTMAS_EVENT_ID,
        categoryKey: "classic",
        excludeFilmIds: [],
      });
      expect(picker).toHaveLength(3);

      const finalize = await finalizeEventOneAtATimeDraft(repos, {
        profileId: PROFILE_ID,
        timezone: "UTC",
        eventId: CHRISTMAS_EVENT_ID,
        items: [
          stagedItem({
            filmId: "classic-0",
            source: "manual",
            eventCategoryKey: "classic",
          }),
          stagedItem({
            filmId: "adjacent-1",
            source: "manual",
            eventCategoryKey: "adjacent",
          }),
        ],
        sourceEventManuallyEnabled: false,
      });
      expect(finalize.ok).toBe(true);
      if (finalize.ok) {
        const draft = await repos.drafts.getById(PROFILE_ID, finalize.draftId);
        expect(draft?.sourceEventId).toBe(CHRISTMAS_EVENT_ID);
        expect(draft?.totalFilms).toBe(2);
        // Christmas's fixed deadline — 1 January 00:00.
        expect(draft?.deadlineAt).toBe("2027-01-01T00:00:00.000Z");
      }
    });
  });

  describe("general", () => {
    it("cancelling the builder (never calling finalize) creates no Draft", async () => {
      db = new FDraftLocalDatabase(`event-oaat-${crypto.randomUUID()}`);
      const repos = createLocalRepositories(db) as Repositories;
      await seedProfile(repos);
      await seedOffWatchlistFilm(repos, "horror-1");
      setEventCategoryFilmIds(HALLOWEEN_EVENT_ID, { horror: ["horror-1"] });

      await pickEventOneAtATimeRandomFilm(repos, {
        profileId: PROFILE_ID,
        eventId: HALLOWEEN_EVENT_ID,
        categoryKey: "horror",
        excludeFilmIds: [],
      });

      expect(
        await repos.drafts.hasActiveDraft(PROFILE_ID, HALLOWEEN_EVENT_ID),
      ).toBe(false);
    });

    it("finalize rejects a duplicate film staged twice", async () => {
      db = new FDraftLocalDatabase(`event-oaat-${crypto.randomUUID()}`);
      const repos = createLocalRepositories(db) as Repositories;
      await seedProfile(repos);
      await seedOffWatchlistFilm(repos, "horror-1");
      setEventCategoryFilmIds(HALLOWEEN_EVENT_ID, { horror: ["horror-1"] });

      const outcome = await finalizeEventOneAtATimeDraft(repos, {
        profileId: PROFILE_ID,
        timezone: "UTC",
        eventId: HALLOWEEN_EVENT_ID,
        items: [
          stagedItem({ filmId: "horror-1", eventCategoryKey: "horror" }),
          stagedItem({
            filmId: "horror-1",
            localId: "dup",
            eventCategoryKey: "horror",
          }),
        ],
        sourceEventManuallyEnabled: false,
      });
      expect(outcome).toEqual({
        ok: false,
        error: "duplicate_film",
        message: "The same film was staged more than once.",
      });
    });

    it("an active normal Draft never blocks starting an Event One At A Time Draft, and vice versa", async () => {
      db = new FDraftLocalDatabase(`event-oaat-${crypto.randomUUID()}`);
      const repos = createLocalRepositories(db) as Repositories;
      await seedProfile(repos);
      await seedOffWatchlistFilm(repos, "horror-1");
      setEventCategoryFilmIds(HALLOWEEN_EVENT_ID, { horror: ["horror-1"] });

      await repos.drafts.createDraft({
        id: "normal-draft",
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
        customName: null,
        eventOccurrenceYear: null,
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
      });

      const outcome = await finalizeEventOneAtATimeDraft(repos, {
        profileId: PROFILE_ID,
        timezone: "UTC",
        eventId: HALLOWEEN_EVENT_ID,
        items: [stagedItem({ filmId: "horror-1", eventCategoryKey: "horror" })],
        sourceEventManuallyEnabled: false,
      });
      expect(outcome.ok).toBe(true);
    });

    it("respects Admin Mode's simulated date for the fixed deadline computation", async () => {
      db = new FDraftLocalDatabase(`event-oaat-${crypto.randomUUID()}`);
      const repos = createLocalRepositories(db) as Repositories;
      await seedProfile(repos);
      await seedOffWatchlistFilm(repos, "horror-1");
      setEventCategoryFilmIds(HALLOWEEN_EVENT_ID, { horror: ["horror-1"] });

      const outcome = await finalizeEventOneAtATimeDraft(
        repos,
        {
          profileId: PROFILE_ID,
          timezone: "UTC",
          eventId: HALLOWEEN_EVENT_ID,
          items: [
            stagedItem({ filmId: "horror-1", eventCategoryKey: "horror" }),
          ],
          sourceEventManuallyEnabled: false,
        },
        { clock: new FixedClock(new Date("2026-10-15T12:00:00.000Z")) },
      );
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        const draft = await repos.drafts.getById(PROFILE_ID, outcome.draftId);
        expect(draft?.deadlineAt).toBe("2026-11-01T00:00:00.000Z");
        expect(draft?.eventOccurrenceYear).toBe(2026);
      }
    });
  });
});
