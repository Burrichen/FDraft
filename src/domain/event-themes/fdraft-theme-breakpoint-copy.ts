import type {
  FDraftThemeBreakpointId,
  FDraftThemeFile,
} from "./fdraft-theme-schema";

/**
 * Whether copying INTO `to` would overwrite placements that differ from
 * `from`'s — the exact condition `StudioPageClient`'s "Copy Desktop
 * Layout -> Tablet"/"Copy Tablet -> Mobile" actions (see docs/updates,
 * "EVENT STUDIO — PHASE 3" §10) use to decide whether to show a
 * confirmation prompt first. `false` when the destination has no
 * placements yet (nothing to lose) or is already identical to the
 * source (the copy would be a no-op).
 */
export function breakpointCopyWouldOverwriteEdits(
  theme: FDraftThemeFile,
  pageId: string,
  stateId: string,
  from: FDraftThemeBreakpointId,
  to: FDraftThemeBreakpointId,
): boolean {
  const state = theme.layouts[pageId]?.states[stateId];
  const destination = state?.breakpoints[to]?.placements ?? [];
  if (destination.length === 0) {
    return false;
  }
  const source = state?.breakpoints[from]?.placements ?? [];
  return JSON.stringify(destination) !== JSON.stringify(source);
}

/**
 * Replaces `to`'s placements, for exactly one page/state, with a deep
 * clone of `from`'s — every other page, state, and breakpoint in `theme`
 * is untouched. Breakpoints stay independently editable afterward (see
 * §10: "breakpoints remain independently editable"); this is a one-time
 * copy, never a persistent link between the two tiers. Returns `theme`
 * unchanged if `pageId`/`stateId`/`from` don't exist in it.
 */
export function copyBreakpointLayout(
  theme: FDraftThemeFile,
  pageId: string,
  stateId: string,
  from: FDraftThemeBreakpointId,
  to: FDraftThemeBreakpointId,
): FDraftThemeFile {
  const state = theme.layouts[pageId]?.states[stateId];
  const sourcePlacements = state?.breakpoints[from]?.placements;
  if (!state || sourcePlacements === undefined) {
    return theme;
  }

  return {
    ...theme,
    layouts: {
      ...theme.layouts,
      [pageId]: {
        ...theme.layouts[pageId],
        states: {
          ...theme.layouts[pageId].states,
          [stateId]: {
            ...state,
            breakpoints: {
              ...state.breakpoints,
              [to]: {
                placements: JSON.parse(JSON.stringify(sourcePlacements)),
              },
            },
          },
        },
      },
    },
  };
}
