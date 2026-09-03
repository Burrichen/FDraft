"use client";

import { useProfileContext } from "@/components/profiles/profile-provider";
import { HALLOWEEN_EVENT_ID } from "@/domain/events/event-registry";
import {
  EventDecorationLayer,
  useEventDecorationSelections,
} from "./event-decoration-layer";
import { HALLOWEEN_DECORATION_REGISTRY } from "./halloween-decoration-registry";
import {
  HALLOWEEN_ACTIVE_PAGE_DECORATION_LAYOUT,
  HALLOWEEN_PAGE_DECORATION_LAYOUT,
  HALLOWEEN_PAGE_SLOT_POSITIONS,
} from "./halloween-decoration-layout";

/**
 * The Halloween Event page's central decorative layer — now a thin
 * wrapper around the generic Designed Slot renderer
 * (`EventDecorationLayer`) instead of a fixed, always-identical list of
 * hand-placed pieces (see docs/updates, "EVENT ART SYSTEM — DESIGNED
 * SLOTS + WEIGHTED VARIANTS", which supersedes the original composition
 * from "PROMPT 20"/"PROMPT B2.4"). What actually renders in each slot
 * (or whether anything does) is picked once per browser session per
 * `HALLOWEEN_PAGE_DECORATION_LAYOUT` — see that file's comment for the
 * exact weights — rather than being the same fixed cluster on every
 * single visit.
 *
 * Density still scales with viewport via each slot's own `visibleFrom`
 * (mobile keeps only the two corner webs; more slots activate at each
 * larger breakpoint, matching this app's `hidden sm:block` convention —
 * never fewer decorations on a wider screen). Positions are still FIXED
 * per slot (`HALLOWEEN_PAGE_SLOT_POSITIONS`), never randomized — only
 * WHICH asset appears in an already-designed spot varies.
 */
export function HalloweenDecorativeLayer() {
  const { activeProfile } = useProfileContext();

  return (
    <EventDecorationLayer
      layout={HALLOWEEN_PAGE_DECORATION_LAYOUT}
      positions={HALLOWEEN_PAGE_SLOT_POSITIONS}
      registry={HALLOWEEN_DECORATION_REGISTRY}
      seedInputs={{
        eventId: HALLOWEEN_EVENT_ID,
        layoutKey: "halloween-page",
        profileId: activeProfile?.id ?? null,
      }}
      className="-z-10"
    />
  );
}

/**
 * The Halloween page's one INTERACTIVE decoration slot (bottom-right, 75%
 * Candy Bowl / 25% `ghost-02` — see
 * `HALLOWEEN_ACTIVE_PAGE_DECORATION_LAYOUT`'s own comment). Deliberately
 * does NOT render through `EventDecorationLayer` like every other slot —
 * that component's root is always `aria-hidden`/`pointer-events-none`
 * ("pure decoration never intercepts a click... never announces itself to
 * assistive tech"), which is exactly wrong for the Candy Bowl: a real,
 * keyboard-operable, labelled interactive easter egg (see
 * `halloween-candy-bowl.tsx`), not ambient theming. Calling
 * `useEventDecorationSelections` directly reuses the exact same
 * session-stable weighted-pick mechanism every other Designed Slot uses
 * (`resolveDecorationLayout`) and the SAME registry entries (so sizing
 * never drifts from what `HalloweenDecorativeLayer` would have rendered),
 * just without the blanket decorative wrapper — the Candy Bowl's own
 * buttons stay clickable and announced, while `ghost-02`'s `EventArtImage`
 * stays self-`aria-hidden` via its own default props either way.
 *
 * A sibling of `HalloweenDecorativeLayer`, not a slot inside it, so
 * `HalloweenPageClient` can mount it only while `isActiveForProfile` —
 * matching the same gate the Candy Bowl has always had — while the three
 * purely-ambient slots above keep rendering regardless of join status.
 */
export function HalloweenActivePageDecorations() {
  const { activeProfile } = useProfileContext();

  const selections = useEventDecorationSelections(
    HALLOWEEN_ACTIVE_PAGE_DECORATION_LAYOUT,
    {
      eventId: HALLOWEEN_EVENT_ID,
      layoutKey: "halloween-page-active",
      profileId: activeProfile?.id ?? null,
    },
  );

  const resolved = selections["lower-right"];
  const positionClassName = HALLOWEEN_PAGE_SLOT_POSITIONS["lower-right"];
  const assetId = resolved?.variant.assetId;
  const Renderer = assetId ? HALLOWEEN_DECORATION_REGISTRY[assetId] : null;

  if (!Renderer || !positionClassName) {
    return null;
  }

  return (
    <div className={positionClassName}>
      <Renderer />
    </div>
  );
}
