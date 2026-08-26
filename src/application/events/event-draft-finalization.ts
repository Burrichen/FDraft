import { expireLocalDraftIfDue } from "@/application/drafts/local-draft-service";
import { getEffectiveEventDate } from "@/application/events/event-clock";
import { FixedClock, type Clock } from "@/domain/time/clock";
import type { DraftRepository } from "@/repositories/draft-repository";
import type { ProfileRepository } from "@/repositories/profile-repository";
import type { SettingsRepository } from "@/repositories/settings-repository";

/**
 * Safely finalises an Event-sourced Draft once its Event's occurrence has
 * closed (see docs/updates, "EVENT SYSTEM — EVENT-OVER EXPERIENCE" §5) —
 * called from the SAME global flow that surfaces the Event-ending
 * experience (`EventEndingDialog`), so a profile who never revisits the
 * Event's own page still gets their Draft transitioned promptly, not just
 * lazily whenever they next happen to load it (`DraftLifecycleView`
 * already does that same lazy check on its own, so this is additive, not
 * a replacement).
 *
 * Deliberately reuses `expireLocalDraftIfDue`'s ACTIVE -> EXPIRED
 * transition rather than inventing a second one: a `fixedEventDeadline`
 * event's own Draft already has its `deadlineAt` set to that SAME
 * occurrence's own end (see `createHalloweenLocalDraft`'s
 * `getCurrentOccurrenceBounds` call) — "the Draft's deadline has passed"
 * and "the Event's occurrence has closed" are the same instant for this
 * kind of Draft. `"active" -> "expired"` never deletes anything (watched
 * films, unwatched films, source categories, occurrence association, and
 * every already-earned currency balance are all untouched — only
 * `DraftRecord.status`/`updatedAt` change) and, since
 * `completeMatchingActiveDraftItem`/`markLocalDraftItemWatchedWithoutEntry`
 * only ever match items belonging to a Draft returned by
 * `listActiveDrafts` (`status === "active"`), an expired Draft's items can
 * never earn further Event currency afterward — satisfied entirely by
 * this one status transition, no separate guard needed.
 *
 * UNLIKE `DraftLifecycleView`'s own lazy `expireLocalDraftIfDue` call
 * (real wall clock only, matching a normal Draft's real deadline — see
 * that call site's own precedent), this resolves "now" through the
 * Admin-aware `getEffectiveEventDate` by default — the SAME "now"
 * `getEventDiscovery`/`isOccurrenceExpired` just used to decide the
 * occurrence itself had closed. Using the real wall clock here instead
 * would let discovery say "expired" while this said "not yet," the exact
 * kind of disagreeing-state-sources bug this event system has already had
 * to fix once (see docs/updates, "EVENT LIFECYCLE REPAIR") — and would
 * make the Admin EventClock testing flow this exists for impossible to
 * actually test without waiting for the real calendar date. `deps.clock`
 * remains a plain override for direct unit testing.
 *
 * Entirely generic — `eventId` is only ever used to scope which Draft to
 * look up (`DraftRepository.getActiveOrExpiredDraft`'s existing
 * `sourceEventId` parameter); nothing here branches on which event it is.
 */
export async function finalizeExpiredEventDraftIfNeeded(
  repos: {
    drafts: DraftRepository;
    settings: SettingsRepository;
    profiles: ProfileRepository;
  },
  params: { profileId: string; eventId: string },
  deps: { clock?: Clock } = {},
): Promise<boolean> {
  const draft = await repos.drafts.getActiveOrExpiredDraft(
    params.profileId,
    params.eventId,
  );
  if (!draft || draft.status !== "active") {
    return false;
  }
  const effectiveNow = deps.clock
    ? deps.clock.now()
    : await getEffectiveEventDate(repos, params.profileId);
  return expireLocalDraftIfDue(
    repos,
    { profileId: params.profileId, draftId: draft.id },
    { clock: new FixedClock(effectiveNow) },
  );
}
