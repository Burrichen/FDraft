/**
 * The Settings "Event Switcher" state (see docs/product-spec.md, event
 * system Phase 2) — a small, profile-scoped preference, exactly what
 * `SettingsRepository` exists for (see `src/repositories/settings-repository.ts`),
 * not a field on the core `LocalProfile` record.
 */
export interface EventSettings {
  /** Full event participation — special drafting rules, eligibility, scoring. Independent of `eventVisualsEnabled` by design. */
  eventsEnabled: boolean;
  /** Cosmetic event theming only — deliberately independent of `eventsEnabled`. */
  eventVisualsEnabled: boolean;
  /** The event id currently governing drafting, or `null` for none. Distinct from `manuallyEnabledEvents`: an event can become active via its own `availability` window without ever being manually enabled. */
  activeEvent: string | null;
  /** Event ids a profile has manually opted into (see `EventDefinition.manualActivationAllowed`). */
  manuallyEnabledEvents: string[];
}

/**
 * Off/empty in every field — this is what every existing profile has
 * always effectively been, so defaulting to this preserves current
 * behaviour exactly for anyone who never touches the Event Switcher.
 */
export const DEFAULT_EVENT_SETTINGS: EventSettings = {
  eventsEnabled: false,
  eventVisualsEnabled: false,
  activeEvent: null,
  manuallyEnabledEvents: [],
};

/**
 * Normalizes a possibly-missing, partial, or corrupted persisted value —
 * `null` (nothing saved yet, e.g. any profile that predates this feature)
 * defaults cleanly, and each field falls back independently rather than
 * discarding the whole object over one bad field.
 */
export function resolveEventSettings(value: unknown): EventSettings {
  if (typeof value !== "object" || value === null) {
    return { ...DEFAULT_EVENT_SETTINGS };
  }
  const raw = value as Partial<EventSettings>;
  return {
    eventsEnabled:
      typeof raw.eventsEnabled === "boolean"
        ? raw.eventsEnabled
        : DEFAULT_EVENT_SETTINGS.eventsEnabled,
    eventVisualsEnabled:
      typeof raw.eventVisualsEnabled === "boolean"
        ? raw.eventVisualsEnabled
        : DEFAULT_EVENT_SETTINGS.eventVisualsEnabled,
    activeEvent: typeof raw.activeEvent === "string" ? raw.activeEvent : null,
    manuallyEnabledEvents: Array.isArray(raw.manuallyEnabledEvents)
      ? raw.manuallyEnabledEvents.filter(
          (id): id is string => typeof id === "string",
        )
      : [],
  };
}
