/**
 * Every permanent point currency FDraft's event system can award (see
 * docs/product-spec.md, event system Phase 4). `"lifetime"` is the
 * existing generic currency every profile has always implicitly earned —
 * `"misery"` and `"bounty"`/`"signal"` are awarded by January/Frontier/
 * Signal respectively. `"haunted"` (FDraft Beta 2, "PROMPT B2.1 — DUAL
 * DRAFT ARCHITECTURE + EVENT ROUTING/SETTINGS FIXES" §5) is Halloween's
 * own reserved currency — the storage/UI plumbing exists and every
 * profile has a real (default 0) balance for it, but nothing awards it
 * yet: `HALLOWEEN_EVENT_ID`'s `EventDefinition.pointType` deliberately
 * stays `null` (see `event-registry.ts`) rather than being set to
 * `"haunted"`, since flipping that field on would immediately start
 * awarding it through the existing generic `awardDraftCompletionReward`
 * path for every natural-window Halloween Draft completion — inventing an
 * earning mechanic this phase was explicitly told not to invent. A later
 * phase defines earning by setting `pointType: "haunted"` once that's an
 * intentional decision, not a side effect of this currency existing.
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
