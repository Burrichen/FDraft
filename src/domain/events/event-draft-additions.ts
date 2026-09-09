import { getEventDefinition } from "./event-registry";

export type EventDraftAdditionRefusal =
  "event_not_registered" | "event_disallows_additions";

export interface EventDraftAdditionPolicy {
  /** Whether films may be added to this Event's own Draft after creation. */
  addEnabled: boolean;
  /** Why not, when `addEnabled` is false. `null` when it is true. */
  refusal: EventDraftAdditionRefusal | null;
}

/**
 * Whether an Event's Draft accepts films added after creation — the "is
 * adding enabled for this Event?" question the Living Drafts mutation
 * layer needs to be able to ask (see docs/updates, "FDRAFT v1.2.1 —
 * LIVING DRAFTS" §9).
 *
 * Data-driven off the `EventDefinition`, with NO event id in the logic, so
 * this stays out of the generic Draft mutation layer's way and no UI
 * concern leaks into it:
 *  - an explicit `allowsDraftAdditions: false` disables additions;
 *  - a `singleFilmDraft` Event disables them by construction — its whole
 *    mechanic is "one join, one roll" (January), so accepting a second
 *    film would contradict the Event itself. This is why January needs no
 *    special case: it is already disabled by what it declares.
 *
 * A NORMAL (non-Event) Draft never reaches this at all — pass
 * `sourceEventId: null` and additions are simply allowed.
 */
export function resolveEventDraftAdditionPolicy(
  sourceEventId: string | null,
): EventDraftAdditionPolicy {
  if (sourceEventId === null) {
    return { addEnabled: true, refusal: null };
  }
  const event = getEventDefinition(sourceEventId);
  if (!event) {
    // An Event that is no longer registered: its Draft still renders from
    // persisted data, but nothing new may be added to it, because the
    // rules that would validate the addition no longer exist.
    return { addEnabled: false, refusal: "event_not_registered" };
  }
  if (event.allowsDraftAdditions === false || event.singleFilmDraft) {
    return { addEnabled: false, refusal: "event_disallows_additions" };
  }
  return { addEnabled: true, refusal: null };
}
