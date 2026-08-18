/**
 * Fetches every published (non-draft, non-prerelease) GitHub release —
 * used to fill in the patch notes for versions a one-click update jumps
 * straight past (see docs/updates, v1.0.3 "Now Updating", "MULTI-VERSION
 * UPDATE JUMPS"). Plain `fetch()`, not the Tauri HTTP plugin: GitHub's
 * public releases endpoint needs no API key and serves permissive CORS
 * headers, so — unlike TMDB's metadata requests (see
 * `application/metadata/remote-metadata-client.ts`) — there's no
 * proxying or platform-specific transport needed here; the desktop
 * webview can just call it directly, the same way the Tauri updater
 * plugin itself already reaches GitHub for `latest.json`.
 *
 * Fails soft: any network or parsing problem resolves to an empty list
 * rather than throwing, so a skipped-releases lookup can never break the
 * main update flow it's only ever supplementing (see
 * `components/updates/update-provider.tsx`).
 */
export interface RemoteRelease {
  /** Tag name with any leading "v" stripped, e.g. "1.0.2". */
  version: string;
  body: string | null;
}

const RELEASES_URL =
  "https://api.github.com/repos/Burrichen/FDraft/releases?per_page=30";

interface RawGithubRelease {
  tag_name: unknown;
  body: unknown;
  draft: unknown;
  prerelease: unknown;
}

function isRawGithubRelease(value: unknown): value is RawGithubRelease {
  return typeof value === "object" && value !== null && "tag_name" in value;
}

export async function fetchPublishedReleases(): Promise<RemoteRelease[]> {
  try {
    const response = await fetch(RELEASES_URL, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) return [];

    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) return [];

    return payload
      .filter(isRawGithubRelease)
      .filter(
        (release) =>
          typeof release.tag_name === "string" &&
          !release.draft &&
          !release.prerelease,
      )
      .map((release) => ({
        version: (release.tag_name as string).replace(/^v/, ""),
        body: typeof release.body === "string" ? release.body : null,
      }));
  } catch {
    return [];
  }
}
