import { afterEach, describe, expect, it } from "vitest";
import {
  clearStudioAutosave,
  getStudioAutosave,
  setStudioAutosave,
} from "./studio-autosave-store";
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

describe("studio-autosave-store (EVENT STUDIO — PHASE 6 §1, the debounced background safety net)", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("no autosave yet -> null", async () => {
    db = new FDraftLocalDatabase(`studio-autosave-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    expect(await getStudioAutosave(repos, PROFILE_ID, PRESET_ID)).toBeNull();
  });

  it("round-trips the theme and savedAt", async () => {
    db = new FDraftLocalDatabase(`studio-autosave-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const theme = fixtureTheme();

    await setStudioAutosave(
      repos,
      PROFILE_ID,
      PRESET_ID,
      theme,
      "2026-09-01T12:00:00.000Z",
    );

    const autosave = await getStudioAutosave(repos, PROFILE_ID, PRESET_ID);
    expect(autosave?.theme).toEqual(theme);
    expect(autosave?.savedAt).toBe("2026-09-01T12:00:00.000Z");
  });

  it("clearStudioAutosave removes it", async () => {
    db = new FDraftLocalDatabase(`studio-autosave-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await setStudioAutosave(repos, PROFILE_ID, PRESET_ID, fixtureTheme());

    await clearStudioAutosave(repos, PROFILE_ID, PRESET_ID);

    expect(await getStudioAutosave(repos, PROFILE_ID, PRESET_ID)).toBeNull();
  });

  it("lives in a separate slot from the deliberate Save — writing an autosave never appears there", async () => {
    db = new FDraftLocalDatabase(`studio-autosave-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const { getStudioSave } = await import("./studio-working-theme-store");

    await setStudioAutosave(repos, PROFILE_ID, PRESET_ID, fixtureTheme());

    expect(await getStudioSave(repos, PROFILE_ID, PRESET_ID)).toBeNull();
  });

  it("a later autosave overwrites the earlier one for the same preset", async () => {
    db = new FDraftLocalDatabase(`studio-autosave-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await setStudioAutosave(
      repos,
      PROFILE_ID,
      PRESET_ID,
      fixtureTheme(),
      "2026-09-01T10:00:00.000Z",
    );
    await setStudioAutosave(
      repos,
      PROFILE_ID,
      PRESET_ID,
      fixtureTheme(),
      "2026-09-01T11:00:00.000Z",
    );

    const autosave = await getStudioAutosave(repos, PROFILE_ID, PRESET_ID);
    expect(autosave?.savedAt).toBe("2026-09-01T11:00:00.000Z");
  });
});
