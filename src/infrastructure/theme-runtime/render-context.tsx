"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { DraftFilmCardView } from "@/components/drafts/draft-film-card";

/**
 * The typed, read-only host values FDraft's real component adapters
 * (`component-adapters.tsx`) read that AREN'T already available through
 * an existing app-wide context (`ProfileProvider`, `EventDiscoveryProvider`,
 * `WatchUndoProvider` — a real adapter is mounted inside all three, same
 * as any real event page, and reads them directly rather than duplicating
 * what they already provide).
 *
 * See docs/updates, "FDRAFT THEME RUNTIME — PROMPT 10": "The FDraft domain
 * layer remains authoritative. It passes a typed, read-only render
 * context into the renderer... Dynamic values such as film titles,
 * usernames, dates, counts, progress, and points remain typed host
 * values." This is that context — every field here is computed by
 * `buildFDraftThemeRenderContext` from real repository/domain calls, never
 * theme-authored, and nothing here lets a theme mutate FDraft state
 * (there is no setter in this value).
 */
export interface FDraftThemeRenderContextValue {
  eventId: string;
  /** Real, already-fetched film slots for the current draft — `[]` when there is no active draft. Never fetched by an adapter itself; see `film-grid`'s host note on why. */
  films: DraftFilmCardView[];
  /** `null` while unknown/unavailable (e.g. no active profile, or the event has no point currency) — an adapter renders its own safe fallback rather than guessing at a number. */
  pointsBalance: number | null;
  progressPercent: number;
  watchedCount: number;
  targetCount: number;
  /** Epoch ms for the event's next occurrence start, resolved through `getEffectiveEventDate` (respects the Admin Mode test-date override) — `null` when the event has no recurring window or none could be resolved. */
  countdownTargetAtMs: number | null;
}

const FDraftThemeRenderContext =
  createContext<FDraftThemeRenderContextValue | null>(null);

export function FDraftThemeRenderContextProvider({
  value,
  children,
}: {
  value: FDraftThemeRenderContextValue;
  children: ReactNode;
}) {
  return (
    <FDraftThemeRenderContext.Provider value={value}>
      {children}
    </FDraftThemeRenderContext.Provider>
  );
}

/**
 * Every real FDraft component adapter calls this — never
 * `useContext(FDraftThemeRenderContext)` directly — so a missing provider
 * fails loudly with a clear message instead of an adapter silently
 * rendering with `null`/undefined host data (see `theme-loader.ts`'s own
 * per-theme error-boundary isolation for what happens to that failure).
 */
export function useFDraftThemeRenderContext(): FDraftThemeRenderContextValue {
  const value = useContext(FDraftThemeRenderContext);
  if (!value) {
    throw new Error(
      "useFDraftThemeRenderContext: no FDraftThemeRenderContextProvider found — a real component adapter must be mounted inside one.",
    );
  }
  return value;
}
