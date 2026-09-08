import { expireLocalDraftIfDue } from "@/application/drafts/local-draft-service";
import { getEffectiveEventDate } from "@/application/events/event-clock";
import { getCurrentOccurrenceBounds } from "@/domain/events/event-availability";
import { getEventDefinition } from "@/domain/events/event-registry";
import { FixedClock, SystemClock, type Clock } from "@/domain/time/clock";
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
 * Reuses `expireLocalDraftIfDue`'s ACTIVE -> EXPIRED transition rather
 * than inventing a second one wherever possible. For a `fixedEventDeadline`
 * event whose Draft is created through that SAME event's own bespoke
 * service (Halloween, via `createHalloweenLocalDraft`'s
 * `getCurrentOccurrenceBounds` call), the Draft's own `deadlineAt` is
 * already pinned to the occurrence's real end, so "the Draft's deadline
 * has passed" and "the Event's occurrence has closed" are the same
 * instant and the plain `expireLocalDraftIfDue` check is sufficient.
 *
 * January (see docs/updates, "FDRAFT UPDATE 1 — JANUARY EVENT-OVER
 * EXPERIENCE" §7) is DIFFERENT: it also sets `fixedEventDeadline: true`,
 * but its Draft is created through the fully generic `createLocalDraft`
 * (there is no bespoke January draft-creation service — see
 * docs/updates, "PROMPT 18", scope note on why that path was
 * deliberately left unchanged), which was deliberately never taught
 * about `fixedEventDeadline` and still sets a normal profile-chosen
 * Calendar/Timer `deadlineAt`. So for ANY `fixedEventDeadline` event,
 * this recomputes the occurrence's real end independently — via
 * `getCurrentOccurrenceBounds` evaluated at the Draft's own `startedAt`
 * (reliably still inside the occurrence the Draft was created during,
 * unlike `effectiveNow` here, which is AFTER the occurrence closed by the
 * time this runs) — and finalises directly against THAT boundary instead
 * of trusting `draft.deadlineAt`. For Halloween this produces the exact
 * same result as before (its `deadlineAt` already equals this same
 * computed instant), so this is purely additive, not a behaviour change
 * for the event that already had one.
 *
 * `"active" -> "expired"` never deletes anything (watched films, unwatched
 * films, source categories, occurrence association, and every
 * already-earned currency balance are all untouched — only
 * `DraftRecord.status`/`updatedAt` change) and, since
 * `completeMatchingActiveDraftItem`/`markLocalDraftItemWatchedWithoutEntry`
 * only ever match items belonging to a Draft returned by
 * `listActiveDrafts` (`status === "active"`), an expired Draft's items can
 * never earn further Event currency afterward — satisfied entirely by
 * this one status transition, no separate guard needed.
 *
 * UNLIKE `DraftLifecycleView`'s own lazy `expireLocalDraftIfDue` call
 * (real wall clock only, matching a normal Draft's real deadline — see
 * that call site's own precedent), the EXPIRY DECISION here resolves "now"
 * through the Admin-aware `getEffectiveEventDate` by default — the SAME
 * "now" `getEventDiscovery`/`isOccurrenceExpired` just used to decide the
 * occurrence itself had closed. Using the real wall clock for that
 * decision instead would let discovery say "expired" while this said "not
 * yet," the exact kind of disagreeing-state-sources bug this event system
 * has already had to fix once (see docs/updates, "EVENT LIFECYCLE
 * REPAIR") — and would make the Admin EventClock testing flow this exists
 * for impossible to actually test without waiting for the real calendar
 * date. `deps.clock` remains a plain override for direct unit testing of
 * that decision.
 *
 * `DraftRecord.updatedAt` itself is a different matter (see docs/updates,
 * "FDRAFT UPDATE 1 — EVENT STATS/HISTORY/PERSISTENCE AUDIT" §17: "Admin
 * Event Testing must not corrupt historical real timestamps... unrelated
 * timestamps should remain governed by the established EventClock/real-
 * clock separation") — it's a general "last modified" audit field, not
 * itself a deadline/occurrence-year/availability calculation, so it's
 * stamped from `deps.realClock` (a genuinely separate real-time clock,
 * defaulting to `SystemClock`), never `effectiveNow` — consistent with
 * every OTHER write path in this app (`awardDraftCompletionReward`/
 * `awardEventDraftItemReward`/`DraftRecord.startedAt` at creation all use
 * a real clock for their own timestamps, reserving `effectiveNow`
 * strictly for deadline/occurrence-year math).
 *
 * Entirely generic — `eventId` is only ever used to scope which Draft to
 * look up (`DraftRepository.getActiveOrExpiredDraft`'s existing
 * `sourceEventId` parameter) and to read that event's own `EventDefinition`;
 * nothing here branches on WHICH event it is, only on its declared shape.
 */
export async function finalizeExpiredEventDraftIfNeeded(
  repos: {
    drafts: DraftRepository;
    settings: SettingsRepository;
    profiles: ProfileRepository;
  },
  params: { profileId: string; eventId: string },
  deps: { clock?: Clock; realClock?: Clock } = {},
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
  const realNow = (deps.realClock ?? new SystemClock()).now();

  const event = getEventDefinition(params.eventId);
  if (event?.fixedEventDeadline) {
    const occurrenceBounds = getCurrentOccurrenceBounds(
      event.availability,
      new Date(draft.startedAt),
      draft.timezone,
    );
    if (occurrenceBounds) {
      if (effectiveNow.getTime() < occurrenceBounds.end.getTime()) {
        return false;
      }
      await repos.drafts.updateDraft({
        ...draft,
        status: "expired",
        updatedAt: realNow.toISOString(),
      });
      return true;
    }
  }

  // Fallback for a hypothetical `ending.enabled` event with NO
  // `fixedEventDeadline` — unreachable today (every currently-registered
  // event with a real ending — January/Halloween/Christmas — also sets
  // `fixedEventDeadline: true`, so the branch above always handles them).
  // `expireLocalDraftIfDue` stamps `updatedAt` from whatever clock it's
  // given, so this still passes the Admin-aware `effectiveNow` through
  // (matching that function's OTHER real caller, `DraftLifecycleView`'s
  // lazy check, which always uses the real wall clock for both purposes
  // together) rather than threading a second real-clock parameter through
  // a much more widely-used function for a path nothing exercises yet.
  return expireLocalDraftIfDue(
    repos,
    { profileId: params.profileId, draftId: draft.id },
    { clock: new FixedClock(effectiveNow) },
  );
}
