"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { Header } from "@/components/layout/header";
import { FirstRunScreen } from "@/components/profiles/first-run-screen";
import { ProfilePicker } from "@/components/profiles/profile-picker";
import {
  ProfileProvider,
  useProfileContext,
} from "@/components/profiles/profile-provider";
import { BrowserPersistentStorageRequester } from "@/infrastructure/local-db/persistent-storage-requester";

/**
 * The app's real entry point now that there's no authenticated route guard
 * (see docs/product-spec.md, "REMOVE AUTHENTICATION", Prompt 9.5B).
 * Replaces the old Supabase-backed `(app)/layout.tsx`, which redirected to
 * `/login` when `auth.getUser()` came back empty — there is no such check
 * here at all. Three states, decided entirely from local IndexedDB state:
 *
 *  - no profiles have ever existed on this device -> `FirstRunScreen`;
 *  - several profiles exist and none was remembered -> `ProfilePicker`;
 *  - otherwise -> the real app, immediately, no extra screen in the way.
 */
function AppShellContent({ children }: { children: ReactNode }) {
  const { activeProfile, profiles } = useProfileContext();

  // Only once a real profile is active — never on the bare first-run
  // screen (see docs/product-spec.md, "BROWSER STORAGE PERSISTENCE":
  // "Do not spam permission requests immediately on first page load.").
  // `requestOnce()` itself enforces "at most once, ever" regardless of how
  // many times this effect re-fires across profile switches.
  useEffect(() => {
    if (!activeProfile) return;
    void new BrowserPersistentStorageRequester().requestOnce();
  }, [activeProfile]);

  if (activeProfile === undefined) {
    // Resolving from IndexedDB — near-instant in practice, but a bare
    // blank frame would still be a visible flash on a slow device.
    return (
      <div className="text-muted-foreground flex min-h-full flex-1 items-center justify-center text-sm">
        Loading…
      </div>
    );
  }

  if (profiles.length === 0) {
    return <FirstRunScreen />;
  }

  if (activeProfile === null) {
    return <ProfilePicker />;
  }

  return (
    <div className="flex min-h-full flex-col">
      <Header activeProfile={activeProfile} profiles={profiles} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {children}
      </main>
    </div>
  );
}

export function AppShell({
  children,
  databaseName,
}: {
  children: ReactNode;
  databaseName?: string;
}) {
  return (
    <ProfileProvider databaseName={databaseName}>
      <AppShellContent>{children}</AppShellContent>
    </ProfileProvider>
  );
}
