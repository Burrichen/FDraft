import { afterEach, describe, expect, it } from "vitest";
import {
  getEventSettings,
  setEventSettings,
} from "@/application/events/event-settings-store";
import { DEFAULT_EVENT_SETTINGS } from "@/domain/events/event-settings";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";

const PROFILE_ID = "alex";

describe("getEventSettings / setEventSettings", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("defaults to fully off/empty when nothing has been set (existing profiles, unchanged behaviour)", async () => {
    db = new FDraftLocalDatabase(`event-settings-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    expect(await getEventSettings(repos, PROFILE_ID)).toEqual(
      DEFAULT_EVENT_SETTINGS,
    );
  });

  it("persists a change and reads it back — survives a simulated reload", async () => {
    db = new FDraftLocalDatabase(`event-settings-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    await setEventSettings(repos, PROFILE_ID, {
      eventsEnabled: true,
      eventVisualsEnabled: false,
      activeEvent: "signal-from-beyond",
      manuallyEnabledEvents: ["signal-from-beyond"],
    });

    // A fresh repositories instance against the same underlying database —
    // the same thing a real app reload does.
    const reloadedRepos = createLocalRepositories(db);
    expect(await getEventSettings(reloadedRepos, PROFILE_ID)).toEqual({
      eventsEnabled: true,
      eventVisualsEnabled: false,
      activeEvent: "signal-from-beyond",
      manuallyEnabledEvents: ["signal-from-beyond"],
    });
  });

  it("falls back to defaults for a corrupted persisted value, rather than crashing", async () => {
    db = new FDraftLocalDatabase(`event-settings-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await repos.settings.set(PROFILE_ID, "events.settings", "not-an-object");

    expect(await getEventSettings(repos, PROFILE_ID)).toEqual(
      DEFAULT_EVENT_SETTINGS,
    );
  });

  it("keeps each profile's event settings independent", async () => {
    db = new FDraftLocalDatabase(`event-settings-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    await setEventSettings(repos, "profile-a", {
      ...DEFAULT_EVENT_SETTINGS,
      eventsEnabled: true,
    });
    await setEventSettings(repos, "profile-b", {
      ...DEFAULT_EVENT_SETTINGS,
      eventVisualsEnabled: true,
    });

    expect(await getEventSettings(repos, "profile-a")).toEqual({
      ...DEFAULT_EVENT_SETTINGS,
      eventsEnabled: true,
    });
    expect(await getEventSettings(repos, "profile-b")).toEqual({
      ...DEFAULT_EVENT_SETTINGS,
      eventVisualsEnabled: true,
    });
  });
});
