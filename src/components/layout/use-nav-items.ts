import { Snowflake } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { getEventSettings } from "@/application/events/event-settings-store";
import { useProfileContext } from "@/components/profiles/profile-provider";
import {
  F_YOU_ITS_JANUARY_EVENT_ID,
  HALLOWEEN_EVENT_ID,
  getEventDefinition,
} from "@/domain/events/event-registry";
import { useAsyncData } from "@/hooks/use-async-data";
import { HalloweenNavIcon } from "./nav-icons";
import { NAV_ITEMS, type NavItem } from "./nav-config";

/**
 * Which icon a currently-active event's temporary nav tab uses — kept
 * separate from `event-visual-themes.ts`'s `resolveEventTheme`, since that
 * one is gated behind `EventSettings.eventVisualsEnabled` (cosmetic
 * theming) and a nav tab needs a real, always-present icon regardless of
 * that setting, exactly like every other nav item. Only events with a
 * `page` (see `EventDefinition.page`) ever need an entry here.
 */
const EVENT_NAV_ICONS: Record<
  string,
  ComponentType<SVGProps<SVGSVGElement>>
> = {
  [HALLOWEEN_EVENT_ID]: HalloweenNavIcon,
  [F_YOU_ITS_JANUARY_EVENT_ID]: Snowflake,
};

/**
 * `NAV_ITEMS` plus, when a profile currently has an active event that
 * exposes a dedicated page (see docs/updates, "PROMPT 18 — EVENT PAGES +
 * HALLOWEEN LIFECYCLE"), one extra temporary tab for it — the ONE place
 * "is there a currently-active event with a page" is decided, so nothing
 * else in the nav-rendering path needs an event-specific conditional.
 * Opting out (or the active event simply not having a page) just means
 * this returns the plain static list, unchanged from before this existed.
 */
export function useNavItems(): NavItem[] {
  const { activeProfile, repositories } = useProfileContext();
  const profileId = activeProfile?.id ?? null;

  const { data: eventNavItem } = useAsyncData(async () => {
    if (!profileId) return null;
    const settings = await getEventSettings(repositories, profileId);
    if (!settings.eventsEnabled || !settings.activeEvent) return null;
    const event = getEventDefinition(settings.activeEvent);
    if (!event?.page) return null;
    const icon = EVENT_NAV_ICONS[event.id];
    if (!icon) return null;
    return {
      href: event.page.route,
      label: event.page.navLabel,
      icon,
      ...(event.id === HALLOWEEN_EVENT_ID
        ? {
            activeIconClassName: "text-halloween-pumpkin",
            activeUnderlineClassName: "bg-halloween-pumpkin",
          }
        : {}),
    };
  }, [profileId, repositories]);

  return eventNavItem ? [...NAV_ITEMS, eventNavItem] : NAV_ITEMS;
}
