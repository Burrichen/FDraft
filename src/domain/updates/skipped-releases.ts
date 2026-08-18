import { parseReleaseNotes, type ParsedReleaseNotes } from "./release-notes";

/**
 * A one-click FDraft update always installs the LATEST release directly
 * — Tauri's updater endpoint is GitHub's "latest" release alias, and an
 * NSIS install is a full replace, not a chain of incremental patches, so
 * there is nothing to "fix" about the update mechanism itself jumping
 * straight from an old version to the newest one in a single step (see
 * docs/updates, v1.0.3 "Now Updating", "MULTI-VERSION UPDATE JUMPS").
 * What WAS missing: the dialog only ever showed the latest release's own
 * notes, silently skipping whatever changed in versions in between —
 * someone updating from v1.0.1 straight to v1.0.3 would never see what
 * v1.0.2 itself added. This module fills that gap, purely from data
 * already fetched from GitHub (see `infrastructure/updates/
 * github-releases-client.ts`) — no separate patch-note source.
 */
export interface RemoteReleaseLike {
  version: string;
  body: string | null;
}

export interface SkippedRelease extends ParsedReleaseNotes {
  version: string;
}

function versionParts(version: string): number[] {
  return version.split(".").map((part) => Number.parseInt(part, 10) || 0);
}

/** A plain x.y.z comparator — sufficient for FDraft's own version scheme, which never uses pre-release/build suffixes. Returns <0/0/>0 like `Array.prototype.sort`'s comparator. */
export function compareVersions(a: string, b: string): number {
  const partsA = versionParts(a);
  const partsB = versionParts(b);
  const length = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < length; i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Every published release strictly between `currentVersion` (already
 * installed) and `targetVersion` (the update being offered) — the
 * versions a one-click update would otherwise silently skip past.
 * `targetVersion` itself is deliberately excluded: its notes are already
 * the update dialog's own primary heading, sourced directly from the
 * update check rather than this list. Sorted newest-first, matching the
 * in-app Patch Notes viewer's own convention.
 */
export function selectSkippedReleases(
  releases: readonly RemoteReleaseLike[],
  currentVersion: string,
  targetVersion: string,
): SkippedRelease[] {
  return releases
    .filter(
      (release) =>
        compareVersions(release.version, currentVersion) > 0 &&
        compareVersions(release.version, targetVersion) < 0,
    )
    .sort((a, b) => compareVersions(b.version, a.version))
    .map((release) => ({
      version: release.version,
      ...parseReleaseNotes(release.body),
    }));
}
