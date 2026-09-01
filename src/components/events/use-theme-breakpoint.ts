"use client";

import { useEffect, useState } from "react";
import type { FDraftThemeBreakpointId } from "@/domain/event-themes/fdraft-theme-schema";

/**
 * Resolves which of the three canonical `.fdraft-theme` breakpoint tiers
 * (see docs/updates, "EVENT STUDIO — PHASE 1" §3) the current viewport is
 * in, mapped onto this app's OWN already-existing Tailwind breakpoints
 * (`sm`=640px, `lg`=1024px — see `globals.css`'s Designed Slot doc
 * comment) rather than inventing new arbitrary pixel values: below `sm`
 * is `"mobile"`, `sm` to just under `lg` is `"tablet"`, `lg` and up is
 * `"desktop"`.
 *
 * No such viewport-tier hook existed anywhere in this codebase before
 * this file — every other breakpoint-driven decision here is pure CSS
 * (`hidden sm:block`, etc.). This one has to run in JS because a theme
 * layout is DATA (different placements per tier), not a CSS class
 * toggle.
 */
const TABLET_QUERY = "(min-width: 640px)";
const DESKTOP_QUERY = "(min-width: 1024px)";

/** `false` in any environment without a real `matchMedia` (SSR, or a test/jsdom environment that doesn't implement it) — treated as "can't tell, assume desktop" rather than throwing, the same safe-degrade convention this app's asset loading already follows. */
function hasMatchMedia(): boolean {
  return (
    typeof window !== "undefined" && typeof window.matchMedia === "function"
  );
}

function resolveBreakpoint(): FDraftThemeBreakpointId {
  if (!hasMatchMedia()) {
    return "desktop";
  }
  if (window.matchMedia(DESKTOP_QUERY).matches) {
    return "desktop";
  }
  if (window.matchMedia(TABLET_QUERY).matches) {
    return "tablet";
  }
  return "mobile";
}

export function useThemeBreakpoint(): FDraftThemeBreakpointId {
  const [breakpoint, setBreakpoint] =
    useState<FDraftThemeBreakpointId>(resolveBreakpoint);

  useEffect(() => {
    if (!hasMatchMedia()) {
      return;
    }
    const tablet = window.matchMedia(TABLET_QUERY);
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const update = () => setBreakpoint(resolveBreakpoint());
    update();
    tablet.addEventListener("change", update);
    desktop.addEventListener("change", update);
    return () => {
      tablet.removeEventListener("change", update);
      desktop.removeEventListener("change", update);
    };
  }, []);

  return breakpoint;
}
