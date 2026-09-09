import { getEventCategoryFilmIds } from "@/domain/events/event-category-manifest-overlay";
import {
  resolveEventDraftAdditionPolicy,
  type EventDraftAdditionRefusal,
} from "@/domain/events/event-draft-additions";
import {
  resolveEligibleCandidates,
  type EligibilityCandidate,
} from "@/domain/events/event-eligibility";
import { getEventDefinition } from "@/domain/events/event-registry";
import type { DraftRecord } from "@/repositories/records";

export type EventDraftFilmAdditionRefusal =
  EventDraftAdditionRefusal | "film_not_eligible_for_event";

export interface EventDraftFilmAddition {
  allowed: boolean;
  refusal: EventDraftFilmAdditionRefusal | null;
}

/**
 * Whether a specific film may be manually added to a specific Event's
 * Draft — the whole of the Event side of "Add to Draft" (see docs/updates,
 * "FDRAFT v1.2.1 — LIVING DRAFTS" Part 3 §4/§7/§8/§9).
 *
 * Two questions, in order, both answered from the Event's own definition
 * with no event id appearing in this logic:
 *
 *  1. **Does this Event accept manual additions at all?**
 *     `resolveEventDraftAdditionPolicy` reads that off the definition, so
 *     January — whose whole mechanic is one rolled film
 *     (`singleFilmDraft`) — is disabled by what it declares rather than by
 *     a special case, and any future Event can opt out with
 *     `allowsDraftAdditions: false`.
 *
 *  2. **Is this film inside the Event's own boundary?** Evaluated through
 *     `resolveEligibleCandidates`, the SAME engine that narrows the
 *     candidate pool when the Event generates a Draft — so an Event's
 *     eligibility is defined in exactly one place and a manual add can
 *     never disagree with what generation would have allowed. Membership
 *     in one of the Event's curated content pools counts too, additively,
 *     exactly as `EventEligibilityRules.curatedFilmIds` already does.
 *
 * That boundary is the one thing explicit manual selection may NOT
 * override (§7). FDraft's own generation PREFERENCES — the franchise/
 * sequel rule above all — are overridden as usual, because the caller
 * validates the film against the manual pool (`getDiyEligibleFilms`),
 * never the random-generation filters. So a sequel the engine would refuse
 * to roll can be added to a Halloween Draft; a film Halloween itself
 * doesn't accept cannot.
 *
 * Curated pool ids come from the same module-level overlay every other
 * Event surface reads (`getEventCategoryFilmIds`, populated at app start),
 * so a caller cannot forget to resolve them. An Event with permissive
 * rules and an unresolved pool still behaves correctly: its rules already
 * accept the film, and the pool is only ever an additional way in.
 */
export function resolveEventDraftFilmAddition(params: {
  draft: Pick<DraftRecord, "sourceEventId">;
  /**
   * The film, in the shape the Event eligibility engine already consumes —
   * satisfied directly by a `getDiyEligibleFilms` view, which is where a
   * manual add's candidate comes from either way.
   */
  film: EligibilityCandidate;
}): EventDraftFilmAddition {
  const policy = resolveEventDraftAdditionPolicy(params.draft.sourceEventId);
  if (!policy.addEnabled) {
    return { allowed: false, refusal: policy.refusal };
  }

  const sourceEventId = params.draft.sourceEventId;
  if (sourceEventId === null) {
    // A normal Draft has no Event boundary — eligibility there is the
    // ordinary manual-selection question, answered by the caller.
    return { allowed: true, refusal: null };
  }

  // `addEnabled` already established the Event is registered.
  const event = getEventDefinition(sourceEventId)!;
  const passesEventRules =
    resolveEligibleCandidates([params.film], event.eligibilityRules).length > 0;
  const isCuratedPoolFilm = Object.values(
    getEventCategoryFilmIds(sourceEventId),
  )
    .flat()
    .includes(params.film.filmId);

  return passesEventRules || isCuratedPoolFilm
    ? { allowed: true, refusal: null }
    : { allowed: false, refusal: "film_not_eligible_for_event" };
}
