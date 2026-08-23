"use client";

import { EventPageView } from "@/components/events/event-page-view";
import { HalloweenCandyBowl } from "@/components/events/halloween-candy-bowl";
import { HalloweenDecorativeLayer } from "@/components/events/halloween-decorative-layer";
import { HalloweenDraftCreationView } from "@/components/events/halloween-draft-creation-view";
import { HalloweenGravestone } from "@/components/events/halloween-gravestone";
import { HalloweenPumpkin } from "@/components/events/halloween-pumpkin";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { HALLOWEEN_EVENT_ID } from "@/domain/events/event-registry";

/**
 * Split from `page.tsx` purely so that file can keep its `metadata` export
 * (Server Component only) while this part passes a function prop
 * (`renderEmptyState`) into the client `EventPageView` — see
 * `event-page-view.tsx`'s doc comment on why it's a render function rather
 * than a plain node.
 *
 * Also the one place Halloween's real Kitsch Halloween presentation gets
 * assembled (see docs/updates, "PROMPT 20 — HIGH-EFFORT HALLOWEEN UI +
 * APPROVED EASTER EGGS") — `.theme-halloween` re-skins every shared UI
 * primitive underneath to the Halloween palette, `HalloweenDecorativeLayer`
 * adds the environmental framing, and the three approved easter eggs sit
 * in their own "yard" row so they never overlap the real draft UI
 * `EventPageView` renders. None of this touches `EventPageView` itself,
 * which stays exactly as generic as it was for January.
 *
 * The easter-egg row is `key`ed on the active profile id (see docs/updates,
 * "PROMPT 21 — HALLOWEEN RELEASE HARDENING", easter-egg abuse testing):
 * switching profiles via the header menu (`switchToProfile`) never
 * navigates or remounts this page, so without this key a gravestone
 * already revealed for one profile would keep showing revealed — and the
 * WRONG profile's name — the instant another profile became active on the
 * same page, without that profile ever earning the reveal itself. Keying
 * the whole row forces a fresh mount (fresh session-only state) for every
 * one of these on a profile switch; the pumpkin needs no such help since
 * it already reads its state from `activeProfile.settings` directly on
 * every render rather than caching it locally.
 */
export function HalloweenPageClient() {
  const { activeProfile } = useProfileContext();

  return (
    <div className="theme-halloween relative">
      <HalloweenDecorativeLayer />
      <div className="relative space-y-6">
        <EventPageView
          eventId={HALLOWEEN_EVENT_ID}
          renderEmptyState={(reload) => (
            <HalloweenDraftCreationView onCreated={reload} />
          )}
        />
        <div
          key={activeProfile?.id ?? "no-profile"}
          className="border-halloween-purple/20 flex flex-wrap items-end justify-center gap-6 border-t pt-6"
        >
          <HalloweenGravestone />
          <HalloweenPumpkin />
          <HalloweenCandyBowl />
        </div>
      </div>
    </div>
  );
}
