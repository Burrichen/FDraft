import { afterEach, describe, expect, it } from "vitest";
import {
  clearEventArtWorkspacePath,
  getEventArtWorkspacePath,
  setEventArtWorkspacePath,
} from "./workspace-store";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";

const PROFILE_ID = "alex";

describe("Event Art Workspace path store (EVENT STUDIO — PHASE 2 §7)", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("no workspace connected yet -> null", async () => {
    db = new FDraftLocalDatabase(`workspace-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    expect(await getEventArtWorkspacePath(repos, PROFILE_ID)).toBeNull();
  });

  it("set then get round-trips the exact path", async () => {
    db = new FDraftLocalDatabase(`workspace-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    await setEventArtWorkspacePath(repos, PROFILE_ID, "/Users/dev/FDraft");

    expect(await getEventArtWorkspacePath(repos, PROFILE_ID)).toBe(
      "/Users/dev/FDraft",
    );
  });

  it("changing the folder replaces the previous path", async () => {
    db = new FDraftLocalDatabase(`workspace-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    await setEventArtWorkspacePath(repos, PROFILE_ID, "/Users/dev/FDraft");
    await setEventArtWorkspacePath(repos, PROFILE_ID, "/Users/dev/FDraft-2");

    expect(await getEventArtWorkspacePath(repos, PROFILE_ID)).toBe(
      "/Users/dev/FDraft-2",
    );
  });

  it("Disconnect clears it back to null", async () => {
    db = new FDraftLocalDatabase(`workspace-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    await setEventArtWorkspacePath(repos, PROFILE_ID, "/Users/dev/FDraft");
    await clearEventArtWorkspacePath(repos, PROFILE_ID);

    expect(await getEventArtWorkspacePath(repos, PROFILE_ID)).toBeNull();
  });

  it("is isolated per profile", async () => {
    db = new FDraftLocalDatabase(`workspace-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    await setEventArtWorkspacePath(repos, PROFILE_ID, "/Users/dev/FDraft");

    expect(await getEventArtWorkspacePath(repos, "someone-else")).toBeNull();
  });

  it("survives a restart (fresh db handle against the same name)", async () => {
    const databaseName = `workspace-${crypto.randomUUID()}`;
    db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    await setEventArtWorkspacePath(repos, PROFILE_ID, "/Users/dev/FDraft");
    await db.close();

    const reopened = new FDraftLocalDatabase(databaseName);
    const reopenedRepos = createLocalRepositories(reopened);
    expect(await getEventArtWorkspacePath(reopenedRepos, PROFILE_ID)).toBe(
      "/Users/dev/FDraft",
    );
    db = reopened;
  });
});
