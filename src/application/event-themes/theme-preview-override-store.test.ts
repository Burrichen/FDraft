import { afterEach, describe, expect, it } from "vitest";
import {
  clearThemePreviewOverride,
  getThemePreviewOverride,
  setThemePreviewOverride,
} from "./theme-preview-override-store";
import { fdraftThemeSchema, type FDraftThemeFile } from "@/domain/event-themes/fdraft-theme-schema";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";

const PROFILE_ID = "alex";

function testTheme(themeId: string): FDraftThemeFile {
  return fdraftThemeSchema.parse({
    schemaVersion: 1,
    themeId,
    eventId: themeId,
    scope: "event",
    assets: {},
    layouts: {},
  });
}

describe("Theme preview override store — Admin-only QA import (EVENT STUDIO — PHASE 1 §14)", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("no override recorded yet -> null", async () => {
    db = new FDraftLocalDatabase(`theme-override-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    expect(await getThemePreviewOverride(repos, PROFILE_ID)).toBeNull();
  });

  it("set then get round-trips the exact theme", async () => {
    db = new FDraftLocalDatabase(`theme-override-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const theme = testTheme("halloween");

    await setThemePreviewOverride(repos, PROFILE_ID, theme);

    const stored = await getThemePreviewOverride(repos, PROFILE_ID);
    expect(stored).toEqual(theme);
  });

  it("importing a new override replaces the previous one (exactly one at a time)", async () => {
    db = new FDraftLocalDatabase(`theme-override-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    await setThemePreviewOverride(repos, PROFILE_ID, testTheme("halloween"));
    await setThemePreviewOverride(repos, PROFILE_ID, testTheme("january"));

    const stored = await getThemePreviewOverride(repos, PROFILE_ID);
    expect(stored?.themeId).toBe("january");
  });

  it("Remove Preview Override clears it back to null", async () => {
    db = new FDraftLocalDatabase(`theme-override-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    await setThemePreviewOverride(repos, PROFILE_ID, testTheme("halloween"));
    await clearThemePreviewOverride(repos, PROFILE_ID);

    expect(await getThemePreviewOverride(repos, PROFILE_ID)).toBeNull();
  });

  it("is isolated per profile", async () => {
    db = new FDraftLocalDatabase(`theme-override-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    await setThemePreviewOverride(repos, PROFILE_ID, testTheme("halloween"));

    expect(await getThemePreviewOverride(repos, "someone-else")).toBeNull();
  });

  it("survives a restart (fresh db handle against the same name)", async () => {
    const databaseName = `theme-override-${crypto.randomUUID()}`;
    db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    await setThemePreviewOverride(repos, PROFILE_ID, testTheme("halloween"));
    await db.close();

    const reopened = new FDraftLocalDatabase(databaseName);
    const reopenedRepos = createLocalRepositories(reopened);
    expect((await getThemePreviewOverride(reopenedRepos, PROFILE_ID))?.themeId).toBe(
      "halloween",
    );
    db = reopened;
  });

  it("a corrupted/malformed stored value reads back as null rather than throwing", async () => {
    db = new FDraftLocalDatabase(`theme-override-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await repos.settings.set(PROFILE_ID, "events.themePreviewOverride", {
      not: "a valid theme",
    });

    await expect(getThemePreviewOverride(repos, PROFILE_ID)).resolves.toBeNull();
  });
});
