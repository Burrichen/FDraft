import { afterEach, describe, expect, it } from "vitest";
import {
  acknowledgeEventEnding,
  clearEventEndingAcknowledgement,
  getEventEndingAcknowledgements,
  isEventEndingAcknowledged,
} from "./event-ending-acknowledgement-store";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";

const PROFILE_ID = "alex";

describe("Event-ending acknowledgement store", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("an occurrence with no recorded entry is unacknowledged", async () => {
    db = new FDraftLocalDatabase(`ending-ack-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    expect(
      await isEventEndingAcknowledged(repos, PROFILE_ID, "halloween:2026"),
    ).toBe(false);
  });

  it("acknowledging records exactly that occurrence, leaving others untouched", async () => {
    db = new FDraftLocalDatabase(`ending-ack-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    await acknowledgeEventEnding(repos, {
      profileId: PROFILE_ID,
      occurrenceKey: "halloween:2026",
    });

    expect(
      await isEventEndingAcknowledged(repos, PROFILE_ID, "halloween:2026"),
    ).toBe(true);
    expect(
      await isEventEndingAcknowledged(repos, PROFILE_ID, "halloween:2027"),
    ).toBe(false);
  });

  it("acknowledging one event's occurrence never affects a different event's", async () => {
    db = new FDraftLocalDatabase(`ending-ack-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    await acknowledgeEventEnding(repos, {
      profileId: PROFILE_ID,
      occurrenceKey: "halloween:2026",
    });
    await acknowledgeEventEnding(repos, {
      profileId: PROFILE_ID,
      occurrenceKey: "f-you-its-january:2026",
    });

    const all = await getEventEndingAcknowledgements(repos, PROFILE_ID);
    expect(all).toEqual({
      "halloween:2026": true,
      "f-you-its-january:2026": true,
    });
  });

  it("clearing resets exactly one occurrence back to unacknowledged (the dev-only testing reset)", async () => {
    db = new FDraftLocalDatabase(`ending-ack-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    await acknowledgeEventEnding(repos, {
      profileId: PROFILE_ID,
      occurrenceKey: "halloween:2026",
    });
    await clearEventEndingAcknowledgement(repos, {
      profileId: PROFILE_ID,
      occurrenceKey: "halloween:2026",
    });

    expect(
      await isEventEndingAcknowledged(repos, PROFILE_ID, "halloween:2026"),
    ).toBe(false);
  });

  it("clearing an occurrence that was never acknowledged is a safe no-op", async () => {
    db = new FDraftLocalDatabase(`ending-ack-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    await expect(
      clearEventEndingAcknowledgement(repos, {
        profileId: PROFILE_ID,
        occurrenceKey: "halloween:2026",
      }),
    ).resolves.toBeUndefined();
  });

  it("acknowledgements are isolated per profile", async () => {
    db = new FDraftLocalDatabase(`ending-ack-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    await acknowledgeEventEnding(repos, {
      profileId: PROFILE_ID,
      occurrenceKey: "halloween:2026",
    });

    expect(
      await isEventEndingAcknowledged(repos, "someone-else", "halloween:2026"),
    ).toBe(false);
  });

  it("acknowledgement survives a restart (fresh db handle against the same name)", async () => {
    const databaseName = `ending-ack-${crypto.randomUUID()}`;
    db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);

    await acknowledgeEventEnding(repos, {
      profileId: PROFILE_ID,
      occurrenceKey: "halloween:2026",
    });
    await db.close();

    const reopened = new FDraftLocalDatabase(databaseName);
    const reopenedRepos = createLocalRepositories(reopened);
    expect(
      await isEventEndingAcknowledged(
        reopenedRepos,
        PROFILE_ID,
        "halloween:2026",
      ),
    ).toBe(true);
    db = reopened;
  });

  it("drops a malformed stored value rather than throwing", async () => {
    db = new FDraftLocalDatabase(`ending-ack-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    await repos.settings.set(PROFILE_ID, "events.endingAcknowledgements", {
      "halloween:2026": "not-a-boolean",
      "f-you-its-january:2026": true,
    });

    const all = await getEventEndingAcknowledgements(repos, PROFILE_ID);
    expect(all).toEqual({ "f-you-its-january:2026": true });
  });
});
