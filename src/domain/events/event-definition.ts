/**
 * The shape a real event will eventually be described by (see
 * docs/product-spec.md, event system Phase 2: "one engine instead of
 * hardcoding January/Sci-Fi/Western logic throughout the app"). No real
 * event exists yet — see `event-registry.ts`, currently empty — this file
 * only carves out the shape so a later phase can add real entries without
 * having to design the surrounding plumbing at the same time.
 */

/**
 * When an event is naturally available, independent of anyone manually
 * enabling it. `startsAt`/`endsAt` both `null` means "no fixed window" —
 * an event that can only ever be turned on via `manualActivationAllowed`.
 */
export interface EventAvailability {
  /** ISO 8601, or `null` for no fixed start. */
  startsAt: string | null;
  /** ISO 8601, or `null` for no fixed end. */
  endsAt: string | null;
}

/**
 * Real drafting-rule content (film count overrides, forced challenges,
 * generation logic, etc.) doesn't exist yet for any event — deliberately
 * left as an unshaped bag rather than designed now. The first real event
 * to need one replaces this with whatever shape it actually needs.
 */
export type EventDraftRules = Record<string, unknown>;

/**
 * Same placeholder status as `EventDraftRules` — real eligibility (genre
 * checks, custom whitelists, etc.) ships with the first real event that
 * needs it.
 */
export type EventEligibilityRules = Record<string, unknown>;

export interface EventDefinition {
  id: string;
  name: string;
  availability: EventAvailability;
  draftRules: EventDraftRules;
  eligibilityRules: EventEligibilityRules;
  /** This event's own permanent currency identifier, or `null` if it only ever awards generic/Lifetime Points. */
  pointType: string | null;
  /** Identifier for a visual theme a later phase will define and apply — `null` for no theme. */
  visualTheme: string | null;
  /** Whether a profile can opt into this event manually via `EventSettings.manuallyEnabledEvents`, independent of `availability`. */
  manualActivationAllowed: boolean;
}
