import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useStudioAutosave } from "./use-studio-autosave";
import { getStudioAutosave } from "@/application/event-studio/studio-autosave-store";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import { fdraftThemeSchema } from "@/domain/event-themes/fdraft-theme-schema";

const PROFILE_ID = "alex";
const PRESET_ID = "halloween";
const TEST_DEBOUNCE_MS = 30;

function fixtureTheme(themeId = "halloween") {
  return fdraftThemeSchema.parse({
    schemaVersion: 1,
    themeId,
    eventId: "halloween",
    scope: "event",
    assets: {},
    layouts: {},
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("useStudioAutosave (EVENT STUDIO — PHASE 6 §1)", () => {
  let db: FDraftLocalDatabase;

  afterEach(async () => {
    cleanup();
    await db?.delete();
  });

  it("does not write immediately — it debounces", async () => {
    db = new FDraftLocalDatabase(`autosave-hook-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    renderHook(() =>
      useStudioAutosave({
        repositories: repos,
        profileId: PROFILE_ID,
        presetId: PRESET_ID,
        theme: fixtureTheme(),
        dirty: true,
        enabled: true,
        debounceMs: TEST_DEBOUNCE_MS,
      }),
    );

    expect(await getStudioAutosave(repos, PROFILE_ID, PRESET_ID)).toBeNull();
  });

  it("writes the autosave after the debounce window elapses", async () => {
    db = new FDraftLocalDatabase(`autosave-hook-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const theme = fixtureTheme();

    renderHook(() =>
      useStudioAutosave({
        repositories: repos,
        profileId: PROFILE_ID,
        presetId: PRESET_ID,
        theme,
        dirty: true,
        enabled: true,
        debounceMs: TEST_DEBOUNCE_MS,
      }),
    );

    await waitFor(async () => {
      const autosave = await getStudioAutosave(repos, PROFILE_ID, PRESET_ID);
      expect(autosave?.theme).toEqual(theme);
    });
  });

  it("does nothing while there are no unsaved changes (dirty=false)", async () => {
    db = new FDraftLocalDatabase(`autosave-hook-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    renderHook(() =>
      useStudioAutosave({
        repositories: repos,
        profileId: PROFILE_ID,
        presetId: PRESET_ID,
        theme: fixtureTheme(),
        dirty: false,
        enabled: true,
        debounceMs: TEST_DEBOUNCE_MS,
      }),
    );

    await wait(TEST_DEBOUNCE_MS * 3);

    expect(await getStudioAutosave(repos, PROFILE_ID, PRESET_ID)).toBeNull();
  });

  it("does nothing while disabled", async () => {
    db = new FDraftLocalDatabase(`autosave-hook-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    renderHook(() =>
      useStudioAutosave({
        repositories: repos,
        profileId: PROFILE_ID,
        presetId: PRESET_ID,
        theme: fixtureTheme(),
        dirty: true,
        enabled: false,
        debounceMs: TEST_DEBOUNCE_MS,
      }),
    );

    await wait(TEST_DEBOUNCE_MS * 3);

    expect(await getStudioAutosave(repos, PROFILE_ID, PRESET_ID)).toBeNull();
  });

  it("restarts the debounce window when the theme changes again before it fires", async () => {
    db = new FDraftLocalDatabase(`autosave-hook-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    const { rerender } = renderHook(
      ({ theme }) =>
        useStudioAutosave({
          repositories: repos,
          profileId: PROFILE_ID,
          presetId: PRESET_ID,
          theme,
          dirty: true,
          enabled: true,
          debounceMs: TEST_DEBOUNCE_MS,
        }),
      { initialProps: { theme: fixtureTheme("halloween-v1") } },
    );

    await wait(TEST_DEBOUNCE_MS * 0.6);
    const latestTheme = fixtureTheme("halloween-v2");
    rerender({ theme: latestTheme });

    await waitFor(async () => {
      const autosave = await getStudioAutosave(repos, PROFILE_ID, PRESET_ID);
      expect(autosave?.theme).toEqual(latestTheme);
    });
  });
});
