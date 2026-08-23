import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileProvider } from "@/components/profiles/profile-provider";
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
      <EventPageView eventId={eventId} />
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
    await repos.settings.set(PROFILE_ID, "events.settings", {
      eventsEnabled: true,
      eventVisualsEnabled: false,
      activeEvent: eventSettings.activeEvent,
      manuallyEnabledEvents: [],
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
        name: "I want to join the Halloween Event",
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
          name: "I want to join the Halloween Event",
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

  it("opted into Halloween shows the empty-state placeholder and no points balance (pointType is null)", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName, { activeEvent: HALLOWEEN_EVENT_ID });

    render(
      <Harness databaseName={databaseName} eventId={HALLOWEEN_EVENT_ID} />,
    );

    await waitFor(() =>
      expect(screen.getByText(/nothing here yet/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/points/i)).not.toBeInTheDocument();
  });
});
