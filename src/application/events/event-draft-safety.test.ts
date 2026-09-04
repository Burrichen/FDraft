import { afterEach, describe, expect, it } from "vitest";
import { createLocalDraft } from "@/application/drafts/local-draft-service";
import { setEventSettings } from "@/application/events/event-settings-store";
import { DEFAULT_EVENT_SETTINGS } from "@/domain/events/event-settings";
import { HALLOWEEN_EVENT_ID } from "@/domain/events/event-registry";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import type { Repositories } from "@/repositories";

/**
 * Regression coverage for docs/updates, "PROMPT 18 — EVENT PAGES +
 * HALLOWEEN LIFECYCLE", section "ACTIVE DRAFT SAFETY" and "HALLOWEEN PAGE
 * LIFECYCLE" — neither behaviour required any code change (both were
 * already true by construction: `handleEventVisualsChange` only ever
 * calls `setEventSettings`, and `listArchived` is a plain
 * `[profileId, status]` query with no event-liveness filtering), so these
 * tests exist purely to lock that in.
 */

const PROFILE_ID = "alex";

async function seedActiveFilms(repos: Repositories, count: number) {
  for (let i = 0; i < count; i++) {
    const filmId = `film-${i}`;
    await repos.films.create({
      id: filmId,
      title: `Film ${i}`,
      releaseYear: 2000 + i,
      letterboxdSlug: filmId,
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

describe("Toggling Event visuals never mutates a draft", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("leaves every DraftRecord and DraftItemRecord byte-for-byte unchanged", async () => {
    db = new FDraftLocalDatabase(`event-draft-safety-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 2);
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

    const draftBefore = await repos.drafts.getById(PROFILE_ID, created.draftId);
    const itemsBefore = await repos.drafts.listItemsForDraft(created.draftId);

    await setEventSettings(repos, PROFILE_ID, {
      ...DEFAULT_EVENT_SETTINGS,
      eventVisualsEnabled: true,
    });
    await setEventSettings(repos, PROFILE_ID, {
      ...DEFAULT_EVENT_SETTINGS,
      eventVisualsEnabled: false,
    });

    const draftAfter = await repos.drafts.getById(PROFILE_ID, created.draftId);
    const itemsAfter = await repos.drafts.listItemsForDraft(created.draftId);
    expect(draftAfter).toEqual(draftBefore);
    expect(itemsAfter).toEqual(itemsBefore);
  });
});

describe("History preserves Halloween-sourced drafts after opting out (PROMPT 18)", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("an archived Halloween-owned draft still appears in listArchived after eventsEnabled is turned off", async () => {
    db = new FDraftLocalDatabase(`event-draft-safety-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    const archivedDraft = {
      id: "halloween-draft-1",
      profileId: PROFILE_ID,
      difficulty: "baby" as const,
      timeMode: "timer" as const,
      status: "archived" as const,
      totalFilms: 1,
      randomFilmCount: 1,
      challengeFilmCount: 0,
      challengeMode: null,
      startedAt: "2026-10-15T00:00:00.000Z",
      deadlineAt: "2026-11-14T00:00:00.000Z",
      timezone: "UTC",
      completedAt: "2026-10-16T00:00:00.000Z",
      freeformAchievedRank: null,
      sourceEventId: HALLOWEEN_EVENT_ID,
      sourceEventManuallyEnabled: false,
      rewardsGrantedAt: "2026-10-16T00:00:00.000Z",
      eventOccurrenceYear: null,
      customName: null,
      createdAt: "2026-10-15T00:00:00.000Z",
      updatedAt: "2026-10-16T00:00:00.000Z",
    };
    await repos.drafts.createDraft(archivedDraft);

    await setEventSettings(repos, PROFILE_ID, {
      ...DEFAULT_EVENT_SETTINGS,
      eventsEnabled: true,
      activeEvent: HALLOWEEN_EVENT_ID,
    });
    expect(
      (await repos.drafts.listArchived(PROFILE_ID)).map((d) => d.id),
    ).toContain("halloween-draft-1");

    // Opt out entirely — the profile is no longer "in" Halloween at all.
    await setEventSettings(repos, PROFILE_ID, {
      ...DEFAULT_EVENT_SETTINGS,
      eventsEnabled: false,
      activeEvent: null,
    });

    const stillArchived = await repos.drafts.listArchived(PROFILE_ID);
    expect(stillArchived.map((d) => d.id)).toContain("halloween-draft-1");
    expect(stillArchived.find((d) => d.id === "halloween-draft-1")).toEqual(
      archivedDraft,
    );
  });
});
