/**
 * The Event Test Switcher's persisted state (see docs/updates, "PROMPT 17
 * — ADMIN MODE + TEMPORARY EVENT TEST SWITCHER") — a small, profile-scoped
 * preference living in the generic `SettingsRepository` (see
 * `event-date-override-store.ts`), the exact same mechanism `EventSettings`
 * already uses, not a field on `ProfileSettings`.
 *
 * This is TEMPORARY developer/testing infrastructure — it will eventually
 * be removed once the real event system no longer needs simulated-date
 * testing. Read/write access is gated behind Admin Mode everywhere this is
 * consumed (see `getEffectiveEventDate`), never here in the data shape
 * itself.
 */
export interface EventDateOverride {
  /** Whether the simulated date should actually be used right now. Selecting "Off" in the UI only ever clears this — `eventId`/`simulatedDate` are left as they were, so switching back on (or turning Admin Mode back on after it was off) restores exactly the same simulated moment. */
  enabled: boolean;
  /** Which preset this simulated date is based on, purely so the UI can show the right label — never consulted by `getEffectiveEventDate` itself, which only ever cares about `simulatedDate`. */
  eventId: string | null;
  /** ISO 8601 instant to report as "now" for event-availability purposes only. */
  simulatedDate: string | null;
}

/** Off, with nothing configured — what every profile has always effectively been before this feature existed. */
export const DEFAULT_EVENT_DATE_OVERRIDE: EventDateOverride = {
  enabled: false,
  eventId: null,
  simulatedDate: null,
};

/**
 * Normalizes a possibly-missing, partial, or corrupted persisted value —
 * `null` (nothing saved yet) defaults cleanly, and each field falls back
 * independently rather than discarding the whole object over one bad
 * field. Mirrors `resolveEventSettings`'s exact shape.
 */
export function resolveEventDateOverride(value: unknown): EventDateOverride {
  if (typeof value !== "object" || value === null) {
    return { ...DEFAULT_EVENT_DATE_OVERRIDE };
  }
  const raw = value as Partial<EventDateOverride>;
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : false,
    eventId: typeof raw.eventId === "string" ? raw.eventId : null,
    simulatedDate:
      typeof raw.simulatedDate === "string" ? raw.simulatedDate : null,
  };
}
