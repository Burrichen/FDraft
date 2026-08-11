import type { ComponentType, SVGProps } from "react";
import {
  DraftsNavIcon,
  HistoryNavIcon,
  StatsNavIcon,
  WatchlistNavIcon,
} from "./nav-icons";

export interface NavItem {
  href: string;
  label: string;
  /** Wider than `LucideIcon` on purpose — accepts the custom, per-element-animatable icons in `nav-icons.tsx` alongside any plain `lucide-react` icon, since both are just components over `SVGProps<SVGSVGElement>`. */
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/watchlist", label: "Watchlist", icon: WatchlistNavIcon },
  { href: "/drafts", label: "Drafts", icon: DraftsNavIcon },
  { href: "/drafts/history", label: "History", icon: HistoryNavIcon },
  { href: "/stats", label: "Stats", icon: StatsNavIcon },
];
