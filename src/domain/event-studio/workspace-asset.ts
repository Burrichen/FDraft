/** One recognised image file found under a connected workspace's `public/events/<eventId>/<category>/` (see docs/updates, "EVENT STUDIO — PHASE 4" §2) — `relativePath` is shaped exactly like a `.fdraft-theme` asset map value (`events/<eventId>/<category>/<file>`), ready to paste straight into one. The canonical shape both `scan_event_art_workspace_assets` (Rust) and its `scanEventArtWorkspaceAssets` (infra) wrapper produce. */
export interface WorkspaceAssetEntry {
  relativePath: string;
  eventId: string;
  category: string;
  fileName: string;
}

/**
 * The shared/common asset folder's event id (see docs/updates, "EVENT
 * STUDIO — PHASE 4" §1: "Default/Common"). Not a real registered Event —
 * a convention this phase introduces for `public/events/common/<category>/`
 * assets meant to be usable alongside ANY event's own filter, the same
 * way `event-studio-presets.ts`'s `DEFAULT_EVENT_STUDIO_PRESET_ID`
 * introduced `"default"` as a non-Event pseudo-preset id. No such folder
 * exists in the repo yet — this is purely a recognised convention,
 * picked up automatically the moment one does (§2: "without code
 * changes").
 */
export const WORKSPACE_ASSET_COMMON_EVENT_ID = "common";

/** The pseudo-filter id meaning "show every scanned asset, regardless of event." */
export const WORKSPACE_ASSET_ALL_FILTER_ID = "all";

/**
 * The exact five categories every real Event asset lives under (see
 * docs/updates, "EVENT STUDIO — PHASE 9" §3: "optionally chooses a
 * category") — kept in the SAME order/spelling as
 * `fdraft-theme-schema.ts`'s own `ASSET_CATEGORY_PATTERN` and Rust's
 * `ASSET_CATEGORIES`, the one shared source the Import dialog's Folder
 * dropdown reads from rather than re-typing this list a fourth time.
 */
export const EVENT_ASSET_CATEGORIES = [
  "decorations",
  "interactives",
  "modal",
  "icons",
  "backgrounds",
] as const;
export type EventAssetCategory = (typeof EVENT_ASSET_CATEGORIES)[number];

export interface WorkspaceAssetFilterOption {
  id: string;
  label: string;
}

const KNOWN_EVENT_LABELS: Record<string, string> = {
  halloween: "Halloween",
  "f-you-its-january": "January",
  christmas: "Christmas",
};

function labelForEventId(eventId: string): string {
  return (
    KNOWN_EVENT_LABELS[eventId] ??
    eventId
      .split(/[-_]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  );
}

/**
 * Builds the Asset Browser's filter list from whatever event ids the
 * latest scan actually found (see §1: "Generate future Event filters
 * automatically where folders exist") — "All" and "Default/Common" always
 * appear (even with zero matching assets yet), every other filter is
 * derived purely from `assets`, sorted alphabetically by label so a new
 * event folder slots in predictably rather than always landing last.
 */
export function getWorkspaceAssetFilters(
  assets: readonly WorkspaceAssetEntry[],
): WorkspaceAssetFilterOption[] {
  const eventIds = new Set(
    assets
      .map((asset) => asset.eventId)
      .filter((eventId) => eventId !== WORKSPACE_ASSET_COMMON_EVENT_ID),
  );

  const eventFilters = Array.from(eventIds)
    .map((eventId) => ({ id: eventId, label: labelForEventId(eventId) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return [
    { id: WORKSPACE_ASSET_ALL_FILTER_ID, label: "All" },
    { id: WORKSPACE_ASSET_COMMON_EVENT_ID, label: "Default/Common" },
    ...eventFilters,
  ];
}

/**
 * Filters the scanned asset list for one selected filter id (see §1:
 * "Filtering Halloween should show ONLY assets from the Halloween Event
 * asset folder plus explicitly shared/common assets where appropriate")
 * — a specific event filter always ALSO includes the shared/common
 * folder's assets alongside its own; "All" shows everything; "Default/
 * Common" alone shows only the shared folder's own assets.
 */
export function filterWorkspaceAssetsByFilter(
  assets: readonly WorkspaceAssetEntry[],
  filterId: string,
): WorkspaceAssetEntry[] {
  if (filterId === WORKSPACE_ASSET_ALL_FILTER_ID) {
    return [...assets];
  }
  if (filterId === WORKSPACE_ASSET_COMMON_EVENT_ID) {
    return assets.filter(
      (asset) => asset.eventId === WORKSPACE_ASSET_COMMON_EVENT_ID,
    );
  }
  return assets.filter(
    (asset) =>
      asset.eventId === filterId ||
      asset.eventId === WORKSPACE_ASSET_COMMON_EVENT_ID,
  );
}

/** Case-insensitive substring match against `fileName` — the Asset Browser's search box (see §2: "Search by filename"). An empty/whitespace-only query returns every asset unchanged. */
export function searchWorkspaceAssetsByFilename(
  assets: readonly WorkspaceAssetEntry[],
  query: string,
): WorkspaceAssetEntry[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === "") {
    return [...assets];
  }
  return assets.filter((asset) =>
    asset.fileName.toLowerCase().includes(trimmed),
  );
}

/** A short, friendly display name derived from a filename — e.g. `"pumpkin-lit.png"` -> `"pumpkin lit"` (see §3: "friendly filename/name," kept compact, no extension). */
export function friendlyAssetName(fileName: string): string {
  return fileName.replace(/\.[a-zA-Z0-9]+$/, "").replace(/[-_]+/g, " ");
}
