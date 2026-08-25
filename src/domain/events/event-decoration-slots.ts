/**
 * The generic, event-agnostic DESIGNED SLOT model for decorative
 * placement (see docs/updates, "EVENT ART SYSTEM — DESIGNED SLOTS +
 * WEIGHTED VARIANTS") — a deliberate replacement for the old pattern of
 * hand-placing every decoration at a fixed absolute position with no
 * variation (see `halloween-decorative-layer.tsx`'s and
 * `halloween-dialog-decoration.tsx`'s pre-this-phase versions). A
 * "slot" is a named, designed layout position (e.g. "mid-right"); each
 * slot declares a weighted list of what MIGHT appear there, including an
 * explicit `assetId: null` ("nothing") option where a truly empty slot is
 * one of the intended possibilities — never a fallback bolted on
 * separately.
 *
 * Pure domain logic only — no React, no DOM, no randomness at import
 * time. `pickDecorationVariant` is a deterministic function of its seed
 * string: the same seed always picks the same variant, which is what
 * lets the components layer guarantee "stable for a session, never
 * rerolled on a rerender" just by keeping the seed's inputs stable (see
 * `event-decoration-layer.tsx`).
 */

export const EVENT_DECORATION_SLOT_NAMES = [
  "header-left",
  "header-right",
  "top-edge",
  "mid-left",
  "mid-right",
  "lower-left",
  "lower-right",
  "footer-center",
  "modal-top-left",
  "modal-top-right",
  "modal-bottom-left",
  "modal-bottom-right",
  "edge-peek-left",
  "edge-peek-right",
] as const;

export type EventDecorationSlotName =
  (typeof EVENT_DECORATION_SLOT_NAMES)[number];

/** Mirrors this app's own `sm`/`lg`/`xl` Tailwind breakpoints (see `globals.css`'s `.event-decoration-tweak`); `"base"` is "visible/applies at every width, including the smallest phones." */
export const DECORATION_BREAKPOINTS = ["base", "sm", "lg", "xl"] as const;
export type DecorationBreakpoint = (typeof DECORATION_BREAKPOINTS)[number];

/** A pure placement nudge — no color/asset info, just numbers a renderer turns into CSS. */
export interface DecorationVariantTweak {
  /** Uniform scale multiplier, e.g. `0.85` for slightly smaller. Omitted means `1`. */
  scale?: number;
  /** Horizontal nudge in `rem`, +right/-left. Omitted means `0`. */
  offsetX?: number;
  /** Vertical nudge in `rem`, +down/-up. Omitted means `0`. */
  offsetY?: number;
  /** `0`–`1`. Omitted means `1` (fully opaque). */
  opacity?: number;
}

/** Depth ordering when more than one rendered slot could visually overlap. Omitted means `"mid"`. */
export type DecorationLayer = "background" | "mid" | "foreground";

export interface DecorationVariantOption extends DecorationVariantTweak {
  /**
   * A key into whichever asset registry the caller supplies (see
   * `event-decoration-layer.tsx`'s `DecorationAssetRegistry`) — this
   * model has no idea what a "ghost" or "tree" is, only that some string
   * ids exist. `null` means "nothing" — a real, ordinarily-weighted
   * possibility, not a special case: give it its own `weight` exactly
   * like every other option, including 0 to effectively disable it.
   */
  assetId: string | null;
  /** Relative weight — option weights need not sum to 100; they're normalized against each other. A weight of `0` (or all-zero variants) means the option can never be picked. */
  weight: number;
  layer?: DecorationLayer;
  /** Per-breakpoint overrides of THIS SAME variant's own tweak values (e.g. a touch smaller/more transparent on tablet than on a laptop). Distinct from whether the slot is visible at all — see `DecorationSlotConfig.visibleFrom`. */
  responsive?: Partial<Record<DecorationBreakpoint, DecorationVariantTweak>>;
}

export interface DecorationSlotConfig {
  slot: EventDecorationSlotName;
  /**
   * The smallest breakpoint this slot appears at all. Monotonic by
   * design — once visible, a slot stays visible at every larger
   * breakpoint too, matching this app's existing `hidden sm:block`
   * convention (mobile never loses a slot a wider screen shows; it only
   * ever gains more). `"base"` means visible even at 320px — reserve
   * that for the few truly essential slots, per "do not scale one
   * desktop layout blindly down to 320px."
   */
  visibleFrom: DecorationBreakpoint;
  /** Always include an explicit `{ assetId: null, weight }` entry here for "nothing" if that's a genuinely intended outcome for this slot. */
  variants: DecorationVariantOption[];
}

/** A full layout is just however many named slots an event/surface wants to design — never every slot name, and no slot is required. */
export type EventDecorationLayout = Partial<
  Record<EventDecorationSlotName, DecorationSlotConfig>
>;

/**
 * A small, fast, deterministic string hash (djb2) — NOT cryptographic,
 * doesn't need to be; it only has to turn an arbitrary seed string into a
 * stable, well-distributed non-negative integer so weighted bucketing
 * below is reproducible for the same seed and reasonably even across
 * different seeds.
 */
export function hashDecorationSeed(seed: string): number {
  let hash = 5381;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 33) ^ seed.charCodeAt(index);
  }
  return hash >>> 0;
}

/**
 * Deterministically picks one of `variants` from `seed` — the SAME seed
 * always returns the SAME variant (by reference), which is the entire
 * mechanism behind "stable for a session, never flickers on a rerender."
 * Varying any part of the seed (which event, which slot, which profile,
 * which session) can change the outcome; nothing here reads the clock,
 * `Math.random()`, or any other non-deterministic source.
 *
 * Returns `null` if `variants` is empty or every weight is non-positive
 * (nothing valid to pick) — callers treat that exactly like an explicit
 * `assetId: null` pick.
 */
export function pickDecorationVariant(
  seed: string,
  variants: readonly DecorationVariantOption[],
): DecorationVariantOption | null {
  const totalWeight = variants.reduce(
    (sum, variant) => sum + Math.max(0, variant.weight),
    0,
  );
  if (totalWeight <= 0) {
    return null;
  }

  const target = hashDecorationSeed(seed) % totalWeight;
  let cumulative = 0;
  for (const variant of variants) {
    cumulative += Math.max(0, variant.weight);
    if (target < cumulative) {
      return variant;
    }
  }
  // Unreachable given totalWeight > 0 and the loop above covers every
  // variant's share, but keeps this function total rather than partial.
  return variants[variants.length - 1] ?? null;
}

/** The stable inputs that make up a decoration seed — see `event-decoration-layer.tsx`'s `useEventDecorationSelections` for where each of these actually comes from. */
export interface DecorationSeedInputs {
  eventId: string;
  /** Identifies which named layout/surface this is (e.g. `"halloween-page"`, `"halloween-modal"`) — the same event can have more than one layout. */
  layoutKey: string;
  /** `null`/absent for "no active profile yet" — still a valid, stable seed component. */
  profileId?: string | null;
  /** A value that's stable for the lifetime of one app session/tab but may differ across separate launches — see `getDecorationSessionSeed` in `event-decoration-layer.tsx`. Kept as a plain parameter here (rather than generated in this file) so this module never touches `Math.random`/browser globals and stays trivially unit-testable. */
  sessionSeed: string;
}

/** Builds one slot's own seed string from the shared inputs plus its slot name — every slot in a layout picks independently even though they share the same session/profile/layout seed. */
export function buildDecorationSeed(
  inputs: DecorationSeedInputs,
  slot: EventDecorationSlotName,
): string {
  return `${inputs.eventId}:${inputs.layoutKey}:${inputs.profileId ?? "anon"}:${inputs.sessionSeed}:${slot}`;
}

export interface ResolvedDecorationSlot {
  slot: DecorationSlotConfig;
  variant: DecorationVariantOption;
}

/**
 * Resolves an entire layout at once — the one function
 * `event-decoration-layer.tsx`'s hook actually calls. Slots whose pick
 * came back "nothing" (`assetId: null`, or no valid variant at all) are
 * simply absent from the result, never present with a null placeholder —
 * a caller iterating the result only ever sees slots that actually have
 * something to render.
 */
export function resolveDecorationLayout(
  layout: EventDecorationLayout,
  inputs: DecorationSeedInputs,
): Partial<Record<EventDecorationSlotName, ResolvedDecorationSlot>> {
  const resolved: Partial<
    Record<EventDecorationSlotName, ResolvedDecorationSlot>
  > = {};
  for (const slotConfig of Object.values(layout)) {
    if (!slotConfig) {
      continue;
    }
    const seed = buildDecorationSeed(inputs, slotConfig.slot);
    const variant = pickDecorationVariant(seed, slotConfig.variants);
    if (variant && variant.assetId !== null) {
      resolved[slotConfig.slot] = { slot: slotConfig, variant };
    }
  }
  return resolved;
}
