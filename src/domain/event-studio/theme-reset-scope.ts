import type {
  FDraftThemeBreakpointId,
  FDraftThemeFile,
  FDraftThemePageLayout,
  FDraftThemeStateLayout,
} from "@/domain/event-themes/fdraft-theme-schema";

/**
 * Three distinct Reset levels (EVENT STUDIO — PHASE 6 §5) rather than one
 * ambiguous destructive button. Each takes the theme currently being
 * edited plus the CANONICAL bundled theme (the fixture/shipped
 * `.fdraft-theme` the preset started from) and restores only the scope
 * named — everything outside that scope is left exactly as the editor
 * had it.
 */

/** Reset Current Page — replaces this page's layout wholesale with the canonical one (or removes it, if the canonical theme has no such page). */
export function resetPageToCanonical(
  theme: FDraftThemeFile,
  canonical: FDraftThemeFile,
  pageId: string,
): FDraftThemeFile {
  const nextLayouts = { ...theme.layouts };
  const canonicalPage = canonical.layouts[pageId];
  if (canonicalPage) {
    nextLayouts[pageId] = canonicalPage;
  } else {
    delete nextLayouts[pageId];
  }
  return { ...theme, layouts: nextLayouts };
}

/** Reset Current Breakpoint — replaces only one page/state/breakpoint's placement list, leaving every other breakpoint (and every other page) untouched. */
export function resetBreakpointToCanonical(
  theme: FDraftThemeFile,
  canonical: FDraftThemeFile,
  pageId: string,
  stateId: string,
  breakpointId: FDraftThemeBreakpointId,
): FDraftThemeFile {
  const canonicalBreakpoint =
    canonical.layouts[pageId]?.states[stateId]?.breakpoints[breakpointId];

  const currentPage: FDraftThemePageLayout = theme.layouts[pageId] ?? {
    states: {},
  };
  const currentState: FDraftThemeStateLayout = currentPage.states[stateId] ?? {
    breakpoints: {},
  };
  const nextBreakpoints = { ...currentState.breakpoints };

  if (canonicalBreakpoint) {
    nextBreakpoints[breakpointId] = canonicalBreakpoint;
  } else {
    delete nextBreakpoints[breakpointId];
  }

  return {
    ...theme,
    layouts: {
      ...theme.layouts,
      [pageId]: {
        ...currentPage,
        states: {
          ...currentPage.states,
          [stateId]: { ...currentState, breakpoints: nextBreakpoints },
        },
      },
    },
  };
}

/** Reset Entire Event/Preset — the canonical theme in full, replacing the whole working theme (the entire-event level always requires confirmation, per §5 — that's a UI concern, not this function's). */
export function resetEntireThemeToCanonical(
  canonical: FDraftThemeFile,
): FDraftThemeFile {
  return canonical;
}
