import { Clapperboard } from "lucide-react";
import Link from "next/link";
import type { LocalProfile } from "@/domain/profiles/profile";
import { MobileNav } from "./mobile-nav";
import { NavLinks } from "./nav-links";
import { ProfileMenu } from "./profile-menu";

interface HeaderProps {
  activeProfile: LocalProfile;
  profiles: LocalProfile[];
}

/**
 * See docs/product-spec.md's UI-polish pass, "TOP NAVIGATION BAR" — a
 * genuinely elevated surface (`bg-card`, lighter than the page background,
 * plus a soft shadow) rather than a same-colour, blurred copy of the page
 * behind it, so the header reads as its own layer instead of blending in.
 * Kept compact on purpose (`h-16`, no giant pill buttons) — "premium"
 * here means considered spacing and typography, not a taller bar.
 */
export function Header({ activeProfile, profiles }: HeaderProps) {
  return (
    <header className="border-border bg-card/95 supports-backdrop-filter:bg-card/85 sticky top-0 z-40 border-b shadow-sm shadow-black/10 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <MobileNav />
        <Link
          href="/watchlist"
          aria-label="FDraft — home"
          className="group text-foreground focus-visible:outline-ring flex items-center gap-2 font-semibold focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Clapperboard
            aria-hidden="true"
            className="nav-icon-logo text-watchlist-green size-6"
          />
          <span className="hidden text-base sm:inline">FDraft</span>
        </Link>
        <NavLinks className="ml-2 hidden items-center gap-1 md:flex" />
        <div className="ml-auto flex items-center gap-2">
          <ProfileMenu activeProfile={activeProfile} profiles={profiles} />
        </div>
      </div>
    </header>
  );
}
