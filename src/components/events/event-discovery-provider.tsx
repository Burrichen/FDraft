"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import {
  getEventDiscovery,
  type EventDiscoveryResult,
} from "@/application/events/event-discovery";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { useAsyncData } from "@/hooks/use-async-data";

function createEmptyResult(): EventDiscoveryResult {
  return {
    statuses: [],
    eventVisualsEnabled: false,
    eventsEnabled: false,
    now: new Date(),
  };
}

interface EventDiscoveryContextValue {
  result: EventDiscoveryResult;
  isLoading: boolean;
  /** Re-runs the shared discovery read — call after ANY mutation that could change participation, `EventSettings`, or the Admin date override, so every consumer (nav, the intro modal, an event's own page, Settings) reflects it immediately instead of only after a reload. */
  refresh: () => Promise<void>;
}

const EventDiscoveryContext = createContext<EventDiscoveryContextValue | null>(
  null,
);

/**
 * How often this re-checks with nothing else prompting it to — see
 * docs/updates, "EVENT LIFECYCLE REPAIR" §4: "when effective Event time
 * changes." An occurrence's natural window can open or close purely by
 * real time passing, with no mutation anywhere in the app to hang a
 * `refresh()` call off of (a profile could simply leave the app open
 * across 30 September 19:00) — a periodic re-check is the simplest
 * reliable way to notice that. Every mutating action ALSO calls
 * `refresh()` directly (join, decline, leave, changing the Admin date
 * override), so this interval is a safety net, not the only path — a
 * user who takes any of those actions sees the result immediately, not
 * after waiting for the next tick.
 */
const REFRESH_INTERVAL_MS = 60_000;

/**
 * THE Global Event Discovery Controller (see docs/updates, "EVENT
 * LIFECYCLE REPAIR" §4) — the ONE place `getEventDiscovery` is read from
 * for the active profile, shared by every consumer via context instead of
 * each doing its own independent `useAsyncData` fetch. That duplication —
 * `use-nav-items.ts`, `EventIntroDialog`, `EventSwitcherSection`, and
 * `HalloweenPageClient` each maintaining their OWN uncoordinated snapshot
 * of `EventSettings` — was the actual root cause of the pre-existing "join
 * Halloween, but the nav tab doesn't appear until you reload" bug: the nav
 * bar is mounted once, above `{children}`, and never remounts on
 * navigation, so its own separate fetch had no way to learn a join that
 * happened elsewhere had occurred. Every consumer now reads from this one
 * shared snapshot and calls `refresh()` after any mutation, so they can
 * never disagree with each other.
 *
 * Mounted in `AppShell`, keyed by profile id (see `AppShellContent`) —
 * switching profiles starts a completely fresh discovery load, the same
 * convention `WatchUndoProvider`/`EventIntroDialog` already use.
 */
export function EventDiscoveryProvider({ children }: { children: ReactNode }) {
  const { activeProfile, repositories } = useProfileContext();
  const profileId = activeProfile?.id ?? null;
  const timezone = activeProfile?.timezone ?? null;

  const { data, reloadSilently } = useAsyncData(async () => {
    if (!profileId || !timezone) return createEmptyResult();
    return getEventDiscovery(repositories, { profileId, timezone });
  }, [profileId, timezone, repositories]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void reloadSilently();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [reloadSilently]);

  return (
    <EventDiscoveryContext.Provider
      value={{
        result: data ?? createEmptyResult(),
        isLoading: data === undefined,
        refresh: reloadSilently,
      }}
    >
      {children}
    </EventDiscoveryContext.Provider>
  );
}

export function useEventDiscovery(): EventDiscoveryContextValue {
  const context = useContext(EventDiscoveryContext);
  if (!context) {
    throw new Error(
      "useEventDiscovery must be used within an EventDiscoveryProvider",
    );
  }
  return context;
}
