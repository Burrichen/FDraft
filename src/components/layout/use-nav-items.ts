import type { ComponentType, SVGProps } from "react";
import { resolveVisibleEventPages } from "@/application/events/event-discovery";
import { useEventDiscovery } from "@/components/events/event-discovery-provider";
import {
  F_YOU_ITS_JANUARY_EVENT_ID,
  HALLOWEEN_EVENT_ID,
} from "@/domain/events/event-registry";
import { HalloweenNavIcon, JanuaryTrashCanNavIcon } from "./nav-icons";
import { NAV_ITEMS, type NavItem } from "./nav-config";

/**
 * Which icon a currently-visible event's temporary nav tab uses — kept
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
  [F_YOU_ITS_JANUARY_EVENT_ID]: JanuaryTrashCanNavIcon,
};

/**
 * `NAV_ITEMS` plus one extra temporary tab for every currently-JOINED,
 * currently-available, page-bearing event (see docs/updates, "EVENT
 * LIFECYCLE REPAIR" §2/§3) — the canonical rule is "JOINED EVENT → nav
 * exists," never "a Draft exists for it" or "this route was visited."
 * Reads the shared `EventDiscoveryProvider` snapshot (`resolveVisibleEventPages`)
 * instead of its own independent `EventSettings` fetch, which is what
 * fixes the pre-existing bug where joining Halloween via the modal (which
 * immediately navigates to `/events/halloween`) never made the nav tab
 * itself appear — this component is mounted once, above the routed page,
 * and its own separate fetch had no way to learn about a join that
 * happened elsewhere. Every consumer now shares the exact same snapshot,
 * so this can never lag behind what just happened.
 *
 * Inserted right after "Drafts" (see docs/updates, "HALLOWEEN PAGE
 * REBUILD" §1) rather than appended at the end — a seasonal Draft
 * destination is close kin to the normal Drafts tab, and a normal user
 * should never have to look past History/Stats to find it.
 */
export function useNavItems(): NavItem[] {
  const { result } = useEventDiscovery();

  const eventNavItems: NavItem[] = resolveVisibleEventPages(result.statuses)
    .map((status): NavItem | null => {
      const { event } = status;
      const icon = EVENT_NAV_ICONS[event.id];
      if (!icon || !event.page) {
        return null;
      }
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
    })
    .filter((item): item is NavItem => item !== null);

  const draftsIndex = NAV_ITEMS.findIndex((item) => item.href === "/drafts");
  const insertAt = draftsIndex === -1 ? NAV_ITEMS.length : draftsIndex + 1;
  return [
    ...NAV_ITEMS.slice(0, insertAt),
    ...eventNavItems,
    ...NAV_ITEMS.slice(insertAt),
  ];
}
