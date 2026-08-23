"use client";

import { usePathname } from "next/navigation";
import { getEventSettings } from "@/application/events/event-settings-store";
import { useProfileContext } from "@/components/profiles/profile-provider";
import {
  getEventDefinition,
  HALLOWEEN_EVENT_ID,
} from "@/domain/events/event-registry";
import { useAsyncData } from "@/hooks/use-async-data";
import {
  HalloweenBat,
  HalloweenCobwebCorner,
  HalloweenGhost,
  HalloweenTinyPumpkin,
} from "./halloween-decorations";

/**
 * App-wide Halloween ambient dressing (see docs/updates, "PROMPT B2.4 —
 * HALLOWEEN DECORATION + EASTER-EGG ART POLISH" §7-8) — mounted once by
 * `AppShell`, shown on every OTHER page once a profile is opted into
 * Halloween with visuals turned on. Deliberately much sparser than the
 * Event page's own `HalloweenDecorativeLayer`: "Keep Event-page intensity
 * highest... Other pages may receive: small bats; web corner; subtle
 * pumpkin; ghost peeking somewhere." — never a Christmas-tree-ing of every
 * normal page, and never anything on mobile (§8: "minimal").
 *
 * Deliberately excludes the Halloween page itself (which already renders
 * its own, denser layer) so the two never stack into a doubled-up mess.
 */
export function useHalloweenAmbientVisible(): boolean {
  const { activeProfile, repositories } = useProfileContext();
  const pathname = usePathname();
  const profileId = activeProfile?.id ?? null;
  const halloweenRoute = getEventDefinition(HALLOWEEN_EVENT_ID)?.page?.route;

  const { data } = useAsyncData(async () => {
    if (!profileId) return false;
    const settings = await getEventSettings(repositories, profileId);
    return (
      settings.eventVisualsEnabled &&
      settings.activeEvent === HALLOWEEN_EVENT_ID
    );
  }, [profileId, repositories]);

  if (halloweenRoute && pathname?.startsWith(halloweenRoute)) {
    return false;
  }
  return data ?? false;
}

export function HalloweenAmbientDecorations() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* Positioned below the sticky header (`h-16` = 64px, see
          `header.tsx`) rather than behind it — live QA on docs/updates,
          "PROMPT B2.4" found decoration placed at `top-0` rendered nearly
          invisible, bleeding through the header's own translucent
          `bg-card/95` backdrop-blur at a fraction of its real opacity. */}
      <div className="hidden sm:block">
        <HalloweenCobwebCorner className="absolute top-20 right-0 size-14 opacity-40" />
        <HalloweenBat className="halloween-bat-sway absolute top-28 right-20 size-5 opacity-50" />
      </div>
      <div className="hidden lg:block">
        <HalloweenTinyPumpkin className="absolute bottom-6 left-6 size-5 opacity-40" />
        <HalloweenGhost className="absolute right-12 bottom-10 size-7 opacity-40" />
      </div>
    </div>
  );
}
