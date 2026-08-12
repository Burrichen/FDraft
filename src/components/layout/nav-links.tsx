"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-config";

interface NavLinksProps {
  className?: string;
  linkClassName?: string;
  onNavigate?: () => void;
}

/**
 * See docs/product-spec.md's UI-polish pass, "TOP NAVIGATION BAR" and
 * "ACTIVE NAVIGATION STATE" — active state is never colour-alone: the
 * active item also gets a brighter/bolder label and a persistent accent
 * underline (`aria-current="page"` carries the same information for
 * assistive tech). The `group` class on each link is what lets
 * `nav-icons.tsx`'s per-icon animations key off this exact link's
 * hover/focus state in `globals.css`.
 */
export function NavLinks({
  className,
  linkClassName,
  onNavigate,
}: NavLinksProps) {
  const pathname = usePathname();

  return (
    <nav className={className} aria-label="Primary">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors duration-150",
              isActive
                ? "text-foreground"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              linkClassName,
            )}
          >
            <Icon
              aria-hidden="true"
              className={cn(
                "size-[1.15rem] transition-colors duration-150",
                isActive && "text-watchlist-green",
              )}
            />
            {item.label}
            <span
              aria-hidden="true"
              className={cn(
                "bg-watchlist-green absolute inset-x-3 -bottom-px h-0.5 origin-center scale-x-0 rounded-full transition-transform duration-200",
                isActive && "scale-x-100",
              )}
            />
          </Link>
        );
      })}
    </nav>
  );
}
