"use client";

import { useEffect, useRef, useState } from "react";
import { readEventArtWorkspaceAsset } from "@/infrastructure/tauri/event-art-workspace";

/**
 * Resolves the Studio canvas's placement images through the connected
 * FDraft Project workspace (see docs/updates, "EVENT STUDIO — PHASE 9"
 * §3: Import Image must be "immediately usable") rather than the plain
 * `/events/...` static URL the shared production renderer
 * (`event-theme-layout-renderer.tsx`, used unmodified by real Beta) uses.
 * A PACKAGED FDraft (Dev) build has no live bridge from an arbitrary
 * connected project folder into its own bundled asset server, so a
 * freshly imported or replaced image (which only exists on disk in that
 * folder) would otherwise silently fail to load — `EventArtImage` hides
 * itself entirely on the browser's `onError`, with no visible error at
 * all, until the app is rebuilt with the file baked in.
 *
 * Reads each referenced asset's bytes as a `data:` URI via the same
 * Tauri command the Asset Browser's own thumbnails already use, cached
 * by raw path so repeated renders don't re-read the file. Pass a
 * changing `refreshToken` (e.g. after Replace Image, which reuses the
 * SAME path) to force a re-read of whatever's currently visible.
 *
 * Deliberately ONE effect, not a separate "reset on identity change"
 * effect plus a "fetch" effect — two effects meant an identity change's
 * `setResolved({})` (a genuinely new object, even when clearing an
 * already-empty cache) forced an extra render in between them, which
 * recomputed `rawPaths` (fresh every render) and re-ran the fetch effect
 * with a NEW `pending`/`resolved` snapshot — cancelling the very first
 * fetch before it resolved, while the retry saw those paths already
 * marked pending and fetched nothing, silently stranding the request
 * forever. Also deliberately has no "cancelled" gate on applying a
 * result — `pending` alone prevents duplicate concurrent fetches of the
 * same path regardless of which render started them, and results are
 * merged via the functional `setState` form so a slow fetch from an
 * earlier render is still safe to apply later; the only real caveat is a
 * workspace switch mid-flight, guarded separately via `workspacePathRef`.
 *
 * Returns raw path unchanged (today's static-URL behavior) for any path
 * not yet resolved, or when `workspacePath` is `null` — the same
 * bundled-asset path still works for a dev-from-source run, where this
 * bridge is redundant but harmless.
 */
export function useWorkspaceAssetSources(
  workspacePath: string | null,
  rawPaths: readonly (string | null)[],
  refreshToken = 0,
): Record<string, string> {
  const [resolved, setResolved] = useState<Record<string, string>>({});
  const pending = useRef<Set<string>>(new Set());
  const identityRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const workspacePathRef = useRef(workspacePath);

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  useEffect(() => {
    workspacePathRef.current = workspacePath;
    let currentResolved = resolved;
    const identity = `${workspacePath ?? ""}::${refreshToken}`;
    if (identityRef.current !== identity) {
      identityRef.current = identity;
      pending.current.clear();
      currentResolved = {};
      // A no-op (returns the SAME reference, so React bails out of
      // re-rendering) when there was nothing cached to clear — e.g. the
      // very first run on mount — which is what keeps this from
      // triggering the extra-render race this hook's own doc comment
      // describes.
      setResolved((current) =>
        Object.keys(current).length === 0 ? current : {},
      );
    }
    if (!workspacePath) return;
    const relativePaths = Array.from(
      new Set(
        rawPaths
          .filter((path): path is string => Boolean(path))
          .map((path) => path.replace(/^\//, "")),
      ),
    );
    const toFetch = relativePaths.filter(
      (path) => !(path in currentResolved) && !pending.current.has(path),
    );
    if (toFetch.length === 0) return;
    for (const path of toFetch) pending.current.add(path);
    void Promise.all(
      toFetch.map(async (relativePath): Promise<[string, string | null]> => {
        const dataUri = await readEventArtWorkspaceAsset(
          workspacePath,
          relativePath,
        );
        pending.current.delete(relativePath);
        return [`/${relativePath}`, dataUri];
      }),
    ).then((entries) => {
      if (!mountedRef.current || workspacePathRef.current !== workspacePath) {
        return;
      }
      const loaded = entries.filter(
        (entry): entry is [string, string] => entry[1] !== null,
      );
      if (loaded.length === 0) return;
      setResolved((current) => ({
        ...current,
        ...Object.fromEntries(loaded),
      }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `rawPaths` (a fresh array most renders) is the real dependency; `resolved` is read only to seed `currentResolved` for this specific run, not to retrigger on every load.
  }, [rawPaths, workspacePath, refreshToken]);

  return resolved;
}
