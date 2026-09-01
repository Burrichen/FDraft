import {
  fdraftThemeSchema,
  type FDraftThemeFile,
} from "@/domain/event-themes/fdraft-theme-schema";
import type { SettingsRepository } from "@/repositories/settings-repository";

const THEME_PREVIEW_OVERRIDE_KEY = "events.themePreviewOverride";

/**
 * The Admin-only QA preview override (see docs/updates, "EVENT STUDIO —
 * PHASE 1" §14) — an imported `.fdraft-theme` a profile is temporarily
 * previewing, stored COMPLETELY SEPARATELY from the canonical bundled
 * theme files under `public/event-themes/` (this settings key, never
 * touching any file on disk). Exactly one override at a time per profile
 * (matching "Import .fdraft-theme for Preview" / "Remove Preview
 * Override" — singular, not a list); importing a new one replaces
 * whatever was previously being previewed.
 *
 * The stored value is the ALREADY-VALIDATED `FDraftThemeFile` object
 * (not raw text) — re-validated on every read via `fdraftThemeSchema`
 * anyway, since a hand-edited or cross-version-migrated IndexedDB value
 * is untrusted input exactly like any other persisted setting; a
 * validation failure on READ is treated as "no override" rather than a
 * crash, so a corrupted override can never take down the app.
 */
export async function getThemePreviewOverride(
  repos: { settings: SettingsRepository },
  profileId: string,
): Promise<FDraftThemeFile | null> {
  const stored = await repos.settings.get<unknown>(
    profileId,
    THEME_PREVIEW_OVERRIDE_KEY,
  );
  if (stored === null || stored === undefined) {
    return null;
  }
  const result = fdraftThemeSchema.safeParse(stored);
  return result.success ? result.data : null;
}

export async function setThemePreviewOverride(
  repos: { settings: SettingsRepository },
  profileId: string,
  theme: FDraftThemeFile,
): Promise<void> {
  await repos.settings.set(profileId, THEME_PREVIEW_OVERRIDE_KEY, theme);
}

export async function clearThemePreviewOverride(
  repos: { settings: SettingsRepository },
  profileId: string,
): Promise<void> {
  await repos.settings.set(profileId, THEME_PREVIEW_OVERRIDE_KEY, null);
}
