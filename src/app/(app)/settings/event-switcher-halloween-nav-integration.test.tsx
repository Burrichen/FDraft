import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventPageView } from "@/components/events/event-page-view";
import { NavLinks } from "@/components/layout/nav-links";
import { ProfileProvider } from "@/components/profiles/profile-provider";
import { WatchUndoProvider } from "@/components/watch-undo/watch-undo-provider";
import { HALLOWEEN_EVENT_ID } from "@/domain/events/event-registry";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import { EventSwitcherSection } from "./event-switcher-section";

const PROFILE_ID = "alex";

function SettingsHarness({ databaseName }: { databaseName: string }) {
  return (
    <ProfileProvider databaseName={databaseName}>
      <NavLinks />
      <EventSwitcherSection />
    </ProfileProvider>
  );
}

function HalloweenPageHarness({ databaseName }: { databaseName: string }) {
  return (
    <ProfileProvider databaseName={databaseName}>
      <WatchUndoProvider>
        <EventPageView eventId={HALLOWEEN_EVENT_ID} />
      </WatchUndoProvider>
    </ProfileProvider>
  );
}

async function seedProfile(databaseName: string) {
  const db = new FDraftLocalDatabase(databaseName);
  const repos = createLocalRepositories(db);
  await repos.profiles.create({
    id: PROFILE_ID,
    displayName: "Alex",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastOpenedAt: "2026-01-01T00:00:00.000Z",
    timezone: "UTC",
    settings: {
      reducedMotion: false,
      defaultPage: "watchlist",
      franchiseChronologicalOrder: false,
      adminMode: false,
      halloweenPumpkinState: "uncarved",
    },
    dataVersion: 1,
  });
  await repos.settings.set(PROFILE_ID, "events.settings", {
    eventsEnabled: false,
    eventVisualsEnabled: false,
    activeEvent: null,
    manuallyEnabledEvents: [],
  });
  await db.close();
}

describe("Settings Event Switcher → nav tab → Halloween page (PROMPT 21, full journey)", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("joining Halloween in Settings, then reopening the app, shows the nav tab and a live Halloween page", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T12:00:00.000Z"));
    const user = userEvent.setup();

    const settings = render(<SettingsHarness databaseName={databaseName} />);

    // Before joining: no Halloween nav tab yet.
    await waitFor(() =>
      expect(screen.getByText("Watchlist")).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("link", { name: /halloween/i }),
    ).not.toBeInTheDocument();

    const joinButton = await screen.findByRole("button", {
      name: "Let me in.",
    });
    await user.click(joinButton);

    await waitFor(async () => {
      const db = new FDraftLocalDatabase(databaseName);
      const repos = createLocalRepositories(db);
      const eventSettings = await repos.settings.get(
        PROFILE_ID,
        "events.settings",
      );
      await db.close();
      expect(
        (eventSettings as { activeEvent: string | null } | null)?.activeEvent,
      ).toBe(HALLOWEEN_EVENT_ID);
    });

    settings.unmount();
    cleanup();

    // Reopening the app (a fresh mount against the same, now-joined
    // database) is what makes the nav bar's own independent event-settings
    // fetch reflect the join — see docs/updates, "PROMPT 21", live QA
    // finding.
    render(<SettingsHarness databaseName={databaseName} />);
    const halloweenTab = await screen.findByRole("link", {
      name: /halloween/i,
    });
    expect(halloweenTab).toHaveAttribute("href", "/events/halloween");
    expect(halloweenTab.querySelector("svg")).not.toBeNull();
    expect(halloweenTab.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);

    cleanup();

    // Navigating to it (the real Halloween page's shared shell) shows the
    // opted-in Halloween content, not the join prompt.
    render(<HalloweenPageHarness databaseName={databaseName} />);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Halloween" }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText("Available now")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Let me in.",
      }),
    ).not.toBeInTheDocument();
  });
});
