import {
  fdraftThemeSchema,
  type FDraftThemeFile,
} from "@/domain/event-themes/fdraft-theme-schema";
import type { SettingsRepository } from "@/repositories/settings-repository";

/**
 * Event Studio's own per-preset DELIBERATE SAVE (see docs/updates, "EVENT
 * STUDIO — PHASE 3" §2, "EVENT STUDIO — PHASE 6" §2: "The toolbar Save
 * action creates/updates the deliberate saved Studio state for the
 * selected preset") — the toolbar's own "Save"/"Load"/"Saved
 * <timestamp>" state. Deliberately NOT the same store as EITHER
 * `theme-preview-override-store.ts` (the Admin-only Beta QA "import a
 * theme file to preview" override) OR `studio-autosave-store.ts` (the
 * debounced, non-deliberate background safety net a crash/restart
 * recovers from) — three genuinely different slots for three genuinely
 * different "what does this saved state MEAN" answers, never conflated.
 *
 * Stores `{ theme, savedAt }`, not just the theme — `savedAt` is what
 * lets the toolbar show "Saved <timestamp>" (§2) and lets Load compare
 * recency against a pending autosave when deciding what "the last
 * deliberately saved version" actually is.
 */
export interface StudioSave {
  theme: FDraftThemeFile;
  /** ISO 8601 — when this Save was made. */
  savedAt: string;
}

function savedThemeKey(presetId: string): string {
  return `studio.workingTheme.${presetId}`;
}

function parseStoredSave(stored: unknown): StudioSave | null {
  if (
    typeof stored !== "object" ||
    stored === null ||
    !("theme" in stored) ||
    !("savedAt" in stored) ||
    typeof (stored as { savedAt: unknown }).savedAt !== "string"
  ) {
    return null;
  }
  const result = fdraftThemeSchema.safeParse(
    (stored as { theme: unknown }).theme,
  );
  return result.success
    ? { theme: result.data, savedAt: (stored as { savedAt: string }).savedAt }
    : null;
}

export async function getStudioSave(
  repos: { settings: SettingsRepository },
  profileId: string,
  presetId: string,
): Promise<StudioSave | null> {
  const stored = await repos.settings.get<unknown>(
    profileId,
    savedThemeKey(presetId),
  );
  return parseStoredSave(stored);
}

export async function setStudioSave(
  repos: { settings: SettingsRepository },
  profileId: string,
  presetId: string,
  theme: FDraftThemeFile,
  savedAt: string = new Date().toISOString(),
): Promise<StudioSave> {
  const save: StudioSave = { theme, savedAt };
  await repos.settings.set(profileId, savedThemeKey(presetId), save);
  return save;
}

export async function clearStudioSave(
  repos: { settings: SettingsRepository },
  profileId: string,
  presetId: string,
): Promise<void> {
  await repos.settings.remove(profileId, savedThemeKey(presetId));
}

// --- Backward-compatible aliases (Phase 3–5 call sites) ---
// `getStudioWorkingTheme`/`setStudioWorkingTheme`/`clearStudioWorkingTheme`
// pre-date the `{ theme, savedAt }` shape (Phase 6) — kept here as thin
// theme-only wrappers so nothing outside `studio-page-client.tsx` (which
// Phase 6 updates to use the new, timestamp-aware functions directly)
// needs to change.
export async function getStudioWorkingTheme(
  repos: { settings: SettingsRepository },
  profileId: string,
  presetId: string,
): Promise<FDraftThemeFile | null> {
  const save = await getStudioSave(repos, profileId, presetId);
  return save?.theme ?? null;
}

export async function setStudioWorkingTheme(
  repos: { settings: SettingsRepository },
  profileId: string,
  presetId: string,
  theme: FDraftThemeFile,
): Promise<void> {
  await setStudioSave(repos, profileId, presetId, theme);
}

export async function clearStudioWorkingTheme(
  repos: { settings: SettingsRepository },
  profileId: string,
  presetId: string,
): Promise<void> {
  await clearStudioSave(repos, profileId, presetId);
}
