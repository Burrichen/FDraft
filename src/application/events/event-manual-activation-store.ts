import type { SettingsRepository } from "@/repositories/settings-repository";

const MANUAL_ACTIVATION_ENDS_KEY = "events.manualActivationEnds";

/**
 * Event id -> the ISO instant that manual activation of that event runs
 * until: the end of the event's next natural occurrence at the moment it
 * was manually activated (see `resolveUpcomingOccurrenceEnd`).
 *
 * Exists so a MANUALLY activated event can eventually end (see
 * docs/updates, "FDRAFT UPDATE 1 — JANUARY / HALLOWEEN / CHRISTMAS
 * REGRESSION"). Before this, `isOccurrenceExpired` excluded manual
 * activations outright, which was the only way to preserve the deliberate
 * "a mid-year opt-in stays active the rest of the year" feature — an
 * activation keyed to an occurrence whose window had ALREADY closed would
 * otherwise have read as expired the instant it was created. The cost was
 * that a manually activated event never reached its Event-over
 * experience at all, and (for `manualActivationAllowed` events) kept its
 * page indefinitely with nothing to conclude it.
 *
 * Recording the activation's own target instant resolves both: the event
 * stays active until that instant, then expires normally and its ending
 * shows once, exactly like a natural join's.
 *
 * A deliberate SIBLING settings key, matching the convention
 * `event-ending-acknowledgement-store.ts` and
 * `event-ending-stinger-store.ts` already established — never a widened
 * value on an existing key, whose validated shapes would drop every
 * profile's history on the next read. Round-trips through backup/restore
 * automatically like every other key in the generic settings table.
 *
 * An event with NO recorded entry (every profile that manually activated
 * on an earlier build) is treated as "not ended", preserving the exact
 * pre-existing behaviour for existing data rather than retroactively
 * expiring it.
 */
export interface EventManualActivation {
  /** ISO instant this activation runs until — the end of the event's next natural occurrence at the moment it was activated. */
  endsAt: string;
  /**
   * The occurrence key this activation was joined under (e.g.
   * `f-you-its-january:2027`).
   *
   * Recorded because occurrence keys are derived from the CALENDAR YEAR of
   * whatever instant you ask about (see `getAvailabilityCycleId`), while a
   * manual activation routinely runs past a year boundary — a June 2027
   * January opt-in runs to 1 February 2028. Without pinning the key, the
   * moment the year ticked over the app would compute a brand-new,
   * unanswered `january:2028` occurrence and lose track of the activation
   * entirely: the Event page would vanish mid-run, and the ending could
   * never fire because nothing was recorded as `"joined"` any more. See
   * `resolvePinnedManualOccurrenceKey`.
   */
  occurrenceKey: string;
}

export type EventManualActivations = Record<string, EventManualActivation>;

function resolveManualActivations(value: unknown): EventManualActivations {
  if (typeof value !== "object" || value === null) {
    return {};
  }
  const raw = value as Record<string, unknown>;
  const result: EventManualActivations = {};
  for (const [eventId, entry] of Object.entries(raw)) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const { endsAt, occurrenceKey } = entry as Record<string, unknown>;
    if (
      typeof endsAt === "string" &&
      !Number.isNaN(Date.parse(endsAt)) &&
      typeof occurrenceKey === "string" &&
      occurrenceKey.length > 0
    ) {
      result[eventId] = { endsAt, occurrenceKey };
    }
  }
  return result;
}

export async function getEventManualActivations(
  repos: { settings: SettingsRepository },
  profileId: string,
): Promise<EventManualActivations> {
  const stored = await repos.settings.get<EventManualActivations>(
    profileId,
    MANUAL_ACTIVATION_ENDS_KEY,
  );
  return resolveManualActivations(stored);
}

/**
 * Records when this profile's manual activation of `eventId` runs until.
 * Called only from `beginEventOptIn`, and only for an activation that is
 * genuinely manual — a natural join records nothing here, so its own
 * window remains the only thing that concludes it.
 */
export async function setEventManualActivation(
  repos: { settings: SettingsRepository },
  params: {
    profileId: string;
    eventId: string;
    endsAt: Date;
    occurrenceKey: string;
  },
): Promise<void> {
  const current = await getEventManualActivations(repos, params.profileId);
  await repos.settings.set(params.profileId, MANUAL_ACTIVATION_ENDS_KEY, {
    ...current,
    [params.eventId]: {
      endsAt: params.endsAt.toISOString(),
      occurrenceKey: params.occurrenceKey,
    },
  });
}

/**
 * Whether a manual activation of this event has run its course as of
 * `now`. `false` when nothing is recorded — see this module's own doc
 * comment on why a missing entry deliberately means "still running".
 */
export function hasManualActivationEnded(
  activations: EventManualActivations,
  eventId: string,
  now: Date,
): boolean {
  const activation = activations[eventId];
  if (!activation) {
    return false;
  }
  return now.getTime() >= Date.parse(activation.endsAt);
}

/**
 * The occurrence key a manual activation should be evaluated against
 * instead of the one `now`'s calendar year implies, or `null` to use the
 * normal derived key.
 *
 * Pinned only while BOTH:
 *  - the event is not currently naturally available (a live window always
 *    wins outright — a real season is never overridden by an older manual
 *    activation), and
 *  - the activation still has something outstanding: either it hasn't run
 *    out yet, or it has and its Event-over experience hasn't been
 *    acknowledged.
 *
 * That second condition is what makes the pin RELEASE rather than
 * shadowing this event forever: once the activation's ending has been
 * acknowledged there is nothing left to keep it pinned to, so a later
 * season's own occurrence is evaluated normally and gets its own ending.
 */
export function resolvePinnedManualOccurrenceKey(
  activations: EventManualActivations,
  eventId: string,
  params: {
    now: Date;
    available: boolean;
    isEndingAcknowledged: (occurrenceKey: string) => boolean;
  },
): string | null {
  const activation = activations[eventId];
  if (!activation || params.available) {
    return null;
  }
  const ended = params.now.getTime() >= Date.parse(activation.endsAt);
  if (ended && params.isEndingAcknowledged(activation.occurrenceKey)) {
    return null;
  }
  return activation.occurrenceKey;
}
