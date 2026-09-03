"use client";

import { Component, type ReactNode } from "react";

interface ThemeBoundaryProps {
  /** The themed content — typically `<ThemeRenderer>` plus its providers. */
  children: ReactNode;
  /** Normal FDraft's own existing interface — rendered instead the moment anything themed fails. */
  fallback: ReactNode;
  onError?: (error: Error) => void;
}

interface ThemeBoundaryState {
  hasError: boolean;
}

/**
 * The outermost safety net for FDraft's theme runtime (see docs/updates,
 * "FDRAFT THEME RUNTIME — PROMPT 10", "A theme failure must be isolated
 * at theme/page/layer boundaries as appropriate"). `@fdraft/theme-renderer`
 * already isolates failures per-layer/per-page internally
 * (`RenderErrorBoundary`) — this is the OUTER boundary around the whole
 * themed subtree, catching anything that gets past that (a bad master
 * chain, a completely malformed document that slips past validation, an
 * adapter itself throwing) and falling back to normal FDraft's existing,
 * always-safe interface instead of a blank page or a crashed app.
 *
 * A plain class component — React error boundaries have no hook
 * equivalent. `getDerivedStateFromError` flips the fallback on
 * synchronously during render, before the browser ever paints the
 * broken subtree.
 */
export class ThemeBoundary extends Component<
  ThemeBoundaryProps,
  ThemeBoundaryState
> {
  state: ThemeBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ThemeBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error);
    if (process.env.NODE_ENV !== "production") {
      console.error(
        "[FDraft theme runtime] a theme failed during render — falling back to normal FDraft:",
        error,
      );
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
