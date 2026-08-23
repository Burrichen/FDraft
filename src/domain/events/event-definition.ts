import type { PointCurrency } from "./point-currency";

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
 * enabling it — see `isEventAvailable()` (`event-availability.ts`), the
 * one generic function that reads this shape. Three mutually-exclusive
 * styles, all always present so that function never has to guess which
 * one a given definition uses, checked in this priority order:
 *  - `recurringMonthDayRange`, for an event naturally available during the
 *    same slice of a calendar month every year (e.g. 25–31 January) —
 *    finer-grained than `recurringMonths` below, for an event whose window
 *    is part of a month rather than the whole thing;
 *  - `recurringMonths`, for an event naturally available during the same
 *    whole calendar month(s) every year, indefinitely (e.g. a summer-long
 *    event sets `[6, 7, 8]`); or
 *  - a fixed one-off window (`startsAt`/`endsAt`).
 * All evaluated in the profile's own timezone, the same convention
 * deadlines/watched-dates already use. All fields `null`/absent means "no
 * natural window at all" — an event that can only ever be turned on via
 * `manualActivationAllowed`.
 */
export interface EventAvailability {
  /** ISO 8601, or `null` for no fixed start. */
  startsAt: string | null;
  /** ISO 8601, or `null` for no fixed end. */
  endsAt: string | null;
  /** 1–12 (January = 1), or `null` for a fixed `startsAt`/`endsAt` window (or no natural window) instead. */
  recurringMonths: number[] | null;
  /**
   * An annually-recurring window within a calendar month (e.g.
   * `{ startMonth: 1, startDay: 25, endMonth: 1, endDay: 31 }` for 25–31
   * January every year) — `null` when this event doesn't use this finer
   * granularity. Only supports a range that stays within a single
   * calendar year in chronological (start ≤ end) order; a range that
   * wraps across a year boundary (e.g. late December into early January)
   * isn't handled by `isEventAvailable`/`getAvailabilityCycleId` today —
   * no currently-registered event needs one.
   *
   * `startHour`/`startMinute`/`endHour`/`endMinute` are optional
   * time-of-day precision on top of the day range (e.g. Halloween's
   * "30 September 19:00 through 1 November 00:00") — all four default to
   * day-boundary when absent (`startHour`/`startMinute` default to 0,
   * `endHour`/`endMinute` default to end-of-day), which is exactly what
   * reproduces today's whole-day-inclusive behaviour for an event like
   * January that never sets them. The start boundary is inclusive; the
   * end boundary (whichever of day-only or day+time it resolves to) is
   * exclusive — see `isWithinMonthDayRange`.
   */
  recurringMonthDayRange: {
    startMonth: number;
    startDay: number;
    startHour?: number;
    startMinute?: number;
    endMonth: number;
    endDay: number;
    endHour?: number;
    endMinute?: number;
  } | null;
}

/**
 * Real drafting-rule content (film count overrides, forced challenges,
 * generation logic, etc.) doesn't exist yet for any event — deliberately
 * left as an unshaped bag rather than designed now. The first real event
 * to need one replaces this with whatever shape it actually needs.
 */
export type EventDraftRules = Record<string, unknown>;

/**
 * Which of an event's normally-eligible drafting candidates actually
 * qualify for it — the shape `resolveEligibleCandidates()`
 * (`event-eligibility.ts`) reads (see docs/product-spec.md, event system
 * Phase 6: the Halloween event). Both fields optional/nullable, and
 * additive with each other, not exclusive — a candidate matching EITHER
 * one qualifies. Both absent/empty (e.g. `{}`, like the January event)
 * means no restriction at all: every normally-eligible FDraft candidate
 * stays eligible, unchanged — this is deliberately the safe default for
 * an event whose real curated content hasn't been defined yet, rather
 * than fabricating one.
 */
export interface EventEligibilityRules {
  /** Canonical genre strings (matched case-insensitively against a candidate's own `genres`) that make it eligible on their own. `null`/empty/absent means no genre restriction. */
  requiredGenres?: string[] | null;
  /** Canonical film ids that are eligible regardless of genre metadata — for a specific curated list. `null`/empty/absent means no curated list is defined yet. */
  curatedFilmIds?: string[] | null;
  /**
   * A community/external average-rating ceiling (inclusive) that makes a
   * candidate eligible on its own, regardless of genre/curated status —
   * e.g. `3.5` for "3.5 or lower qualifies" (see docs/updates, "JANUARY
   * ELIGIBILITY RULES"). A candidate with no average rating at all never
   * qualifies through this path — only a real rating at or under the
   * ceiling does; it may still qualify through `curatedFilmIds` instead.
   * `null`/absent means no rating-based restriction.
   */
  maxAverageRating?: number | null;
}

/**
 * The content the generic event introduction modal renders for this event
 * (see docs/product-spec.md, event system Phase 6) — no per-event modal
 * component exists; every event supplies the same shape and the one
 * generic `EventIntroDialog` renders whichever event is eligible.
 */
export interface EventIntroContent {
  /** Body copy shown beneath the event's name — what opting in means. */
  description: string;
  /** Short, concrete list of what this event changes or offers — rendered as bullet points. */
  bullets: string[];
  /** Overrides the modal's default "Opt In" label — for an event that needs its own exact join copy (see docs/updates, "PROMPT 18 — EVENT PAGES + HALLOWEEN LIFECYCLE"). Absent means "Opt In". */
  primaryActionLabel?: string;
  /** Overrides the modal's default "Nah" label. Absent means "Nah". */
  secondaryActionLabel?: string;
}

/**
 * A dedicated, temporary FDraft page an event can expose (see
 * docs/updates, "PROMPT 18 — EVENT PAGES + HALLOWEEN LIFECYCLE") — pure
 * data, no React here, so this file keeps its "no React" rule; the actual
 * icon component is resolved separately by the components layer (see
 * `src/components/layout/use-nav-items.ts`), the same split `visualTheme`
 * (a plain id, resolved to a component in `event-visual-themes.ts`)
 * already uses.
 */
export interface EventPageContent {
  /** e.g. "/events/halloween" — must be a plain, non-dynamic static route. */
  route: string;
  /** Short label for the nav tab, e.g. "Halloween". */
  navLabel: string;
}

export interface EventDefinition {
  id: string;
  name: string;
  availability: EventAvailability;
  draftRules: EventDraftRules;
  eligibilityRules: EventEligibilityRules;
  intro: EventIntroContent;
  /** This event's own permanent currency, or `null` if it only ever awards generic/Lifetime Points (see the event system's CRITICAL RULE, enforced centrally by `awardDraftCompletionReward`, not here). */
  pointType: PointCurrency | null;
  /** Identifier for a visual theme a later phase will define and apply — `null` for no theme. */
  visualTheme: string | null;
  /** Whether a profile can opt into this event manually via `EventSettings.manuallyEnabledEvents`, independent of `availability`. `false` for an event that must only ever be joined during its real (or Admin-simulated) natural window — see Halloween. */
  manualActivationAllowed: boolean;
  /** A dedicated temporary page for this event, or `null`/absent for none. */
  page?: EventPageContent | null;
  /** When true, opting into this event also force-enables `EventSettings.eventVisualsEnabled` — a genuinely opt-in-time default, not something the generic opt-in flow does for every event. Absent/false preserves today's behaviour (opt-in and visuals stay fully decoupled). */
  enableVisualsOnOptIn?: boolean;
  /**
   * When true, this event's own Draft has ONE fixed deadline — the end of
   * the event's current natural occurrence (via `getCurrentOccurrenceBounds`,
   * `event-availability.ts`) — rather than letting the profile choose
   * Calendar/Timer mode (see docs/updates, "PROMPT B2.2 — HALLOWEEN PAGE
   * REBUILD + DEADLINE + STATS" §3). Requires `availability.
   * recurringMonthDayRange` to be set (the only shape `getCurrentOccurrenceBounds`
   * supports). Absent/false preserves today's behaviour (normal Calendar/
   * Timer choice) — today only Halloween sets this.
   *
   * Also changes how that Draft's time-PROGRESS is displayed (see
   * `DraftLifecycleView`): instead of "elapsed since this draft's own
   * creation," it shows "elapsed through the event's whole natural
   * window" — a Draft created halfway through the event reads as roughly
   * 50% through, not 0%, and uses `getEffectiveEventDate` (so Admin's
   * simulated date drives it, exactly like every other event-availability
   * check) rather than the real wall clock. The Draft's own persisted
   * `startedAt`/`deadlineAt` timestamps are real and never touched by
   * this — only the progress-bar DISPLAY differs.
   */
  fixedEventDeadline?: boolean;
}
