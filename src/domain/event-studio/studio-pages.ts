/**
 * The Event Studio editor workspace's page/state/breakpoint vocabulary
 * (see docs/updates, "EVENT STUDIO — PHASE 3" §3/§4/§5) — pure data, no
 * React and no repository access here, exactly like `event-definition.ts`
 * keeps the Event registry's own shape free of either. `StudioPageId`
 * covers every real FDraft page plus two pseudo-pages (`introModal`/
 * `endingModal`) for the two Event dialogs that don't live at their own
 * route.
 *
 * `requiresEventPreset` marks a page whose content is meaningless without
 * a real, registered Event selected — the Default preset has nothing to
 * show there (see `studio-fixtures.ts`'s handling of this case), so the
 * workspace shell hides/disables these pages while Default is selected.
 */

export type StudioBreakpointId = "desktop" | "tablet" | "mobile";

export interface StudioBreakpointDefinition {
  id: StudioBreakpointId;
  label: string;
  /** Canonical viewport dimensions (see §4) — real, representative device sizes, not arbitrary round numbers. */
  width: number;
  height: number;
}

/**
 * The three canonical breakpoints every `.fdraft-theme` layout already
 * resolves against (see `fdraft-theme-schema.ts`'s `FDRAFT_THEME_BREAKPOINT_IDS`)
 * — kept as the SAME three ids here so a page/state preview and a theme
 * layout preview never disagree about what "tablet" means.
 */
export const STUDIO_BREAKPOINTS: readonly StudioBreakpointDefinition[] = [
  { id: "desktop", label: "Desktop", width: 1440, height: 900 },
  { id: "tablet", label: "Tablet", width: 768, height: 1024 },
  { id: "mobile", label: "Mobile", width: 375, height: 812 },
];

export const DEFAULT_STUDIO_BREAKPOINT_ID: StudioBreakpointId = "desktop";

export type StudioPageId =
  | "watchlist"
  | "drafts"
  | "eventPage"
  | "history"
  | "stats"
  | "settings"
  | "profile"
  | "introModal"
  | "endingModal";

export interface StudioPageStateDefinition {
  id: string;
  label: string;
}

export interface StudioPageDefinition {
  id: StudioPageId;
  label: string;
  states: readonly StudioPageStateDefinition[];
  /** True for a page/pseudo-page that only makes sense with a real Event preset selected (Event Page, and both dialog pseudo-pages) — see this file's own doc comment. */
  requiresEventPreset?: boolean;
}

export const STUDIO_PAGES: readonly StudioPageDefinition[] = [
  {
    id: "watchlist",
    label: "Watchlist",
    states: [
      { id: "populated", label: "Populated" },
      { id: "empty", label: "Empty" },
    ],
  },
  {
    id: "drafts",
    label: "Drafts",
    states: [
      { id: "empty", label: "Empty" },
      { id: "creation", label: "Creation" },
      { id: "active", label: "Active" },
      { id: "completed", label: "Completed" },
    ],
  },
  {
    id: "eventPage",
    label: "Event Page",
    requiresEventPreset: true,
    states: [
      { id: "empty", label: "Empty" },
      { id: "creation", label: "Creation" },
      { id: "active", label: "Active" },
      { id: "completed", label: "Completed" },
    ],
  },
  {
    id: "history",
    label: "History",
    states: [
      { id: "populated", label: "Populated" },
      { id: "empty", label: "Empty" },
    ],
  },
  {
    id: "stats",
    label: "Stats",
    states: [{ id: "populated", label: "Populated" }],
  },
  {
    id: "settings",
    label: "Settings",
    states: [
      { id: "normal", label: "Normal" },
      { id: "eventActive", label: "Event Active" },
    ],
  },
  {
    id: "profile",
    label: "Profile",
    states: [{ id: "normal", label: "Normal" }],
  },
  {
    id: "introModal",
    label: "Event Introduction",
    requiresEventPreset: true,
    states: [{ id: "default", label: "Default" }],
  },
  {
    id: "endingModal",
    label: "Event Ending",
    requiresEventPreset: true,
    states: [{ id: "default", label: "Default" }],
  },
];

export function getStudioPage(
  pageId: string,
): StudioPageDefinition | undefined {
  return STUDIO_PAGES.find((page) => page.id === pageId);
}

/**
 * `introModal`/`endingModal` render as a small dialog centred over the
 * page, not the full breakpoint canvas (see docs/updates, "EVENT STUDIO —
 * PHASE 7" §1) — a placement's sensible default `coordinateSpace` there
 * is `"viewport"` (CSS `position: fixed`, tracking the dialog itself)
 * rather than `"page"` (CSS `position: absolute`, tracking the full
 * underlying page), so newly-placed artwork visually sits with the
 * modal, not the page behind it.
 */
export function isModalStudioPage(pageId: StudioPageId): boolean {
  return pageId === "introModal" || pageId === "endingModal";
}

export function getStudioBreakpoint(
  breakpointId: string,
): StudioBreakpointDefinition {
  return (
    STUDIO_BREAKPOINTS.find((breakpoint) => breakpoint.id === breakpointId) ??
    STUDIO_BREAKPOINTS[0]
  );
}
