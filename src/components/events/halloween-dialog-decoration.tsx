"use client";

import { useProfileContext } from "@/components/profiles/profile-provider";
import { HALLOWEEN_EVENT_ID } from "@/domain/events/event-registry";
import { EventDecorationLayer } from "./event-decoration-layer";
import { HALLOWEEN_DECORATION_REGISTRY } from "./halloween-decoration-registry";
import {
  HALLOWEEN_MODAL_DECORATION_LAYOUT,
  HALLOWEEN_MODAL_SLOT_POSITIONS,
} from "./halloween-decoration-layout";

/**
 * The opt-in modal's decoration — now a thin wrapper around the generic
 * Designed Slot renderer (`EventDecorationLayer`) instead of a fixed,
 * always-identical background/mid/foreground composition (see
 * docs/updates, "EVENT ART SYSTEM — DESIGNED SLOTS + WEIGHTED VARIANTS",
 * superseding "PROMPT B2.3"/"PROMPT B2.4"'s original version). What
 * renders in each named spot (or whether anything does) is picked once
 * per browser session per `HALLOWEEN_MODAL_DECORATION_LAYOUT` — see that
 * file for the exact weights.
 *
 * A real component now (not a plain function returning JSX) — Designed
 * Slot resolution needs React hooks, and hooks can only be called from
 * something React recognizes as a component. Rendered by
 * `EventIntroDialog` via `EventVisualTheme.DecorationComponent` — a
 * fully generic hook, so this stays the ONLY Halloween-specific
 * component involved; the dialog itself still has no per-event branch.
 * Absolutely positioned within the dialog's own `relative` content,
 * `aria-hidden` and `pointer-events-none` throughout (both set once, by
 * `EventDecorationLayer` itself) so it's invisible to screen readers and
 * never intercepts a click meant for the real controls underneath —
 * every slot position here stays clear of the footer button row and the
 * main copy column.
 */
export function HalloweenDialogDecoration() {
  const { activeProfile } = useProfileContext();

  return (
    <EventDecorationLayer
      layout={HALLOWEEN_MODAL_DECORATION_LAYOUT}
      positions={HALLOWEEN_MODAL_SLOT_POSITIONS}
      registry={HALLOWEEN_DECORATION_REGISTRY}
      seedInputs={{
        eventId: HALLOWEEN_EVENT_ID,
        layoutKey: "halloween-modal",
        profileId: activeProfile?.id ?? null,
      }}
      className="halloween-modal-decoration-settle rounded-[inherit]"
    />
  );
}
