import {
  fdraftThemeSchema,
  type FDraftThemeFile,
} from "@/domain/event-themes/fdraft-theme-schema";
import type { SettingsRepository } from "@/repositories/settings-repository";

/**
 * A lightweight, per-preset revision history (see docs/updates, "EVENT
 * STUDIO — PHASE 6" §4) — explicitly NOT a Git implementation ("Do not
 * build Git inside FDraft"): a small, bounded, newest-first list of named/
 * timestamped snapshots, stored the same way every other Studio
 * persistence already is (`SettingsRepository`, the profile-scoped
 * `"fdraft-dev"` store). Restoring one just makes it the CURRENT working
 * theme — it doesn't retroactively rewrite history, so restoring an old
 * revision and then editing further simply continues forward from there,
 * the same way undo/redo already works within one editing session.
 */
export interface StudioRevision {
  id: string;
  /** e.g. "Saved 14:32" — see `createRevisionLabel`. */
  label: string;
  theme: FDraftThemeFile;
  createdAt: string;
}

/** "a small reasonable number" (§4) — old revisions beyond this are pruned oldest-first, newest always kept. */
export const MAX_STUDIO_REVISIONS = 10;

function revisionsKey(presetId: string): string {
  return `studio.revisions.${presetId}`;
}

function parseStoredRevisions(stored: unknown): StudioRevision[] {
  if (!Array.isArray(stored)) {
    return [];
  }
  const revisions: StudioRevision[] = [];
  for (const entry of stored) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as { id?: unknown }).id !== "string" ||
      typeof (entry as { label?: unknown }).label !== "string" ||
      typeof (entry as { createdAt?: unknown }).createdAt !== "string"
    ) {
      continue;
    }
    const parsed = fdraftThemeSchema.safeParse(
      (entry as { theme?: unknown }).theme,
    );
    if (parsed.success) {
      revisions.push({
        id: (entry as { id: string }).id,
        label: (entry as { label: string }).label,
        theme: parsed.data,
        createdAt: (entry as { createdAt: string }).createdAt,
      });
    }
  }
  return revisions;
}

/** Newest first. */
export async function getStudioRevisions(
  repos: { settings: SettingsRepository },
  profileId: string,
  presetId: string,
): Promise<StudioRevision[]> {
  const stored = await repos.settings.get<unknown>(
    profileId,
    revisionsKey(presetId),
  );
  return parseStoredRevisions(stored);
}

/** Prepends a new revision and prunes down to `MAX_STUDIO_REVISIONS`, oldest dropped first. */
export async function addStudioRevision(
  repos: { settings: SettingsRepository },
  profileId: string,
  presetId: string,
  theme: FDraftThemeFile,
  label: string,
  createdAt: string = new Date().toISOString(),
): Promise<StudioRevision[]> {
  const existing = await getStudioRevisions(repos, profileId, presetId);
  const revision: StudioRevision = {
    id: crypto.randomUUID(),
    label,
    theme,
    createdAt,
  };
  const next = [revision, ...existing].slice(0, MAX_STUDIO_REVISIONS);
  await repos.settings.set(profileId, revisionsKey(presetId), next);
  return next;
}

/** A friendly default label — "Saved 14:32" — for a revision the Save action creates automatically. */
export function createRevisionLabel(at: Date = new Date()): string {
  return `Saved ${at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}
