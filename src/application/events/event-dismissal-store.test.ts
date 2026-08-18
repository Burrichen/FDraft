import { afterEach, describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import {
  dismissEventForCycle,
  getEventDismissals,
} from "./event-dismissal-store";

const PROFILE_ID = "alex";

describe("event-dismissal-store", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("returns an empty map for a profile that has never dismissed anything", async () => {
    db = new FDraftLocalDatabase(`event-dismissals-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    expect(await getEventDismissals(repos, PROFILE_ID)).toEqual({});
  });

  it("records a dismissal keyed by event id and cycle id", async () => {
    db = new FDraftLocalDatabase(`event-dismissals-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    await dismissEventForCycle(repos, PROFILE_ID, "some-event", "2026");

    expect(await getEventDismissals(repos, PROFILE_ID)).toEqual({
      "some-event": "2026",
    });
  });

  it("dismissing a second, different event preserves the first event's dismissal", async () => {
    db = new FDraftLocalDatabase(`event-dismissals-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    await dismissEventForCycle(repos, PROFILE_ID, "event-a", "2026");
    await dismissEventForCycle(repos, PROFILE_ID, "event-b", "2026");

    expect(await getEventDismissals(repos, PROFILE_ID)).toEqual({
      "event-a": "2026",
      "event-b": "2026",
    });
  });

  it("re-dismissing the same event overwrites its previously recorded cycle", async () => {
    db = new FDraftLocalDatabase(`event-dismissals-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    await dismissEventForCycle(repos, PROFILE_ID, "some-event", "2026");
    await dismissEventForCycle(repos, PROFILE_ID, "some-event", "2027");

    expect(await getEventDismissals(repos, PROFILE_ID)).toEqual({
      "some-event": "2027",
    });
  });

  it("ignores a corrupted persisted value instead of throwing", async () => {
    db = new FDraftLocalDatabase(`event-dismissals-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await repos.settings.set(PROFILE_ID, "events.dismissals", {
      "some-event": 42, // not a string
      "other-event": "2026",
    });

    expect(await getEventDismissals(repos, PROFILE_ID)).toEqual({
      "other-event": "2026",
    });
  });
});
