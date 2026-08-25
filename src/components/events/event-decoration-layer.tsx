"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { ComponentType, CSSProperties } from "react";
import {
  DECORATION_BREAKPOINTS,
  resolveDecorationLayout,
  type DecorationBreakpoint,
  type DecorationLayer,
  type DecorationSeedInputs,
  type DecorationVariantOption,
  type EventDecorationLayout,
  type EventDecorationSlotName,
  type ResolvedDecorationSlot,
} from "@/domain/events/event-decoration-slots";
import { cn } from "@/lib/utils";

/**
 * The generic renderer for the Designed Slot system (see docs/updates,
 * "EVENT ART SYSTEM — DESIGNED SLOTS + WEIGHTED VARIANTS") — this file
 * has no idea what event it's decorating; it only turns an
 * `EventDecorationLayout` (see `event-decoration-slots.ts`) plus a
 * caller-supplied asset registry and position map into positioned,
 * `aria-hidden`/`pointer-events-none` elements. Halloween and a future
 * Christmas both call this same component with their own layout/
 * registry/positions — see `halloween-decoration-layout.ts` and
 * `christmas-decoration-layout.ts`.
 */

/** A registered decorative piece — no props beyond what the component itself already needs; sizing/tint live on the component (see e.g. `halloween-decoration-registry.tsx`), never threaded through this generic layer. */
export type DecorationAssetRenderer = ComponentType;
export type DecorationAssetRegistry = Record<string, DecorationAssetRenderer>;

/** Where each named slot actually sits for a given SURFACE (a page layer vs. a modal's own content area have different coordinate spaces) — absolute-position Tailwind classes only; visibility/depth/tweaks are layered on separately below. Not every slot needs an entry for every surface. */
export type EventDecorationSlotPositions = Partial<
  Record<EventDecorationSlotName, string>
>;

const LAYER_Z_INDEX: Record<DecorationLayer, number> = {
  background: 0,
  mid: 10,
  foreground: 20,
};

function visibilityClassName(breakpoint: DecorationBreakpoint): string {
  switch (breakpoint) {
    case "base":
      return "";
    case "sm":
      return "hidden sm:block";
    case "lg":
      return "hidden lg:block";
    case "xl":
      return "hidden xl:block";
  }
}

/** Turns a variant's tweak (+ any per-breakpoint overrides) into the CSS custom properties `.event-decoration-tweak` (`globals.css`) reads — only sets a property when the variant actually supplied a value, so the CSS's own fallback chain (`var(--x-sm, var(--x-base, default))`) does the rest. */
function tweakStyle(variant: DecorationVariantOption): CSSProperties {
  const style: Record<string, string> = {};
  if (variant.offsetX !== undefined) {
    style["--deco-offset-x-base"] = `${variant.offsetX}rem`;
  }
  if (variant.offsetY !== undefined) {
    style["--deco-offset-y-base"] = `${variant.offsetY}rem`;
  }
  if (variant.scale !== undefined) {
    style["--deco-scale-base"] = `${variant.scale}`;
  }
  if (variant.opacity !== undefined) {
    style["--deco-opacity-base"] = `${variant.opacity}`;
  }
  for (const breakpoint of DECORATION_BREAKPOINTS) {
    const override = variant.responsive?.[breakpoint];
    if (!override) {
      continue;
    }
    if (override.offsetX !== undefined) {
      style[`--deco-offset-x-${breakpoint}`] = `${override.offsetX}rem`;
    }
    if (override.offsetY !== undefined) {
      style[`--deco-offset-y-${breakpoint}`] = `${override.offsetY}rem`;
    }
    if (override.scale !== undefined) {
      style[`--deco-scale-${breakpoint}`] = `${override.scale}`;
    }
    if (override.opacity !== undefined) {
      style[`--deco-opacity-${breakpoint}`] = `${override.opacity}`;
    }
  }
  return style as CSSProperties;
}

let cachedSessionSeed: string | null = null;

/**
 * Stable for the lifetime of this browser tab/session; a fresh app
 * launch (a new module instantiation) gets a fresh value — see
 * docs/updates §3: "ok if a new session results in a different valid
 * variant, but not every rerender." Deliberately never called during
 * server rendering/static generation — every call site here is gated
 * behind `useEventDecorationSelections`'s post-mount check, so a
 * statically-exported page's prerendered HTML and its first client
 * hydration never have to agree on a random value neither of them can
 * share (see that hook's own comment for why).
 */
function getDecorationSessionSeed(): string {
  if (cachedSessionSeed === null) {
    cachedSessionSeed = Math.random().toString(36).slice(2);
  }
  return cachedSessionSeed;
}

/** Never actually notifies — there's nothing to subscribe to, only a fixed answer that flips once between the server snapshot and the client one. */
function subscribeNever() {
  return () => {};
}
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * `true` once React has hydrated in an actual browser, `false` during
 * server rendering/static generation — the canonical `useSyncExternalStore`
 * idiom for this (see the React docs on hydration mismatches), preferred
 * here over a `useState` + `useEffect(() => setMounted(true), [])` pair
 * specifically because that pair trips this project's `react-hooks/set-
 * state-in-effect` lint rule (calling `setState` synchronously inside an
 * effect body).
 */
function useIsMounted(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    getClientSnapshot,
    getServerSnapshot,
  );
}

/**
 * Resolves every slot in `layout` exactly once per distinct
 * (event, layout, profile) combination for this session, memoized so a
 * rerender — a keystroke elsewhere, an unrelated context update — never
 * rerolls anything ("decorations should feel intentionally placed, not
 * chaotic"). Returns `{}` until the component has actually mounted in a
 * browser: purely decorative, `aria-hidden` content popping in a tick
 * after first paint is a fine trade for guaranteeing this never disagrees
 * with what a statically-exported page's build-time prerender produced
 * (which can't know this session's random seed at all).
 */
export function useEventDecorationSelections(
  layout: EventDecorationLayout,
  seedInputs: Omit<DecorationSeedInputs, "sessionSeed">,
): Partial<Record<EventDecorationSlotName, ResolvedDecorationSlot>> {
  const mounted = useIsMounted();

  return useMemo(() => {
    if (!mounted) {
      return {};
    }
    return resolveDecorationLayout(layout, {
      ...seedInputs,
      sessionSeed: getDecorationSessionSeed(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `layout` is always a module-level constant (never a fresh literal per render) and `seedInputs`' own identity isn't stable, so its primitive fields are the real dependencies.
  }, [
    mounted,
    layout,
    seedInputs.eventId,
    seedInputs.layoutKey,
    seedInputs.profileId,
  ]);
}

export interface EventDecorationLayerProps {
  layout: EventDecorationLayout;
  registry: DecorationAssetRegistry;
  positions: EventDecorationSlotPositions;
  seedInputs: Omit<DecorationSeedInputs, "sessionSeed">;
  className?: string;
}

/**
 * Renders every slot in `layout` that (a) has a real position for this
 * surface and (b) resolved to something other than "nothing" this
 * session. Always `aria-hidden`/`pointer-events-none` at the root — pure
 * decoration never intercepts a click meant for real UI underneath, and
 * never announces itself to assistive tech; nothing inside ever needs
 * its own `aria-hidden`, since that attribute is inherited.
 */
export function EventDecorationLayer({
  layout,
  registry,
  positions,
  seedInputs,
  className,
}: EventDecorationLayerProps) {
  const selections = useEventDecorationSelections(layout, seedInputs);

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className,
      )}
    >
      {Object.values(selections).map((resolved) => {
        if (!resolved) {
          return null;
        }
        const { slot, variant } = resolved;
        const assetId = variant.assetId;
        const positionClassName = positions[slot.slot];
        if (assetId === null || !positionClassName) {
          return null;
        }
        const Renderer = registry[assetId];
        if (!Renderer) {
          return null;
        }
        return (
          <div
            key={slot.slot}
            className={cn(
              positionClassName,
              visibilityClassName(slot.visibleFrom),
              "event-decoration-tweak",
            )}
            style={{
              zIndex: LAYER_Z_INDEX[variant.layer ?? "mid"],
              ...tweakStyle(variant),
            }}
          >
            <Renderer />
          </div>
        );
      })}
    </div>
  );
}
