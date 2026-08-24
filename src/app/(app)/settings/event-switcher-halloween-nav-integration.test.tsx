import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventDiscoveryProvider } from "@/components/events/event-discovery-provider";
import { NavLinks } from "@/components/layout/nav-links";
import { ProfileProvider } from "@/components/profiles/profile-provider";
import { HALLOWEEN_EVENT_ID } from "@/domain/events/event-registry";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import { EventSwitcherSection } from "./event-switcher-section";

const PROFILE_ID = "alex";

/**
 * Renders `NavLinks` and `EventSwitcherSection` UNDER THE SAME
 * `EventDiscoveryProvider` — exactly like `AppShell` does in production
 * (the nav bar and every routed page/Settings section all share ONE
 * provider mounted above them, and neither the provider nor the nav bar
 * remounts when navigating between pages). This is what makes the
 * regression test below meaningful: both components read the exact same
 * shared snapshot, so if joining doesn't update it, the assertion catches
 * it immediately — no unmount/remount trick needed.
 */
function AppHarness({ databaseName }: { databaseName: string }) {
  return (
    <ProfileProvider databaseName={databaseName}>
      <EventDiscoveryProvider>
        <NavLinks />
        <EventSwitcherSection />
      </EventDiscoveryProvider>
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
  await db.close();
}

describe("Settings Event Switcher → nav tab → Halloween page (EVENT LIFECYCLE REPAIR, full journey)", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  // THE regression test for the root cause of "Halloween can be
  // enabled/joined but no Halloween page/navigation destination appears"
  // (see docs/updates, "EVENT LIFECYCLE REPAIR" §1-4): the nav tab used to
  // only reflect a join after a full remount, because it read `EventSettings`
  // through its own independent, never-invalidated fetch. `NavLinks` now
  // reads the SAME shared `EventDiscoveryProvider` snapshot as
  // `EventSwitcherSection`'s own join action, so this proves the tab
  // appears the moment "Let me in." is clicked — no unmount, no remount,
  // no reload anywhere in this test.
  it("joining Halloween from Settings makes the nav tab appear immediately, with no remount", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T12:00:00.000Z"));
    const user = userEvent.setup();

    render(<AppHarness databaseName={databaseName} />);

    // Before joining: no Halloween nav tab, and Settings lists it as
    // available to join. `findByRole` (retrying), not `getByRole` — the
    // "Available now" heading itself renders before the shared
    // discovery snapshot resolves, so a plain `getByRole` right after
    // could run against a still-empty list.
    const joinButton = await screen.findByRole("button", {
      name: "Let me in.",
    });
    expect(
      screen.queryByRole("link", { name: /halloween/i }),
    ).not.toBeInTheDocument();
    await user.click(joinButton);

    // Immediately — same render tree, no unmount/remount, no reload.
    const halloweenTab = await screen.findByRole("link", {
      name: /halloween/i,
    });
    expect(halloweenTab).toHaveAttribute("href", "/events/halloween");
    expect(halloweenTab.querySelector("svg")).not.toBeNull();
    expect(halloweenTab.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);

    await waitFor(() =>
      expect(screen.getByText("Current Event")).toBeInTheDocument(),
    );

    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    const participations = await repos.settings.get(
      PROFILE_ID,
      "events.participations",
    );
    await db.close();
    expect(
      (participations as Record<string, string> | null)?.[
        `${HALLOWEEN_EVENT_ID}:2026`
      ],
    ).toBe("joined");
  });
});
