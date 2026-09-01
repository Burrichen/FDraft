"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  filterWorkspaceAssetsByFilter,
  friendlyAssetName,
  getWorkspaceAssetFilters,
  searchWorkspaceAssetsByFilename,
  WORKSPACE_ASSET_ALL_FILTER_ID,
  type WorkspaceAssetEntry,
} from "@/domain/event-studio/workspace-asset";
import {
  readEventArtWorkspaceAsset,
  scanEventArtWorkspaceAssets,
} from "@/infrastructure/tauri/event-art-workspace";

export interface AssetBrowserPanelProps {
  workspacePath: string | null;
  /** `naturalAspectRatio` is `null` until (if ever) the thumbnail finishes loading — see `createFixedPlacement`'s own handling of that case. Also the callback used to pick an asset for a Variant Group option (see docs/updates, "EVENT STUDIO — PHASE 5" §2: "Use asset picker/browser") when `pickerBannerText` is set — `StudioPageClient` is the one place that knows which of the two a click currently means. */
  onPlaceAsset: (
    relativePath: string,
    naturalAspectRatio: number | null,
  ) => void;
  /** When set, the browser is in "picking an asset for a Variant option" mode (rather than "place a new decoration") — shows this text as a small banner above the grid, and a Cancel affordance via `onCancelPicker`. `undefined`/omitted is the normal placement mode. */
  pickerBannerText?: string;
  onCancelPicker?: () => void;
  /** Opens the Import Image dialog (see docs/updates, "EVENT STUDIO — PHASE 9" §3) — this panel never performs the copy itself, only asks the parent to start that flow, which needs the current preset/theme context this panel deliberately doesn't have. */
  onRequestImport?: () => void;
  /** Starts a Replace Image flow for one existing asset (§6) — same reasoning, the parent owns the actual file-picker + copy call. */
  onRequestReplace?: (asset: WorkspaceAssetEntry) => void;
  /** Starts a Delete Asset flow for one existing asset (§14) — the parent checks theme references and confirms before actually deleting. */
  onRequestDelete?: (asset: WorkspaceAssetEntry) => void;
  /** Bumped by the parent after a successful import/replace/delete to trigger a rescan — a plain counter rather than an imperative ref, so "rescan now" is just an ordinary prop-driven effect like `workspacePath` changing already is. */
  refreshToken?: number;
}

/**
 * The Studio editor's Asset Browser (see docs/updates, "EVENT STUDIO —
 * PHASE 4" §1/§2/§3) — live-scans the connected Event Art Workspace via
 * `scanEventArtWorkspaceAssets`, never the app's own bundled
 * `public/events/` (see that function's own doc comment for why: this is
 * specifically for browsing a real, user-chosen Git checkout so newly
 * added files show up on refresh with zero code changes). Shows a clear,
 * friendly empty state — not an error — when no workspace is connected;
 * every OTHER editor capability (moving/resizing/etc. an already-placed
 * decoration) works regardless, since those only ever read `theme.assets`,
 * never this scan.
 */
export function AssetBrowserPanel({
  workspacePath,
  onPlaceAsset,
  pickerBannerText,
  onCancelPicker,
  onRequestImport,
  onRequestReplace,
  onRequestDelete,
  refreshToken,
}: AssetBrowserPanelProps) {
  const [assets, setAssets] = useState<WorkspaceAssetEntry[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [naturalRatios, setNaturalRatios] = useState<
    Record<string, number | null>
  >({});
  const [isScanning, setIsScanning] = useState(false);
  const [filterId, setFilterId] = useState<string>(
    WORKSPACE_ASSET_ALL_FILTER_ID,
  );
  const [query, setQuery] = useState("");

  async function rescan() {
    // A fresh scan means every previously-loaded thumbnail could now be
    // stale (a file was replaced under the same name) — cleared here, not
    // carried forward, so `pendingThumbnailFetches` below re-fetches
    // everything currently visible rather than trusting old bytes.
    pendingThumbnailFetches.current.clear();
    if (!workspacePath) {
      setAssets([]);
      setThumbnails({});
      return;
    }
    setIsScanning(true);
    try {
      const found = await scanEventArtWorkspaceAssets(workspacePath);
      setAssets(found);
      setThumbnails({});
    } finally {
      setIsScanning(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a fresh/changed workspace path (or a bumped `refreshToken` after Import/Replace/Delete) means a new scan is now loading, same accepted pattern as `useAsyncData`.
    void rescan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspacePath, refreshToken]);

  const filters = getWorkspaceAssetFilters(assets);
  const visible = searchWorkspaceAssetsByFilename(
    filterWorkspaceAssetsByFilter(assets, filterId),
    query,
  );

  // Thumbnails load LAZILY, only for whatever the current filter/search
  // actually shows (see docs/updates, "EVENT STUDIO — PHASE 7" §7) —
  // never the entire connected workspace up front. A real Git checkout
  // can have far more art than fits one filtered view, so eagerly
  // base64-encoding every file on every scan doesn't scale; this instead
  // fetches only the visible page's own files, and only once each (the
  // in-flight-tracking ref prevents a duplicate fetch if `visible`
  // recomputes — e.g. on every search keystroke — before the previous
  // fetch for the same file has resolved).
  const pendingThumbnailFetches = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!workspacePath) return;
    const toFetch = visible.filter(
      (asset) =>
        !(asset.relativePath in thumbnails) &&
        !pendingThumbnailFetches.current.has(asset.relativePath),
    );
    if (toFetch.length === 0) return;
    for (const asset of toFetch) {
      pendingThumbnailFetches.current.add(asset.relativePath);
    }
    let cancelled = false;
    void Promise.all(
      toFetch.map(async (asset) => {
        const dataUri = await readEventArtWorkspaceAsset(
          workspacePath,
          asset.relativePath,
        );
        pendingThumbnailFetches.current.delete(asset.relativePath);
        return [asset.relativePath, dataUri] as const;
      }),
    ).then((entries) => {
      if (cancelled) return;
      const loaded = entries.filter(
        (entry): entry is [string, string] => entry[1] !== null,
      );
      if (loaded.length === 0) return;
      setThumbnails((current) => ({
        ...current,
        ...Object.fromEntries(loaded),
      }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `visible` (derived from `assets`/`filterId`/`query`) is the real dependency; `thumbnails` is read only to skip already-loaded entries, not to retrigger this effect on every load.
  }, [visible, workspacePath]);

  if (!workspacePath) {
    return (
      <div className="space-y-2">
        <h2 className="text-foreground text-sm font-semibold">Assets</h2>
        <p className="text-muted-foreground text-xs">
          Connect your FDraft Project below to browse and place real Event
          assets.
        </p>
        {pickerBannerText ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={onCancelPicker}
          >
            Cancel
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-foreground text-sm font-semibold">Assets</h2>
        <div className="flex gap-1">
          {onRequestImport ? (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={onRequestImport}
              title="Copy a new image into this FDraft project"
            >
              <Upload aria-hidden="true" />
              Import Image
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={isScanning}
            onClick={() => void rescan()}
          >
            {isScanning ? "Refreshing…" : "Refresh Assets"}
          </Button>
        </div>
      </div>

      {pickerBannerText ? (
        <div className="flex items-center justify-between gap-2 rounded border border-indigo-400/50 bg-indigo-400/10 px-2 py-1.5 text-[0.7rem]">
          <span>{pickerBannerText}</span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={onCancelPicker}
          >
            Cancel
          </Button>
        </div>
      ) : null}

      <Input
        type="search"
        placeholder="Search by filename…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label="Search assets by filename"
        className="h-7 text-xs"
      />

      <div className="flex flex-wrap gap-1">
        {filters.map((filter) => (
          <button
            key={filter.id}
            type="button"
            onClick={() => setFilterId(filter.id)}
            aria-pressed={filterId === filter.id}
            className={`rounded px-2 py-0.5 text-[0.7rem] ${
              filterId === filter.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          {assets.length === 0
            ? "No recognised assets found yet — add .png/.webp/.svg files under public/events/<event>/<category>/ and refresh."
            : "No assets match this filter/search."}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-2">
          {visible.map((asset) => (
            <li key={asset.relativePath} className="group relative">
              {onRequestReplace || onRequestDelete ? (
                <div className="absolute top-1 right-1 z-10 flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                  {onRequestReplace ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onRequestReplace(asset);
                      }}
                      title={`Replace Image — ${asset.relativePath}`}
                      className="bg-card/90 text-muted-foreground hover:text-foreground rounded p-0.5 shadow-sm"
                    >
                      <RefreshCw aria-hidden="true" className="size-3" />
                      <span className="sr-only">Replace {asset.fileName}</span>
                    </button>
                  ) : null}
                  {onRequestDelete ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onRequestDelete(asset);
                      }}
                      title={`Delete Asset — ${asset.relativePath}`}
                      className="bg-card/90 text-muted-foreground hover:text-destructive rounded p-0.5 shadow-sm"
                    >
                      <Trash2 aria-hidden="true" className="size-3" />
                      <span className="sr-only">Delete {asset.fileName}</span>
                    </button>
                  ) : null}
                </div>
              ) : null}
              <button
                type="button"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData(
                    "application/x-fdraft-asset-id",
                    asset.relativePath,
                  );
                  event.dataTransfer.effectAllowed = "copy";
                }}
                onClick={() =>
                  onPlaceAsset(
                    asset.relativePath,
                    naturalRatios[asset.relativePath] ?? null,
                  )
                }
                title={`Click to place, or drag onto the canvas — ${asset.relativePath}`}
                className="border-border bg-muted/30 hover:border-primary flex w-full flex-col items-center gap-1 rounded border p-1.5 text-left"
              >
                <div className="bg-background flex h-14 w-full items-center justify-center overflow-hidden rounded">
                  {thumbnails[asset.relativePath] ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a live data: URI read from a user-chosen local workspace folder, never a static app asset next/image could optimise
                    <img
                      src={thumbnails[asset.relativePath]}
                      alt=""
                      draggable={false}
                      className="max-h-full max-w-full object-contain"
                      onLoad={(event) => {
                        const img = event.currentTarget;
                        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                          setNaturalRatios((current) => ({
                            ...current,
                            [asset.relativePath]:
                              img.naturalWidth / img.naturalHeight,
                          }));
                        }
                      }}
                    />
                  ) : (
                    <span className="text-muted-foreground text-[0.6rem]">
                      …
                    </span>
                  )}
                </div>
                <span className="text-foreground w-full truncate text-[0.65rem]">
                  {friendlyAssetName(asset.fileName)}
                </span>
                <span className="text-muted-foreground w-full truncate text-[0.6rem]">
                  {asset.eventId}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
