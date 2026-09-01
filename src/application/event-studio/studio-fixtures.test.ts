import { afterEach, describe, expect, it } from "vitest";
import { getEventDiscovery } from "@/application/events/event-discovery";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import {
  HALLOWEEN_EVENT_ID,
  F_YOU_ITS_JANUARY_EVENT_ID,
} from "@/domain/events/event-registry";
import {
  loadStudioFixture,
  STUDIO_FIXTURE_PROFILE_ID,
} from "./studio-fixtures";

const databases: string[] = [];

function dbName(): string {
  const name = `studio-fixtures-test-${crypto.randomUUID()}`;
  databases.push(name);
  return name;
}

afterEach(async () => {
  await Promise.all(
    databases.splice(0).map(
      (name) =>
        new Promise<void>((resolve) => {
          const request = indexedDB.deleteDatabase(name);
          request.onsuccess = () => resolve();
          request.onerror = () => resolve();
        }),
    ),
  );
});

async function openRepos(databaseName: string) {
  const db = new FDraftLocalDatabase(databaseName);
  return { db, repos: createLocalRepositories(db) };
}

describe("loadStudioFixture — watchlist page", () => {
  it("populated: seeds active watchlist entries; empty: seeds none", async () => {
    const name = dbName();
    await loadStudioFixture(name, {
      presetId: "default",
      pageId: "watchlist",
      stateId: "populated",
    });
    const { db, repos } = await openRepos(name);
    const populated = await repos.watchlist.listActiveEntries(
      STUDIO_FIXTURE_PROFILE_ID,
    );
    expect(populated.length).toBeGreaterThan(0);
    await db.close();

    await loadStudioFixture(name, {
      presetId: "default",
      pageId: "watchlist",
      stateId: "empty",
    });
    const { db: db2, repos: repos2 } = await openRepos(name);
    const empty = await repos2.watchlist.listActiveEntries(
      STUDIO_FIXTURE_PROFILE_ID,
    );
    expect(empty).toHaveLength(0);
    await db2.close();
  });

  it("reseeding the same database name is a clean delete-then-recreate — no leftovers from a previous state", async () => {
    const name = dbName();
    await loadStudioFixture(name, {
      presetId: "default",
      pageId: "watchlist",
      stateId: "populated",
    });
    await loadStudioFixture(name, {
      presetId: "default",
      pageId: "drafts",
      stateId: "empty",
    });
    const { db, repos } = await openRepos(name);
    const entries = await repos.watchlist.listActiveEntries(
      STUDIO_FIXTURE_PROFILE_ID,
    );
    expect(entries).toHaveLength(0);
    await db.close();
  });
});

describe("loadStudioFixture — drafts page", () => {
  it("empty: no active/expired draft at all", async () => {
    const name = dbName();
    await loadStudioFixture(name, {
      presetId: "default",
      pageId: "drafts",
      stateId: "empty",
    });
    const { db, repos } = await openRepos(name);
    expect(
      await repos.drafts.getActiveOrExpiredDraft(
        STUDIO_FIXTURE_PROFILE_ID,
        null,
      ),
    ).toBeNull();
    await db.close();
  });

  it("creation: flags renderNewDraftForm and seeds a usable watchlist, but no draft", async () => {
    const name = dbName();
    const result = await loadStudioFixture(name, {
      presetId: "default",
      pageId: "drafts",
      stateId: "creation",
    });
    expect(result.renderNewDraftForm).toBe(true);
    const { db, repos } = await openRepos(name);
    expect(
      await repos.drafts.getActiveOrExpiredDraft(
        STUDIO_FIXTURE_PROFILE_ID,
        null,
      ),
    ).toBeNull();
    expect(
      (await repos.watchlist.listActiveEntries(STUDIO_FIXTURE_PROFILE_ID))
        .length,
    ).toBeGreaterThan(0);
    await db.close();
  });

  it("active: seeds an active draft with items, not all completed", async () => {
    const name = dbName();
    await loadStudioFixture(name, {
      presetId: "default",
      pageId: "drafts",
      stateId: "active",
    });
    const { db, repos } = await openRepos(name);
    const draft = await repos.drafts.getActiveOrExpiredDraft(
      STUDIO_FIXTURE_PROFILE_ID,
      null,
    );
    expect(draft?.status).toBe("active");
    const items = await repos.drafts.listItemsForDraft(draft!.id);
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((item) => !item.isCompleted)).toBe(true);
    await db.close();
  });

  it("completed: seeds an expired draft (the real postmortem-eligible state)", async () => {
    const name = dbName();
    await loadStudioFixture(name, {
      presetId: "default",
      pageId: "drafts",
      stateId: "completed",
    });
    const { db, repos } = await openRepos(name);
    const draft = await repos.drafts.getActiveOrExpiredDraft(
      STUDIO_FIXTURE_PROFILE_ID,
      null,
    );
    expect(draft?.status).toBe("expired");
    await db.close();
  });
});

describe("loadStudioFixture — eventPage (Halloween)", () => {
  it("empty: unanswered participation, event available now — never touches production EventClock (Admin override only, in a throwaway database)", async () => {
    const name = dbName();
    await loadStudioFixture(name, {
      presetId: HALLOWEEN_EVENT_ID,
      pageId: "eventPage",
      stateId: "empty",
    });
    const { db, repos } = await openRepos(name);
    const discovery = await getEventDiscovery(repos, {
      profileId: STUDIO_FIXTURE_PROFILE_ID,
      timezone: "UTC",
    });
    const status = discovery.statuses.find(
      (candidate) => candidate.event.id === HALLOWEEN_EVENT_ID,
    );
    expect(status?.available).toBe(true);
    expect(status?.participation).toBe("unanswered");
    await db.close();
  });

  it("active: joined participation, an active draft with items exists", async () => {
    const name = dbName();
    await loadStudioFixture(name, {
      presetId: HALLOWEEN_EVENT_ID,
      pageId: "eventPage",
      stateId: "active",
    });
    const { db, repos } = await openRepos(name);
    const discovery = await getEventDiscovery(repos, {
      profileId: STUDIO_FIXTURE_PROFILE_ID,
      timezone: "UTC",
    });
    const status = discovery.statuses.find(
      (candidate) => candidate.event.id === HALLOWEEN_EVENT_ID,
    );
    expect(status?.participation).toBe("joined");
    const draft = await repos.drafts.getActiveOrExpiredDraft(
      STUDIO_FIXTURE_PROFILE_ID,
      HALLOWEEN_EVENT_ID,
    );
    expect(draft?.status).toBe("active");
    await db.close();
  });

  it("a manual-only preset with no natural window (no EventDefinition match) seeds nothing extra and never throws", async () => {
    const name = dbName();
    await expect(
      loadStudioFixture(name, {
        presetId: "not-a-real-event",
        pageId: "eventPage",
        stateId: "active",
      }),
    ).resolves.toBeTruthy();
  });
});

describe("loadStudioFixture — endingModal", () => {
  it("Halloween (has a defined ending): joined + expired occurrence, not yet acknowledged", async () => {
    const name = dbName();
    await loadStudioFixture(name, {
      presetId: HALLOWEEN_EVENT_ID,
      pageId: "endingModal",
      stateId: "default",
    });
    const { db, repos } = await openRepos(name);
    const discovery = await getEventDiscovery(repos, {
      profileId: STUDIO_FIXTURE_PROFILE_ID,
      timezone: "UTC",
    });
    const status = discovery.statuses.find(
      (candidate) => candidate.event.id === HALLOWEEN_EVENT_ID,
    );
    expect(status?.available).toBe(false);
    expect(status?.participation).toBe("joined");
    expect(status?.endingAcknowledged).toBe(false);
    await db.close();
  });

  it("January (no defined ending): seeds no occurrence at all — nothing to acknowledge", async () => {
    const name = dbName();
    await loadStudioFixture(name, {
      presetId: F_YOU_ITS_JANUARY_EVENT_ID,
      pageId: "endingModal",
      stateId: "default",
    });
    const { db, repos } = await openRepos(name);
    const discovery = await getEventDiscovery(repos, {
      profileId: STUDIO_FIXTURE_PROFILE_ID,
      timezone: "UTC",
    });
    const status = discovery.statuses.find(
      (candidate) => candidate.event.id === F_YOU_ITS_JANUARY_EVENT_ID,
    );
    expect(status?.participation).toBe("unanswered");
    await db.close();
  });
});

describe("loadStudioFixture — stats page", () => {
  it("seeds non-zero point balances and watched history", async () => {
    const name = dbName();
    await loadStudioFixture(name, {
      presetId: "default",
      pageId: "stats",
      stateId: "populated",
    });
    const { db, repos } = await openRepos(name);
    expect(
      await repos.points.getBalance(STUDIO_FIXTURE_PROFILE_ID, "lifetime"),
    ).toBeGreaterThan(0);
    expect(
      (await repos.history.listWatchedHistory(STUDIO_FIXTURE_PROFILE_ID))
        .length,
    ).toBeGreaterThan(0);
    await db.close();
  });
});
