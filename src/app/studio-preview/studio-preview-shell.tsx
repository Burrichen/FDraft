"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import DraftsPage from "@/app/(app)/drafts/page";
import DraftHistoryPage from "@/app/(app)/drafts/history/page";
import { NewDraftView } from "@/app/(app)/drafts/new/new-draft-view";
import { HalloweenPageClient } from "@/app/(app)/events/halloween/halloween-page-client";
import { SettingsView } from "@/app/(app)/settings/settings-view";
import { StatsView } from "@/app/(app)/stats/stats-view";
import { WatchlistView } from "@/app/(app)/watchlist/watchlist-view";
import {
  loadStudioFixture,
  type StudioFixtureResult,
} from "@/application/event-studio/studio-fixtures";
import { DEFAULT_EVENT_STUDIO_PRESET_ID } from "@/components/events/event-studio-presets";
import { EventDiscoveryProvider } from "@/components/events/event-discovery-provider";
import { EventEndingDialog } from "@/components/events/event-ending-dialog";
import { EventIntroDialog } from "@/components/events/event-intro-dialog";
import { EventPageView } from "@/components/events/event-page-view";
import {
  ProfileProvider,
  useProfileContext,
} from "@/components/profiles/profile-provider";
import { WatchUndoProvider } from "@/components/watch-undo/watch-undo-provider";
import type { StudioPageId } from "@/domain/event-studio/studio-pages";
import {
  F_YOU_ITS_JANUARY_EVENT_ID,
  HALLOWEEN_EVENT_ID,
  getEventDefinition,
} from "@/domain/events/event-registry";
import { isEventStudioBuild } from "@/lib/event-studio-build";

/**
 * Every registered Event that has a real, dedicated page component — see
 * docs/updates, "EVENT STUDIO — PHASE 3" §3: "selecting a page renders the
 * REAL corresponding component." An event id with no entry here (a future
 * event, or one with no `page` yet) falls through to
 * `NoEventPagePlaceholder` below rather than guessing at a component —
 * exactly Christmas's situation today (real art/theme scaffolding, no
 * page component at all).
 */
const EVENT_PAGE_COMPONENTS: Record<string, ComponentType> = {
  [HALLOWEEN_EVENT_ID]: HalloweenPageClient,
  [F_YOU_ITS_JANUARY_EVENT_ID]: () => (
    <EventPageView eventId={F_YOU_ITS_JANUARY_EVENT_ID} />
  ),
};

function NoEventPagePlaceholder({ presetId }: { presetId: string }) {
  const event = getEventDefinition(presetId);
  return (
    <p className="text-muted-foreground text-sm">
      {event
        ? `"${event.name}" has no dedicated Event Page component yet.`
        : `"${presetId}" isn't a registered Event — nothing to preview here.`}
    </p>
  );
}

function NoEventEndingPlaceholder({ presetId }: { presetId: string }) {
  const event = getEventDefinition(presetId);
  return (
    <p className="text-muted-foreground text-sm">
      {event
        ? `"${event.name}" has no defined ending experience yet.`
        : `"${presetId}" isn't a registered Event — nothing to preview here.`}
    </p>
  );
}

/**
 * Mirrors `AppShellContent`'s real `<main>` wrapper exactly (see
 * `src/components/app-shell.tsx`) — same max-width/padding, so a page
 * previewed here lays out identically to normal Beta, satisfying §8's
 * "SAME shared renderer" requirement at the layout level too, not just
 * the component level.
 */
function PreviewPageFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {children}
      </main>
    </div>
  );
}

function renderPageContent(
  pageId: StudioPageId,
  presetId: string,
  renderNewDraftForm: boolean,
): ReactNode {
  switch (pageId) {
    case "watchlist":
      return <WatchlistView />;
    case "drafts":
      return renderNewDraftForm ? <NewDraftView /> : <DraftsPage />;
    case "eventPage": {
      const Component = EVENT_PAGE_COMPONENTS[presetId];
      return Component ? (
        <Component />
      ) : (
        <NoEventPagePlaceholder presetId={presetId} />
      );
    }
    case "history":
      return <DraftHistoryPage />;
    case "stats":
      return <StatsView />;
    case "settings":
    case "profile":
      // No dedicated `/profile` route exists in FDraft today — Settings'
      // own profile section is the real, reachable place profile identity
      // is shown/edited, so the "Profile" pseudo-page reuses it rather
      // than fabricating a page that doesn't exist (see §3, a deliberate
      // scoping choice — flagged in the Phase 3 report).
      return <SettingsView />;
    case "introModal": {
      const event = getEventDefinition(presetId);
      return (
        <>
          <WatchlistView />
          <EventIntroDialog />
          {!event ? <NoEventPagePlaceholder presetId={presetId} /> : null}
        </>
      );
    }
    case "endingModal": {
      const event = getEventDefinition(presetId);
      return (
        <>
          <WatchlistView />
          <EventEndingDialog />
          {!event?.ending?.enabled ? (
            <NoEventEndingPlaceholder presetId={presetId} />
          ) : null}
        </>
      );
    }
    default:
      return null;
  }
}

function StudioPreviewContent({
  pageId,
  presetId,
  renderNewDraftForm,
}: {
  pageId: StudioPageId;
  presetId: string;
  renderNewDraftForm: boolean;
}) {
  const { activeProfile } = useProfileContext();

  if (activeProfile === undefined) {
    return null;
  }
  if (!activeProfile) {
    return (
      <p className="text-muted-foreground p-6 text-sm">
        No preview profile found — try reselecting the page or preset.
      </p>
    );
  }

  return (
    <WatchUndoProvider key={activeProfile.id}>
      <PreviewPageFrame>
        {renderPageContent(pageId, presetId, renderNewDraftForm)}
      </PreviewPageFrame>
    </WatchUndoProvider>
  );
}

/**
 * Reads `?db=&page=&state=&preset=` off the URL (set by `StudioPageClient`,
 * the parent editor shell) and drives the whole preview lifecycle: reseed
 * the throwaway fixture database on every page/state/preset change (see
 * `loadStudioFixture`), then mount the REAL provider stack
 * (`ProfileProvider` -> `EventDiscoveryProvider` -> `WatchUndoProvider`,
 * matching `AppShell`'s own nesting exactly) around the REAL page
 * component for the selected page — see docs/updates, "EVENT STUDIO —
 * PHASE 3" §1/§6/§8.
 */
export function StudioPreviewShell() {
  const searchParams = useSearchParams();
  const databaseName = searchParams.get("db") ?? "";
  const pageId = (searchParams.get("page") ?? "watchlist") as StudioPageId;
  const stateId = searchParams.get("state") ?? "";
  const presetId = searchParams.get("preset") ?? DEFAULT_EVENT_STUDIO_PRESET_ID;

  const [fixture, setFixture] = useState<StudioFixtureResult | null>(null);

  useEffect(() => {
    if (!databaseName || !stateId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a fresh page/state/preset means a new fixture is now loading, same accepted pattern as `useAsyncData`.
    setFixture(null);
    void loadStudioFixture(databaseName, { presetId, pageId, stateId }).then(
      (result) => {
        if (!cancelled) setFixture(result);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [databaseName, pageId, stateId, presetId]);

  if (!isEventStudioBuild) {
    // Defense in depth, same as `StudioPageClient` (see §6: "Normal FDraft
    // must not contain it") — this route is never linked to from normal
    // FDraft, but a direct visit on a normal build must still show
    // nothing real.
    return (
      <p className="text-muted-foreground p-6 text-sm">
        Event Studio is only available in FDraft (Dev).
      </p>
    );
  }

  if (!databaseName || !fixture) {
    return (
      <p className="text-muted-foreground p-6 text-sm">Preparing preview…</p>
    );
  }

  return (
    <ProfileProvider databaseName={databaseName}>
      <EventDiscoveryProvider>
        <StudioPreviewContent
          pageId={pageId}
          presetId={presetId}
          renderNewDraftForm={fixture.renderNewDraftForm}
        />
      </EventDiscoveryProvider>
    </ProfileProvider>
  );
}
