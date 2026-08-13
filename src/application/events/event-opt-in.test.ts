import { afterEach, describe, expect, it } from "vitest";
import { createLocalDraft } from "@/application/drafts/local-draft-service";
import {
  applyEventOptIn,
  beginEventOptIn,
  confirmSayGoodbye,
} from "@/application/events/event-opt-in";
import { getEventSettings } from "@/application/events/event-settings-store";
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

describe("beginEventOptIn / applyEventOptIn / confirmSayGoodbye", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("with no active draft, applies the opt-in immediately — the existing, unchanged path", async () => {
    db = new FDraftLocalDatabase(`event-optin-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    const result = await beginEventOptIn(repos, { profileId: PROFILE_ID });
    expect(result).toEqual({ needsSayGoodbye: false });

    const settings = await getEventSettings(repos, PROFILE_ID);
    expect(settings.eventsEnabled).toBe(true);
  });

  it("with an active draft, never touches event settings — reports needsSayGoodbye instead", async () => {
    db = new FDraftLocalDatabase(`event-optin-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 3);
    const created = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 3,
        challengeCount: 0,
      },
    });
    if (!created.ok) throw new Error("unreachable");

    const result = await beginEventOptIn(repos, { profileId: PROFILE_ID });
    expect(result).toEqual({
      needsSayGoodbye: true,
      activeDraftId: created.draftId,
    });

    const settings = await getEventSettings(repos, PROFILE_ID);
    expect(settings.eventsEnabled).toBe(false);
  });

  it("confirmSayGoodbye settles/discards the outgoing draft and completes the opt-in", async () => {
    db = new FDraftLocalDatabase(`event-optin-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedActiveFilms(repos, 2);
    const created = await createLocalDraft(repos, {
      profileId: PROFILE_ID,
      timezone: "UTC",
      config: {
        difficulty: "baby",
        timeMode: "timer",
        randomCount: 2,
        challengeCount: 0,
      },
    });
    if (!created.ok) throw new Error("unreachable");

    const begin = await beginEventOptIn(repos, { profileId: PROFILE_ID });
    if (!begin.needsSayGoodbye) throw new Error("unreachable");

    await confirmSayGoodbye(repos, {
      profileId: PROFILE_ID,
      draftId: begin.activeDraftId,
    });

    const draft = await repos.drafts.getById(PROFILE_ID, created.draftId);
    expect(draft?.status).toBe("discarded");
    expect(draft?.sourceEventId).toBeNull();
    expect(draft?.rewardsGrantedAt).not.toBeNull();

    const settings = await getEventSettings(repos, PROFILE_ID);
    expect(settings.eventsEnabled).toBe(true);
  });

  it("cancelling (never calling confirmSayGoodbye) leaves the draft active and the event off", async () => {
    db = new FDraftLocalDatabase(`event-optin-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
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

    await beginEventOptIn(repos, { profileId: PROFILE_ID });
    // No confirmSayGoodbye call — this is what "Cancel" is: doing nothing.

    const draft = await repos.drafts.getById(PROFILE_ID, created.draftId);
    expect(draft?.status).toBe("active");
    const settings = await getEventSettings(repos, PROFILE_ID);
    expect(settings.eventsEnabled).toBe(false);
  });

  it("applyEventOptIn only ever changes eventsEnabled, preserving other event settings", async () => {
    db = new FDraftLocalDatabase(`event-optin-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await repos.settings.set(PROFILE_ID, "events.settings", {
      eventsEnabled: false,
      eventVisualsEnabled: true,
      activeEvent: null,
      manuallyEnabledEvents: ["some-event"],
    });

    await applyEventOptIn(repos, { profileId: PROFILE_ID });

    expect(await getEventSettings(repos, PROFILE_ID)).toEqual({
      eventsEnabled: true,
      eventVisualsEnabled: true,
      activeEvent: null,
      manuallyEnabledEvents: ["some-event"],
    });
  });
});
