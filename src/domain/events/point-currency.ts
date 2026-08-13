/**
 * Every permanent point currency FDraft's event system can award (see
 * docs/product-spec.md, event system Phase 4). `"lifetime"` is the
 * existing generic currency every profile has always implicitly earned —
 * the other three are reserved for specific future events and are not
 * awarded by anything yet (see `src/domain/events/event-registry.ts`,
 * still empty).
 */
export type PointCurrency = "lifetime" | "misery" | "signal" | "bounty";

/** The generic currency every profile earns regardless of events — see the event system's CRITICAL RULE: a manually enabled event may only ever award this, never its own unique currency. */
export const GENERIC_POINT_CURRENCY: PointCurrency = "lifetime";

export const POINT_CURRENCIES: readonly PointCurrency[] = [
  "lifetime",
  "misery",
  "signal",
  "bounty",
];
