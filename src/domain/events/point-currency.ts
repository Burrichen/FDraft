/**
 * Every permanent point currency FDraft's event system can award (see
 * docs/product-spec.md, event system Phase 4). `"lifetime"` is the
 * generic currency every profile earns from any draft's own completion
 * (see `resolveDraftCompletionReward`) — `"bounty"`/`"signal"` are still
 * awarded that same way by Frontier/Signal. `"misery"` (January) and
 * `"haunted"` (Halloween) are different: both events declare an
 * `EventDefinition.currency` (see `event-definition.ts`, docs/updates,
 * "EVENT SYSTEM — UNIVERSAL EVENT CURRENCY EARNING"), which earns their
 * currency PER FILM WATCHED in that event's own Draft, via
 * `awardEventDraftItemReward` — not once at completion.
 */
export type PointCurrency =
  "lifetime" | "misery" | "signal" | "bounty" | "haunted";

/** The generic currency every profile earns regardless of events — see the event system's CRITICAL RULE: a manually enabled event may only ever award this, never its own unique currency. */
export const GENERIC_POINT_CURRENCY: PointCurrency = "lifetime";

export const POINT_CURRENCIES: readonly PointCurrency[] = [
  "lifetime",
  "misery",
  "signal",
  "bounty",
  "haunted",
];
