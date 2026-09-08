"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { loadHalloweenFilmContent } from "@/application/events/halloween-film-content-service";
import { loadEventCategoryFilmContent } from "@/application/events/load-event-category-film-content";
import { setEventCategoryFilmIds } from "@/domain/events/event-category-manifest-overlay";
import {
  CHRISTMAS_FILM_CONTENT,
  JANUARY_FILM_CONTENT,
} from "@/domain/events/event-film-content";
import { getHalloweenManifestFilmIds } from "@/domain/events/halloween-manifest-overlay";
import {
  CHRISTMAS_EVENT_ID,
  F_YOU_ITS_JANUARY_EVENT_ID,
  HALLOWEEN_EVENT_ID,
} from "@/domain/events/event-registry";
import { EventEndingDialog } from "@/components/events/event-ending-dialog";
import { EventIntroDialog } from "@/components/events/event-intro-dialog";
import {
  HalloweenAmbientDecorations,
  useHalloweenAmbientVisible,
} from "@/components/events/halloween-ambient-decorations";
import { EventDiscoveryProvider } from "@/components/events/event-discovery-provider";
import { Header } from "@/components/layout/header";
import { FirstRunScreen } from "@/components/profiles/first-run-screen";
import { ProfilePicker } from "@/components/profiles/profile-picker";
import {
  ProfileProvider,
  useProfileContext,
} from "@/components/profiles/profile-provider";
import { Button } from "@/components/ui/button";
import { UpdateDialog } from "@/components/updates/update-dialog";
import { UpdateProvider } from "@/components/updates/update-provider";
import { WatchUndoProvider } from "@/components/watch-undo/watch-undo-provider";
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
  const { activeProfile, profiles, initError, retryInit, repositories } =
    useProfileContext();
  const halloweenAmbientVisible = useHalloweenAmbientVisible();

  // Only once a real profile is active — never on the bare first-run
  // screen (see docs/product-spec.md, "BROWSER STORAGE PERSISTENCE":
  // "Do not spam permission requests immediately on first page load.").
  // `requestOnce()` itself enforces "at most once, ever" regardless of how
  // many times this effect re-fires across profile switches.
  useEffect(() => {
    if (!activeProfile) return;
    void new BrowserPersistentStorageRequester().requestOnce();
  }, [activeProfile]);

  // Once per app session, independent of which (if any) profile is active
  // — films/their metadata are installation-wide, not per-profile (see
  // `film-repository.ts`), and re-running this on every profile switch
  // would be wasteful for a question that has nothing to do with which
  // profile is active (same rationale as the update checker). Resolves
  // FDraft's bundled, static curated Event film content (see
  // docs/updates, "STATIC EVENT FILM CONTENT PACKS") into local film ids
  // — no network fetch involved at all any more, but still async (a real
  // IndexedDB round trip) and still never throws, so this can never block
  // or break app startup.
  useEffect(() => {
    // January's curated list goes through the SAME generic resolve-or-
    // create pipeline Christmas uses (see docs/updates, "FDRAFT UPDATE 1 —
    // F* YOU, IT'S JANUARY: SIMPLE EVENT MECHANICS" §1/§2), replacing the
    // deleted `loadJanuaryFilmContent`/`resolveManifestFilmIds` pair
    // entirely. That old pipeline only ever RESOLVED an already-imported
    // film, because January's list was merely additive eligibility on top
    // of a profile's own Watchlist; the list is now January's whole
    // authoritative pool, so — exactly like Halloween's and Christmas's
    // pools — a listed film that nobody has imported must still be created
    // locally (title/year only) and enriched by the normal metadata
    // system, without ever touching anyone's Watchlist.
    void loadEventCategoryFilmContent(
      F_YOU_ITS_JANUARY_EVENT_ID,
      { curated: JANUARY_FILM_CONTENT.curated },
      {
        films: repositories.films,
        unresolvedMetadata: repositories.unresolvedMetadata,
      },
    );
    void loadHalloweenFilmContent({
      films: repositories.films,
      unresolvedMetadata: repositories.unresolvedMetadata,
    }).then(() => {
      // Feeds the NEW generic Event category resolver (see docs/updates,
      // "FDRAFT UPDATE 1 — EVENT ONE AT A TIME DRAFTING") from Halloween's
      // already-resolved ids — never a second, redundant resolve-or-create
      // pass over the same `films.json` (see
      // `load-event-category-film-content.ts`'s own doc comment).
      const { horrorFilmIds, kitschFilmIds } = getHalloweenManifestFilmIds();
      setEventCategoryFilmIds(HALLOWEEN_EVENT_ID, {
        horror: horrorFilmIds,
        kitsch: kitschFilmIds,
      });
    });
    void loadEventCategoryFilmContent(
      CHRISTMAS_EVENT_ID,
      {
        classic: CHRISTMAS_FILM_CONTENT.classic,
        adjacent: CHRISTMAS_FILM_CONTENT.adjacent,
      },
      {
        films: repositories.films,
        unresolvedMetadata: repositories.unresolvedMetadata,
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (initError) {
    // IndexedDB itself failed to open — Firefox private browsing, Safari
    // with storage disabled, a corrupt database, a failed schema upgrade.
    // Without this, `activeProfile` would stay `undefined` forever and the
    // app would show "Loading…" permanently, right at its own entry point
    // — see docs/product-spec.md, "COMPLETE PRODUCT AUDIT".
    return (
      <div className="flex min-h-full flex-1 items-center justify-center px-4">
        <div className="border-border flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center">
          <AlertTriangle
            aria-hidden="true"
            className="text-destructive size-8"
          />
          <div className="space-y-1">
            <p className="text-foreground text-sm font-medium">
              Couldn&apos;t open local storage
            </p>
            <p className="text-muted-foreground max-w-sm text-sm">
              FDraft stores everything on this device and couldn&apos;t access
              that storage just now. Private browsing, disabled storage, or a
              full disk can cause this — check your browser&apos;s settings and
              try again.
            </p>
          </div>
          <Button onClick={retryInit} variant="outline">
            Try again
          </Button>
        </div>
      </div>
    );
  }

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
    // Keyed by profile id so switching profiles starts a fresh, empty
    // session-undo map instead of leaking one profile's pending undos into
    // another's — see `WatchUndoProvider`'s doc comment. Mounted above
    // `{children}` (the routed page) rather than inside any one page, so
    // navigating between pages never resets it — only a hard reload does.
    <WatchUndoProvider key={activeProfile.id}>
      <EventIntroDialog key={activeProfile.id} />
      <EventEndingDialog key={activeProfile.id} />
      {halloweenAmbientVisible ? <HalloweenAmbientDecorations /> : null}
      <div className="flex min-h-full flex-col">
        <Header activeProfile={activeProfile} profiles={profiles} />
        <main className="app-shell-width flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </WatchUndoProvider>
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
    // Mounted above `ProfileProvider`, NOT keyed by profile — updates are
    // installation-level (see docs/product-spec.md, "UPDATE SETTING"), so
    // switching profiles must never remount this and trigger a second
    // check within the same session.
    <UpdateProvider>
      <ProfileProvider databaseName={databaseName}>
        <EventDiscoveryProvider>
          <AppShellContent>{children}</AppShellContent>
        </EventDiscoveryProvider>
      </ProfileProvider>
      <UpdateDialog />
    </UpdateProvider>
  );
}
