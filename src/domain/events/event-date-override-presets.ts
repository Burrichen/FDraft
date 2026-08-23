import {
  F_YOU_ITS_JANUARY_EVENT_ID,
  HALLOWEEN_EVENT_ID,
} from "./event-registry";

/**
 * A safe, representative wall-clock moment (in whatever timezone the
 * caller resolves it against — see `event-testing-section.tsx`) comfortably
 * inside a given event's natural `availability` window — see docs/updates,
 * "PROMPT 17 — ADMIN MODE + TEMPORARY EVENT TEST SWITCHER". Deliberately
 * plain wall-clock components (never a pre-built `Date`/ISO string) so the
 * UI can convert it into the active profile's own timezone at the moment
 * it's selected, rather than baking in an assumption about which timezone
 * "20:00" means.
 */
export interface EventDateOverridePreset {
  eventId: string;
  label: string;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
}

/**
 * Only the two events with an actual natural window worth demonstrating
 * today — see `event-registry.ts` for why Halloween now has one (a
 * temporary, one-off fixed window, not yet the real/permanent design).
 * The Watchlist Frontier and Signal from Beyond still have no window at
 * all, so there's nothing for a preset to safely land inside yet.
 */
export const EVENT_DATE_OVERRIDE_PRESETS: EventDateOverridePreset[] = [
  {
    eventId: F_YOU_ITS_JANUARY_EVENT_ID,
    label: "F* You, It's January!",
    month: 1,
    day: 28,
    hour: 20,
    minute: 0,
  },
  {
    eventId: HALLOWEEN_EVENT_ID,
    label: "Halloween",
    month: 10,
    day: 15,
    hour: 20,
    minute: 0,
  },
];
