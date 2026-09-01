import {
  fdraftThemeSchema,
  type FDraftThemeFile,
} from "@/domain/event-themes/fdraft-theme-schema";
import type { SettingsRepository } from "@/repositories/settings-repository";

/**
 * Event Studio's debounced AUTOSAVE (see docs/updates, "EVENT STUDIO —
 * PHASE 6" §1) — a background safety net, written into the SAME separate
 * FDraft (Dev) data store every other Studio persistence already lives
 * in (`"fdraft-dev"`, see `(app)/layout.tsx`'s own doc comment), but kept
 * in ITS OWN key, entirely distinct from `studio-working-theme-store.ts`'s
 * deliberate Save slot: "Autosave is NOT the same as committing/
 * exporting production themes" (§1), and it must never silently become
 * what Load restores (§3: "Load restores the last DELIBERATELY saved
 * Studio version") — only a genuine crash/restart recovery path
 * (`useStudioAutosave`'s own consumer in `studio-page-client.tsx`) ever
 * reads this store back out.
 */
export interface StudioAutosave {
  theme: FDraftThemeFile;
  /** ISO 8601 — when this autosave last actually wrote. */
  savedAt: string;
}

function autosaveKey(presetId: string): string {
  return `studio.autosave.${presetId}`;
}

function parseStoredAutosave(stored: unknown): StudioAutosave | null {
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

export async function getStudioAutosave(
  repos: { settings: SettingsRepository },
  profileId: string,
  presetId: string,
): Promise<StudioAutosave | null> {
  const stored = await repos.settings.get<unknown>(
    profileId,
    autosaveKey(presetId),
  );
  return parseStoredAutosave(stored);
}

export async function setStudioAutosave(
  repos: { settings: SettingsRepository },
  profileId: string,
  presetId: string,
  theme: FDraftThemeFile,
  savedAt: string = new Date().toISOString(),
): Promise<void> {
  const autosave: StudioAutosave = { theme, savedAt };
  await repos.settings.set(profileId, autosaveKey(presetId), autosave);
}

/** Cleared once a deliberate Save (or a Load/Reset that starts a fresh baseline) makes the pending autosave moot — an autosave that's already superseded has nothing left to recover. */
export async function clearStudioAutosave(
  repos: { settings: SettingsRepository },
  profileId: string,
  presetId: string,
): Promise<void> {
  await repos.settings.remove(profileId, autosaveKey(presetId));
}
