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
  /**
   * This event's OWN currency balance (e.g. Halloween's "haunted" points,
   * January's "misery" points) — `null` while unknown/unavailable (no
   * active profile, or the event declares no `pointType` of its own). Read
   * by `event-points-counter`, never `points-counter` — see
   * `lifetimePointsBalance` for the generic/overall balance that key
   * actually needs.
   */
  pointsBalance: number | null;
  /** The profile's real overall/Lifetime Points balance (`PointCurrency: "lifetime"`), independent of any one event — read by `points-counter`. `null` only while unknown (no active profile). */
  lifetimePointsBalance: number | null;
  progressPercent: number;
  watchedCount: number;
  targetCount: number;
  /** Epoch ms for the event's next occurrence start, resolved through `getEffectiveEventDate` (respects the Admin Mode test-date override) — `null` when the event has no recurring window or none could be resolved. */
  countdownTargetAtMs: number | null;
  /** Whether `event.availability`'s natural window is open right now (Admin-Mode-aware) — see `isEventAvailable`. Read-only presentation input; never itself a join/eligibility decision. */
  eventAvailable: boolean;
  /** Whether this event is "live" for the user right now — naturally available, OR manually kept active for an event that allows it (`EventDefinition.manualActivationAllowed`) — mirrors `EventOccurrenceStatus.available || manuallyEnabled`, the same combined flag `resolveVisibleEventPages` itself uses to decide whether an event's nav/page should still show. */
  eventActive: boolean;
  /** Whether the profile has actually joined this event (`EventOccurrenceStatus.participation === "joined"`) — never itself a mutation, only a read of the profile's already-recorded response. */
  optedIn: boolean;
  /** Whether the current draft actually has picks in it (`films.length > 0`) — a theme reads this to distinguish "nothing started yet" from "a draft exists," never to decide draft-generation eligibility itself (that stays fully FDraft-owned). */
  draftGenerated: boolean;
  /** Whether the profile has finished every pick in the current draft (`watchedCount > 0 && watchedCount >= targetCount`) — derived from the same real progress numbers `event-progress`/`draft-progress` already display, never a second source of truth. */
  eventCompleted: boolean;
  /**
   * One of `"available"` (window open, not yet joined), `"active"`
   * (window open and joined, or manually kept active), `"ended"` (window
   * closed after having been joined/active), or `undefined` (no
   * meaningful phase — e.g. never joined and not currently available).
   * This is FDraft's own fixed, documented phase vocabulary for the
   * `RenderState.eventPhase`/`eventStatus` runtime variable a Behaviour
   * rule's `eventPhase` condition compares against — a theme author must
   * write conditions against exactly these three strings.
   */
  eventPhase: "available" | "active" | "ended" | undefined;
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
