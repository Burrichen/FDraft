import { afterEach, describe, expect, it } from "vitest";
import {
  clearStudioSave,
  clearStudioWorkingTheme,
  getStudioSave,
  getStudioWorkingTheme,
  setStudioSave,
  setStudioWorkingTheme,
} from "./studio-working-theme-store";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import { fdraftThemeSchema } from "@/domain/event-themes/fdraft-theme-schema";

const PROFILE_ID = "alex";
const PRESET_ID = "halloween";

function fixtureTheme() {
  return fdraftThemeSchema.parse({
    schemaVersion: 1,
    themeId: "halloween",
    eventId: "halloween",
    scope: "event",
    assets: {},
    layouts: {},
  });
}

describe("studio-working-theme-store (EVENT STUDIO — PHASE 6 §2, the deliberate Save/Load slot)", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("no Save yet -> null", async () => {
    db = new FDraftLocalDatabase(`studio-save-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    expect(await getStudioSave(repos, PROFILE_ID, PRESET_ID)).toBeNull();
  });

  it("setStudioSave then getStudioSave round-trips both the theme and savedAt", async () => {
    db = new FDraftLocalDatabase(`studio-save-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const theme = fixtureTheme();

    await setStudioSave(
      repos,
      PROFILE_ID,
      PRESET_ID,
      theme,
      "2026-09-01T12:00:00.000Z",
    );

    const save = await getStudioSave(repos, PROFILE_ID, PRESET_ID);
    expect(save?.theme).toEqual(theme);
    expect(save?.savedAt).toBe("2026-09-01T12:00:00.000Z");
  });

  it("defaults savedAt to now when not given", async () => {
    db = new FDraftLocalDatabase(`studio-save-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const before = Date.now();

    await setStudioSave(repos, PROFILE_ID, PRESET_ID, fixtureTheme());

    const save = await getStudioSave(repos, PROFILE_ID, PRESET_ID);
    expect(new Date(save!.savedAt).getTime()).toBeGreaterThanOrEqual(before);
  });

  it("clearStudioSave removes it", async () => {
    db = new FDraftLocalDatabase(`studio-save-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await setStudioSave(repos, PROFILE_ID, PRESET_ID, fixtureTheme());

    await clearStudioSave(repos, PROFILE_ID, PRESET_ID);

    expect(await getStudioSave(repos, PROFILE_ID, PRESET_ID)).toBeNull();
  });

  it("is keyed per preset — saving one preset doesn't touch another", async () => {
    db = new FDraftLocalDatabase(`studio-save-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await setStudioSave(repos, PROFILE_ID, "halloween", fixtureTheme());

    expect(await getStudioSave(repos, PROFILE_ID, "christmas")).toBeNull();
  });

  describe("backward-compatible theme-only aliases", () => {
    it("setStudioWorkingTheme + getStudioWorkingTheme round-trips just the theme", async () => {
      db = new FDraftLocalDatabase(`studio-save-${crypto.randomUUID()}`);
      const repos = createLocalRepositories(db);
      const theme = fixtureTheme();

      await setStudioWorkingTheme(repos, PROFILE_ID, PRESET_ID, theme);

      expect(await getStudioWorkingTheme(repos, PROFILE_ID, PRESET_ID)).toEqual(
        theme,
      );
    });

    it("clearStudioWorkingTheme removes it", async () => {
      db = new FDraftLocalDatabase(`studio-save-${crypto.randomUUID()}`);
      const repos = createLocalRepositories(db);
      await setStudioWorkingTheme(repos, PROFILE_ID, PRESET_ID, fixtureTheme());

      await clearStudioWorkingTheme(repos, PROFILE_ID, PRESET_ID);

      expect(
        await getStudioWorkingTheme(repos, PROFILE_ID, PRESET_ID),
      ).toBeNull();
    });

    it("setStudioWorkingTheme and setStudioSave share the same underlying slot", async () => {
      db = new FDraftLocalDatabase(`studio-save-${crypto.randomUUID()}`);
      const repos = createLocalRepositories(db);
      const theme = fixtureTheme();

      await setStudioWorkingTheme(repos, PROFILE_ID, PRESET_ID, theme);

      const save = await getStudioSave(repos, PROFILE_ID, PRESET_ID);
      expect(save?.theme).toEqual(theme);
    });
  });
});
