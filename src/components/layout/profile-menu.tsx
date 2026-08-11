"use client";

import { Settings, UserRound } from "lucide-react";
import Link from "next/link";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { LocalProfile } from "@/domain/profiles/profile";

interface ProfileMenuProps {
  activeProfile: LocalProfile;
  profiles: LocalProfile[];
}

/**
 * Replaces the old Supabase `UserMenu` (email + sign out) now that there's
 * no account to sign out of (see docs/product-spec.md, "REMOVE
 * AUTHENTICATION", Prompt 9.5B). Doubles as the "clean switcher" the spec
 * asks for when several profiles exist — full profile management (rename,
 * create, delete) lives on the Settings page; this is just the quick path.
 */
export function ProfileMenu({ activeProfile, profiles }: ProfileMenuProps) {
  const { switchToProfile } = useProfileContext();
  const otherProfiles = profiles.filter(
    (profile) => profile.id !== activeProfile.id,
  );
  const initial = activeProfile.displayName.charAt(0).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            aria-label="Profile menu"
          >
            <Avatar className="size-7">
              <AvatarFallback className="text-xs">{initial}</AvatarFallback>
            </Avatar>
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-muted-foreground max-w-48 truncate font-normal">
            {activeProfile.displayName}
          </DropdownMenuLabel>
          {otherProfiles.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              {otherProfiles.map((profile) => (
                <DropdownMenuItem
                  key={profile.id}
                  onClick={() => switchToProfile(profile.id)}
                >
                  <UserRound /> Switch to {profile.displayName}
                </DropdownMenuItem>
              ))}
            </>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            render={
              <Link href="/settings">
                <Settings /> Settings
              </Link>
            }
          />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
