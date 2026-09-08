import { getEventDefinition } from "@/domain/events/event-registry";
import type { DraftItemSource } from "@/repositories/records";

/**
 * The single source of truth for "can this draft slot be manually replaced
 * or rerolled?" (see docs/updates, v1.1.3 "Editable random draft slots").
 * Every caller — the Draft page (to decide whether to render the pen/reroll
 * icons) and `replaceDraftSlot` itself (the actual mutation) — calls this
 * exact function rather than re-deriving the rule, so the truth table below
 * lives in exactly one place:
 *
 * | Slot source | Draft is event-owned | Admin Mode | Editable? |
 * |---|---|---|---|
 * | random    | no  | any   | yes |
 * | random    | yes | off   | no  |
 * | random    | yes | on    | yes |
 * | challenge | any | any   | no  |
 * | manual    | any | any   | no  |
 *
 * ONE exception overrides the whole table: a draft owned by a
 * `EventDefinition.singleFilmDraft` event (January) is NEVER editable, not
 * even under Admin Mode. That Event's entire mechanic is "one join, one
 * roll — you get what January gives you" (see docs/updates, "FDRAFT
 * UPDATE 1 — F* YOU, IT'S JANUARY: SIMPLE EVENT MECHANICS" §6, "Do NOT
 * add a new user-facing reroll feature"), and the pen/reroll slot icons
 * were the one pair of controls in the app that could quietly defeat it.
 * Enforced HERE rather than in the page so `replaceDraftSlot`'s own
 * mutation guard is covered by the same rule, not just the icons.
 *
 * `draftSourceEventId` is `DraftRecord.sourceEventId` — deliberately the
 * per-draft, persisted-at-creation-time value, not the profile's current
 * (mutable) `EventSettings`. A draft born under an event stays locked from
 * normal editing for its whole life, independent of whether Events later
 * get toggled off — the same "persisted activation context, not current
 * settings" principle `resolveDraftCompletionReward` already follows.
 */
export function canEditDraftSlot(params: {
  itemSource: DraftItemSource;
  draftSourceEventId: string | null;
  adminModeEnabled: boolean;
}): boolean {
  if (params.itemSource !== "random") {
    return false;
  }
  if (params.draftSourceEventId === null) {
    return true;
  }
  if (getEventDefinition(params.draftSourceEventId)?.singleFilmDraft) {
    return false;
  }
  return params.adminModeEnabled;
}
