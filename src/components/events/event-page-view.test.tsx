import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventDiscoveryProvider } from "@/components/events/event-discovery-provider";
import { ProfileProvider } from "@/components/profiles/profile-provider";
import { WatchUndoProvider } from "@/components/watch-undo/watch-undo-provider";
import {
  F_YOU_ITS_JANUARY_EVENT_ID,
  HALLOWEEN_EVENT_ID,
} from "@/domain/events/event-registry";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import { EventPageView } from "./event-page-view";

const PROFILE_ID = "alex";

function Harness({
  databaseName,
  eventId,
}: {
  databaseName: string;
  eventId: string;
}) {
  return (
    <ProfileProvider databaseName={databaseName}>
      <EventDiscoveryProvider>
        <WatchUndoProvider>
          <EventPageView eventId={eventId} />
        </WatchUndoProvider>
      </EventDiscoveryProvider>
    </ProfileProvider>
  );
}

async function seedProfile(
  databaseName: string,
  eventSettings?: { activeEvent: string },
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
    // Seeded as a MANUAL join (`manuallyEnabledEvents`) — every test using
    // this runs at a simulated moment (2026-06-15, see `beforeEach` below)
    // OUTSIDE both events' natural windows, so this is what makes the
    // "already opted in" tests exercise the pre-existing "manual
    // activation stays active the rest of the year" feature (see
    // `isOccurrenceActiveNow`, docs/updates "EVENT LIFECYCLE REPAIR") —
    // a NATURAL-only join would (correctly) show as inactive here instead.
    await repos.settings.set(PROFILE_ID, "events.settings", {
      eventsEnabled: true,
      eventVisualsEnabled: false,
      activeEvent: eventSettings.activeEvent,
      manuallyEnabledEvents: [eventSettings.activeEvent],
    });
    await repos.settings.set(PROFILE_ID, "events.participations", {
      [`${eventSettings.activeEvent}:2026`]: "joined",
    });
  }
  await db.close();
}

describe("EventPageView (PROMPT 18)", () => {
  beforeEach(() => {
    // A date well outside every event's natural window, for deterministic
    // "not currently active" assertions.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-15T00:00:00.000Z"));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders the event's name, description, and bullets", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);

    render(
      <Harness
        databaseName={databaseName}
        eventId={F_YOU_ITS_JANUARY_EVENT_ID}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("F* You, It's January!")).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/worst week of the cinematic year/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/eligible films: anything rated 3.5 or lower/i),
    ).toBeInTheDocument();
  });

  it("shows 'Returns <date>' and no Join control when not opted in and outside the window (Halloween)", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);

    render(
      <Harness databaseName={databaseName} eventId={HALLOWEEN_EVENT_ID} />,
    );

    await waitFor(() =>
      expect(screen.getByText(/returns 30 september/i)).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", {
        name: "Let me in.",
      }),
    ).not.toBeInTheDocument();
  });

  it("shows a Join button when not opted in but naturally available", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    vi.setSystemTime(new Date("2026-10-15T20:00:00.000Z"));

    render(
      <Harness databaseName={databaseName} eventId={HALLOWEEN_EVENT_ID} />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "Let me in.",
        }),
      ).toBeInTheDocument(),
    );
  });

  it("opted into January shows the profile's Misery Points balance", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName, {
      activeEvent: F_YOU_ITS_JANUARY_EVENT_ID,
    });
    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    await repos.points.setBalance({
      profileId: PROFILE_ID,
      currency: "misery",
      total: 12,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await db.close();

    render(
      <Harness
        databaseName={databaseName}
        eventId={F_YOU_ITS_JANUARY_EVENT_ID}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText(/your balance/i)).toBeInTheDocument(),
    );
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("opted into Halloween shows the empty-state placeholder and its real (currently 0) Haunted Points balance — this generic shell isn't what production actually routes Halloween through (see halloween-page-client.tsx), but proves the balance card correctly reflects Halloween now having a real `currency` configured", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName, { activeEvent: HALLOWEEN_EVENT_ID });

    render(
      <Harness databaseName={databaseName} eventId={HALLOWEEN_EVENT_ID} />,
    );

    await waitFor(() =>
      expect(screen.getByText(/nothing here yet/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/haunted points/i)).toBeInTheDocument();
  });
});

describe("EventPageView — always renders THAT PAGE'S own event identity, never another event's (regression, PROMPT B2.1 §2)", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("the Halloween page's heading is always 'Halloween', even while the profile is actively opted into January", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName, {
      activeEvent: F_YOU_ITS_JANUARY_EVENT_ID,
    });

    render(
      <Harness databaseName={databaseName} eventId={HALLOWEEN_EVENT_ID} />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Halloween" }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText("F* You, It's January!")).not.toBeInTheDocument();
  });

  it("the January page's heading is always 'F* You, It's January!', even while the profile is actively opted into Halloween", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName, { activeEvent: HALLOWEEN_EVENT_ID });

    render(
      <Harness
        databaseName={databaseName}
        eventId={F_YOU_ITS_JANUARY_EVENT_ID}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "F* You, It's January!" }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText("Halloween")).not.toBeInTheDocument();
  });
});
