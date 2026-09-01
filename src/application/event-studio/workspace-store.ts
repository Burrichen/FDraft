import type { SettingsRepository } from "@/repositories/settings-repository";

const EVENT_ART_WORKSPACE_PATH_KEY = "eventStudio.workspacePath";

/**
 * The Event Art Workspace's persisted path (see docs/updates, "EVENT
 * STUDIO — PHASE 2" §7) — a plain, profile-scoped settings value, same
 * mechanism/isolation as every other persisted preference in this app
 * (`events.dateOverride`, `events.themePreviewOverride`, ...). Only ever
 * read/written from FDraft (Dev) UI (gated by `isEventStudioBuild`); a
 * normal FDraft profile that somehow had this key set (e.g. via a shared
 * backup) simply never reads it — nothing in normal FDraft's code path
 * looks at this key at all.
 */
export async function getEventArtWorkspacePath(
  repos: { settings: SettingsRepository },
  profileId: string,
): Promise<string | null> {
  const stored = await repos.settings.get<string>(
    profileId,
    EVENT_ART_WORKSPACE_PATH_KEY,
  );
  return typeof stored === "string" && stored.trim().length > 0 ? stored : null;
}

export async function setEventArtWorkspacePath(
  repos: { settings: SettingsRepository },
  profileId: string,
  path: string,
): Promise<void> {
  await repos.settings.set(profileId, EVENT_ART_WORKSPACE_PATH_KEY, path);
}

export async function clearEventArtWorkspacePath(
  repos: { settings: SettingsRepository },
  profileId: string,
): Promise<void> {
  await repos.settings.set(profileId, EVENT_ART_WORKSPACE_PATH_KEY, null);
}
