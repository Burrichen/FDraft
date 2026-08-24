import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EventDiscoveryProvider } from "@/components/events/event-discovery-provider";
import { ProfileProvider } from "@/components/profiles/profile-provider";
import {
  F_YOU_ITS_JANUARY_EVENT_ID,
  HALLOWEEN_EVENT_ID,
  SIGNAL_FROM_BEYOND_EVENT_ID,
} from "@/domain/events/event-registry";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import { NavLinks } from "./nav-links";
import { useNavItems } from "./use-nav-items";

const PROFILE_ID = "alex";

function Harness({ databaseName }: { databaseName: string }) {
  return (
    <ProfileProvider databaseName={databaseName}>
      <EventDiscoveryProvider>
        <NavLinks />
      </EventDiscoveryProvider>
    </ProfileProvider>
  );
}

/** Renders whatever `useNavItems()` resolves to as plain text, so a test can assert on its per-item fields (e.g. `activeIconClassName`) without needing a real Next App Router pathname context — see docs/updates, "PROMPT 20 — HIGH-EFFORT HALLOWEEN UI". */
function NavItemsProbe() {
  const items = useNavItems();
  return (
    <ul>
      {items.map((item) => (
        <li key={item.href}>
          {item.href} | {item.activeIconClassName ?? "default-green"} |{" "}
          {item.activeUnderlineClassName ?? "default-green"}
        </li>
      ))}
    </ul>
  );
}

function ProbeHarness({ databaseName }: { databaseName: string }) {
  return (
    <ProfileProvider databaseName={databaseName}>
      <EventDiscoveryProvider>
        <NavItemsProbe />
      </EventDiscoveryProvider>
    </ProfileProvider>
  );
}

/**
 * Seeds a profile joined to `activeEvent`, if given. This file never fakes
 * timers, so occurrence keys are computed against whatever the REAL
 * current year is at test-run time — `new Date().getFullYear()`, not a
 * hardcoded year — so the suite stays correct regardless of when it
 * actually runs. `manuallyEnabledEvents` is also seeded (as the pre-
 * existing tests already did) so a manual-only event with no natural
 * window at all (Signal from Beyond) still resolves as joined via the
 * fallback `event-discovery.ts` uses for that case.
 */
async function seedProfile(
  databaseName: string,
  eventSettings?: {
    eventsEnabled: boolean;
    activeEvent: string | null;
  },
) {
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
  if (eventSettings) {
    await repos.settings.set(PROFILE_ID, "events.settings", {
      eventsEnabled: eventSettings.eventsEnabled,
      eventVisualsEnabled: false,
      activeEvent: eventSettings.activeEvent,
      manuallyEnabledEvents: eventSettings.activeEvent
        ? [eventSettings.activeEvent]
        : [],
    });
    if (eventSettings.activeEvent) {
      const year = new Date().getFullYear();
      await repos.settings.set(PROFILE_ID, "events.participations", {
        [`${eventSettings.activeEvent}:${year}`]: "joined",
      });
    }
  }
  await db.close();
}

describe("NavLinks — temporary Event navigation item (PROMPT 18)", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows only the base nav items when no event is active", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByText("Watchlist")).toBeInTheDocument(),
    );
    expect(screen.getAllByRole("link")).toHaveLength(4);
    expect(screen.queryByText("Halloween")).not.toBeInTheDocument();
    expect(screen.queryByText("January")).not.toBeInTheDocument();
  });

  it("shows a Halloween tab, linking to its route, with a real non-emoji SVG icon, when opted into Halloween", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName, {
      eventsEnabled: true,
      activeEvent: HALLOWEEN_EVENT_ID,
    });

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByText("Halloween")).toBeInTheDocument(),
    );
    const link = screen.getByRole("link", { name: /halloween/i });
    expect(link).toHaveAttribute("href", "/events/halloween");
    const icon = link.querySelector("svg");
    expect(icon).not.toBeNull();
    // No emoji anywhere in the tab's own text content.
    expect(link.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });

  it("shows a January tab, linking to its route, with a real non-emoji SVG trash can icon (not the old Snowflake), when opted into January", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName, {
      eventsEnabled: true,
      activeEvent: F_YOU_ITS_JANUARY_EVENT_ID,
    });

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByText("January")).toBeInTheDocument(),
    );
    const link = screen.getByRole("link", { name: /january/i });
    expect(link).toHaveAttribute("href", "/events/january");
    const icon = link.querySelector("svg");
    expect(icon).not.toBeNull();
    // The trash can (see nav-icons.tsx's JanuaryTrashCanNavIcon) has a
    // dedicated lid group; lucide's old Snowflake icon never did.
    expect(icon?.querySelector(".nav-icon-trash-lid")).not.toBeNull();
    expect(link.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });

  it("shows no extra tab for an active event with no dedicated page (Signal from Beyond)", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName, {
      eventsEnabled: true,
      activeEvent: SIGNAL_FROM_BEYOND_EVENT_ID,
    });

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByText("Watchlist")).toBeInTheDocument(),
    );
    expect(screen.getAllByRole("link")).toHaveLength(4);
  });

  // REVERSED (see docs/updates, "EVENT LIFECYCLE REPAIR" §9): "Do not use
  // Visuals or Gameplay toggles to determine whether the joined Event page
  // exists... Neither should accidentally unregister the page." The old
  // version of this test asserted the OPPOSITE — that turning off
  // `eventsEnabled` hid the tab — which was itself an instance of exactly
  // the coupling this phase removes. Page/nav visibility is now purely
  // participation + availability(-or-manual), never the Gameplay toggle.
  it("the tab stays visible even with Event Gameplay turned off, as long as the occurrence is still joined and active", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName, {
      eventsEnabled: false,
      activeEvent: HALLOWEEN_EVENT_ID,
    });

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByText("Halloween")).toBeInTheDocument(),
    );
  });
});

describe("useNavItems — Halloween active-accent override (PROMPT 20)", () => {
  afterEach(() => {
    cleanup();
  });

  it("gives Halloween's nav item its own pumpkin-orange active accent, not the generic green", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName, {
      eventsEnabled: true,
      activeEvent: HALLOWEEN_EVENT_ID,
    });

    render(<ProbeHarness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByText(/\/events\/halloween/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/\/events\/halloween/).textContent).toContain(
      "text-halloween-pumpkin",
    );
    expect(screen.getByText(/\/events\/halloween/).textContent).toContain(
      "bg-halloween-pumpkin",
    );
  });

  it("leaves every static nav item on the default green accent", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);

    render(<ProbeHarness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByText(/\/watchlist/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/\/watchlist/).textContent).toContain(
      "default-green",
    );
  });
});
