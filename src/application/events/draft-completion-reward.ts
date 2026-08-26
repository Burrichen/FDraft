import { getEventSettings } from "@/application/events/event-settings-store";
import { getEventDefinition } from "@/domain/events/event-registry";
import { GENERIC_POINT_CURRENCY } from "@/domain/events/point-currency";
import { SystemClock, type Clock } from "@/domain/time/clock";
import type { DraftRepository } from "@/repositories/draft-repository";
import type { PointsRepository } from "@/repositories/points-repository";
import type {
  DraftItemRecord,
  DraftRecord,
  PointCurrency,
} from "@/repositories/records";
import type { SettingsRepository } from "@/repositories/settings-repository";

/**
 * Which event, if any, a draft's completion is being rewarded under — see
 * the event system's CRITICAL RULE: a MANUALLY enabled event may only ever
 * award generic/Lifetime Points, never its own unique currency. Omit this
 * entirely for a normal, non-event draft.
 */
export interface RewardEventContext {
  eventId: string;
  /** Whether the profile opted into this event manually (see `EventSettings.manuallyEnabledEvents`) rather than it being naturally active via its own `availability` window. */
  manuallyEnabled: boolean;
}

export interface DraftCompletionReward {
  /** The currency a normally-active event would award — ignored (downgraded to `GENERIC_POINT_CURRENCY`) whenever `eventContext.manuallyEnabled` is true. */
  currency: PointCurrency;
  amount: number;
  eventContext?: RewardEventContext;
}

/**
 * The manual-event downgrade rule itself, exposed standalone so it has
 * exactly one implementation (see the event system's CRITICAL RULE —
 * "enforce it centrally rather than trusting every caller to remember
 * it"). `awardDraftCompletionReward` is the primary caller, but ANY other
 * code that needs to know which currency a reward actually used/will use —
 * e.g. reversing a reward that a Watch Undo action is unwinding — must
 * call this too, rather than re-deriving `eventContext.manuallyEnabled ?
 * generic : currency` a second time and risking it drifting out of sync
 * with this one.
 */
export function resolveEffectiveRewardCurrency(
  reward: Pick<DraftCompletionReward, "currency" | "eventContext">,
): PointCurrency {
  return reward.eventContext?.manuallyEnabled
    ? GENERIC_POINT_CURRENCY
    : reward.currency;
}

/**
 * The one path anything that completes a draft goes through to actually
 * award points (see docs/product-spec.md, event system Phase 4:
 * "Provide one clear reward path where event context can determine the
 * effective currency" / "Enforce the manual-event rule centrally rather
 * than separately inside future events"). No caller computes a currency
 * amount by itself and pokes a balance directly — this is the only place
 * that ever writes to `PointsRepository`, and the only place the
 * manual-event downgrade rule is checked.
 *
 * Idempotency reuses `DraftRecord.rewardsGrantedAt` exactly as Phase 1
 * added it — a draft whose rewards were already granted is a no-op,
 * returning `false`, whether this is called once too often by a retry or
 * called again after the draft already settled through a different path.
 */
export async function awardDraftCompletionReward(
  repos: { drafts: DraftRepository; points: PointsRepository },
  params: {
    profileId: string;
    draftId: string;
    reward: DraftCompletionReward;
  },
  deps: {
    clock?: Clock;
    /**
     * `false` skips the actual balance credit while still stamping
     * `rewardsGrantedAt` — for the one case where a SINGLE watch action
     * resolves TWO drafts at once (a film shared between a normal Draft
     * and an event Draft, see docs/updates, "EVENT SYSTEM — UNIVERSAL
     * EVENT CURRENCY EARNING" §5): each draft still needs its own
     * `rewardsGrantedAt` stamped (so neither can be re-completed and
     * re-rewarded later), but the profile must only ever gain ONE
     * Lifetime Point for that one action, not one per resolved draft.
     * The caller (`markLocalFilmWatched`) is what decides which of the
     * (up to two) calls this turn actually credits. Defaults to `true`
     * — every existing caller before this option existed keeps crediting
     * exactly as before.
     */
    creditBalance?: boolean;
  } = {},
): Promise<boolean> {
  const clock = deps.clock ?? new SystemClock();
  const draft = await repos.drafts.getById(params.profileId, params.draftId);
  if (!draft || draft.rewardsGrantedAt) {
    return false;
  }

  // CRITICAL RULE: a manually enabled event awards only generic/Lifetime
  // Points, never its own currency — enforced here, once, rather than
  // trusting every future event to remember it independently.
  const currency = resolveEffectiveRewardCurrency(params.reward);
  const creditBalance = deps.creditBalance ?? true;

  const now = clock.now().toISOString();
  if (creditBalance && params.reward.amount !== 0) {
    const currentTotal = await repos.points.getBalance(
      params.profileId,
      currency,
    );
    await repos.points.setBalance({
      profileId: params.profileId,
      currency,
      total: currentTotal + params.reward.amount,
      updatedAt: now,
    });
  }

  await repos.drafts.updateDraft({
    ...draft,
    rewardsGrantedAt: now,
    updatedAt: now,
  });
  return true;
}

/**
 * The one flat amount every draft completion is worth, regardless of
 * currency or event — the "existing reward quantity/formula" the event
 * system's own docs call for reusing rather than each event inventing its
 * own scoring. Named and exported, not inlined, the same "default,
 * overridable constant" convention `DEFAULT_POSTMORTEM_WEIGHT_INCREASE`
 * already established for this codebase's one other fixed reward number.
 */
export const DEFAULT_DRAFT_COMPLETION_REWARD_AMOUNT = 1;

/**
 * Turns a completed draft into the `DraftCompletionReward` its completion
 * should actually apply — the one place that decides "which currency,"
 * so no completion path (`archiveLocalDraftIfResolved`, or any future
 * one) has to know about events itself. A normal, non-event draft
 * (`sourceEventId: null`) or a draft whose event was since removed from
 * the registry always resolves to plain generic/Lifetime Points; an
 * event-sourced draft resolves to that event's own `pointType` plus
 * whether the profile manually enabled it (see `EventSettings.
 * manuallyEnabledEvents`) — `awardDraftCompletionReward` is what actually
 * applies the manual-event downgrade rule from that flag, not this
 * function.
 */
export async function resolveDraftCompletionReward(
  repos: { settings: SettingsRepository },
  params: { profileId: string; draft: DraftRecord },
): Promise<DraftCompletionReward> {
  const amount = DEFAULT_DRAFT_COMPLETION_REWARD_AMOUNT;
  const event = params.draft.sourceEventId
    ? getEventDefinition(params.draft.sourceEventId)
    : null;
  if (!event) {
    return { currency: GENERIC_POINT_CURRENCY, amount };
  }

  // An event with its own per-FILM-watched `currency` (see docs/updates,
  // "EVENT SYSTEM — UNIVERSAL EVENT CURRENCY EARNING") earns that
  // currency continuously via `awardEventDraftItemReward`, not once here
  // at completion — so completion itself always just contributes the
  // same Lifetime Point every draft, event or not, earns. Checked BEFORE
  // `pointType` below so an event that sets both (Halloween, January)
  // never double-awards its own currency once from each mechanism.
  if (event.currency) {
    return { currency: GENERIC_POINT_CURRENCY, amount };
  }

  // The persisted activation context captured when THIS draft was created
  // (see docs/product-spec.md, event system Phase 10: "the reward
  // destination must be based on the persisted activation context of that
  // draft, not whatever the user's current settings happen to be at
  // completion time") is authoritative whenever it's known. Only a draft
  // created before `sourceEventManuallyEnabled` existed (`null`) falls
  // back to re-deriving it from CURRENT settings — the exact pre-Phase-10
  // behaviour, kept solely for that already-in-flight legacy case.
  let manuallyEnabled = params.draft.sourceEventManuallyEnabled;
  if (manuallyEnabled === null) {
    const eventSettings = await getEventSettings(repos, params.profileId);
    manuallyEnabled = eventSettings.manuallyEnabledEvents.includes(event.id);
  }

  return {
    currency: event.pointType ?? GENERIC_POINT_CURRENCY,
    amount,
    eventContext: {
      eventId: event.id,
      manuallyEnabled,
    },
  };
}

/**
 * The one place a draft ITEM's own per-film event-currency reward is
 * decided and granted (see docs/updates, "EVENT SYSTEM — UNIVERSAL EVENT
 * CURRENCY EARNING" §1-3) — the generic engine every event with a
 * `currency` config runs through; no event id ever appears here, so a
 * future event earns its own currency purely by declaring one on its
 * `EventDefinition`, with zero new award code. Called once per draft
 * item completion (`completeMatchingActiveDraftItem`/
 * `markLocalDraftItemWatchedWithoutEntry`, `local-watchlist-service.ts`),
 * independent of whether that completion also happens to be the one that
 * archives the whole draft — every film in an event Draft earns its
 * currency, not just whichever one happens to be last (see §3: "Currency
 * eligibility comes from the WATCH ACTION being associated with a film
 * currently contained in an Event Draft," never eligibility rules like
 * genre/rating/pool — those already decided the film belongs in the
 * Draft; this never re-checks them).
 *
 * Idempotency: `item.eventRewardGrantedAt`, the per-ITEM parallel to
 * `DraftRecord.rewardsGrantedAt`. A `false` return means nothing was
 * granted — either this item was already rewarded, its draft has no
 * event or no configured `currency`, or the event was manually enabled
 * (the same CRITICAL RULE `resolveEffectiveRewardCurrency` enforces for
 * the per-completion reward, reapplied here so a manually enabled event
 * still only ever earns Lifetime Points via completion, never its own
 * currency through this path either).
 */
export async function awardEventDraftItemReward(
  repos: {
    drafts: DraftRepository;
    points: PointsRepository;
    settings: SettingsRepository;
  },
  params: { profileId: string; draft: DraftRecord; item: DraftItemRecord },
  deps: { clock?: Clock } = {},
): Promise<boolean> {
  const clock = deps.clock ?? new SystemClock();
  if (params.item.eventRewardGrantedAt) {
    return false;
  }

  const event = params.draft.sourceEventId
    ? getEventDefinition(params.draft.sourceEventId)
    : null;
  const currency = event?.currency;
  if (!event || !currency) {
    return false;
  }

  let manuallyEnabled = params.draft.sourceEventManuallyEnabled;
  if (manuallyEnabled === null) {
    const eventSettings = await getEventSettings(repos, params.profileId);
    manuallyEnabled = eventSettings.manuallyEnabledEvents.includes(event.id);
  }
  if (manuallyEnabled) {
    return false;
  }

  const now = clock.now().toISOString();
  if (currency.pointsPerFilm !== 0) {
    const currentTotal = await repos.points.getBalance(
      params.profileId,
      currency.id,
    );
    await repos.points.setBalance({
      profileId: params.profileId,
      currency: currency.id,
      total: currentTotal + currency.pointsPerFilm,
      updatedAt: now,
    });
  }

  await repos.drafts.updateItem({
    ...params.item,
    eventRewardGrantedAt: now,
  });
  return true;
}

/**
 * Reverses exactly one item's per-film event-currency award — the
 * `awardEventDraftItemReward` counterpart `undoLocalFilmWatched` calls
 * for every draft-item completion it reverts, regardless of whether that
 * completion also archived the draft (per-film currency is earned
 * independently of draft archival — see that function's own comment —
 * so it must also be reversed independently of it). A no-op (`false`)
 * whenever the item was never actually rewarded in the first place — the
 * ordinary case for a plain draft, or an event with no `currency`
 * configured, or a manually enabled one.
 */
export async function reverseEventDraftItemReward(
  repos: { drafts: DraftRepository; points: PointsRepository },
  params: { profileId: string; draft: DraftRecord; item: DraftItemRecord },
  deps: { clock?: Clock } = {},
): Promise<boolean> {
  const clock = deps.clock ?? new SystemClock();
  if (!params.item.eventRewardGrantedAt) {
    return false;
  }

  const event = params.draft.sourceEventId
    ? getEventDefinition(params.draft.sourceEventId)
    : null;
  const currency = event?.currency;
  const now = clock.now().toISOString();

  if (currency && currency.pointsPerFilm !== 0) {
    const currentTotal = await repos.points.getBalance(
      params.profileId,
      currency.id,
    );
    await repos.points.setBalance({
      profileId: params.profileId,
      currency: currency.id,
      total: Math.max(0, currentTotal - currency.pointsPerFilm),
      updatedAt: now,
    });
  }

  await repos.drafts.updateItem({
    ...params.item,
    eventRewardGrantedAt: null,
  });
  return true;
}
