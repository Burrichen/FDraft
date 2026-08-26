import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { setEventDateOverride } from "@/application/events/event-date-override-store";
import { setEventParticipation } from "@/application/events/event-participation-store";
import { isEventEndingAcknowledged } from "@/application/events/event-ending-acknowledgement-store";
import { EventDiscoveryProvider } from "@/components/events/event-discovery-provider";
import { ProfileProvider } from "@/components/profiles/profile-provider";
import { WatchUndoProvider } from "@/components/watch-undo/watch-undo-provider";
import {
  F_YOU_ITS_JANUARY_EVENT_ID,
  HALLOWEEN_EVENT_ID,
} from "@/domain/events/event-registry";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import { EventEndingDialog } from "./event-ending-dialog";

const PROFILE_ID = "alex";
const MAIN_MESSAGE =
  "The dark cloud over FDraft finally parts, leaving a brisk chill in the air. It's passed, but you get the feeling it'll be back again soon.";

function Harness({ databaseName }: { databaseName: string }) {
  return (
    <ProfileProvider databaseName={databaseName}>
      <EventDiscoveryProvider>
        <WatchUndoProvider>
          <EventEndingDialog />
          <p>Page content</p>
        </WatchUndoProvider>
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
      adminMode: true,
      halloweenPumpkinState: "uncarved",
    },
    dataVersion: 1,
  });
  await db.close();
}

async function setHalloweenSimulatedDate(
  databaseName: string,
  simulatedDate: string,
) {
  const db = new FDraftLocalDatabase(databaseName);
  const repos = createLocalRepositories(db);
  await setEventDateOverride(repos, PROFILE_ID, {
    enabled: true,
    eventId: HALLOWEEN_EVENT_ID,
    simulatedDate,
  });
  await db.close();
}

async function joinOccurrence(databaseName: string, occurrenceKey: string) {
  const db = new FDraftLocalDatabase(databaseName);
  const repos = createLocalRepositories(db);
  await setEventParticipation(repos, PROFILE_ID, occurrenceKey, "joined");
  await db.close();
}

async function declineOccurrence(databaseName: string, occurrenceKey: string) {
  const db = new FDraftLocalDatabase(databaseName);
  const repos = createLocalRepositories(db);
  await setEventParticipation(repos, PROFILE_ID, occurrenceKey, "declined");
  await db.close();
}

describe("EventEndingDialog (real fake-indexeddb)", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows Halloween's exact ending copy once its joined occurrence has expired", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    await joinOccurrence(databaseName, "halloween:2026");
    await setHalloweenSimulatedDate(databaseName, "2026-11-01T00:00:01.000Z");

    render(<Harness databaseName={databaseName} />);

    await waitFor(() =>
      expect(screen.getByText(MAIN_MESSAGE)).toBeInTheDocument(),
    );
    expect(
      screen.getByText("You survived the 1st annual FDraft Halloween event."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "See you next year." }),
    ).toBeInTheDocument();
  });

  it("shows the correct ordinal for a later occurrence year", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    await joinOccurrence(databaseName, "halloween:2028");
    await setHalloweenSimulatedDate(databaseName, "2028-11-01T00:00:01.000Z");

    render(<Harness databaseName={databaseName} />);

    await waitFor(() =>
      expect(
        screen.getByText("You survived the 3rd annual FDraft Halloween event."),
      ).toBeInTheDocument(),
    );
  });

  it("does not show for a declined occurrence", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    await declineOccurrence(databaseName, "halloween:2026");
    await setHalloweenSimulatedDate(databaseName, "2026-11-01T00:00:01.000Z");

    render(<Harness databaseName={databaseName} />);

    await waitFor(() =>
      expect(screen.getByText("Page content")).toBeInTheDocument(),
    );
    expect(screen.queryByText(MAIN_MESSAGE)).not.toBeInTheDocument();
  });

  it("does not show for an unanswered (non-participant) occurrence", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    await setHalloweenSimulatedDate(databaseName, "2026-11-01T00:00:01.000Z");

    render(<Harness databaseName={databaseName} />);

    await waitFor(() =>
      expect(screen.getByText("Page content")).toBeInTheDocument(),
    );
    expect(screen.queryByText(MAIN_MESSAGE)).not.toBeInTheDocument();
  });

  it("does not show while the occurrence is still active (not yet expired)", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    await joinOccurrence(databaseName, "halloween:2026");
    await setHalloweenSimulatedDate(databaseName, "2026-10-31T23:59:00.000Z");

    render(<Harness databaseName={databaseName} />);

    await waitFor(() =>
      expect(screen.getByText("Page content")).toBeInTheDocument(),
    );
    expect(screen.queryByText(MAIN_MESSAGE)).not.toBeInTheDocument();
  });

  it("clicking the dismiss button acknowledges the ending and closes the dialog, persisting the acknowledgement", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    await joinOccurrence(databaseName, "halloween:2026");
    await setHalloweenSimulatedDate(databaseName, "2026-11-01T00:00:01.000Z");
    const user = userEvent.setup();

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByText(MAIN_MESSAGE)).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole("button", { name: "See you next year." }),
    );

    await waitFor(() =>
      expect(screen.queryByText(MAIN_MESSAGE)).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Page content")).toBeInTheDocument();

    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    expect(
      await isEventEndingAcknowledged(repos, PROFILE_ID, "halloween:2026"),
    ).toBe(true);
    await db.close();
  });

  it("pressing Escape does not dismiss the dialog — only the explicit button does", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    await joinOccurrence(databaseName, "halloween:2026");
    await setHalloweenSimulatedDate(databaseName, "2026-11-01T00:00:01.000Z");
    const user = userEvent.setup();

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByText(MAIN_MESSAGE)).toBeInTheDocument(),
    );

    await user.keyboard("{Escape}");

    // Still open — Escape must never silently acknowledge (or ambiguously
    // dismiss) the ending; give React a tick to process any stray event
    // before asserting the negative.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText(MAIN_MESSAGE)).toBeInTheDocument();

    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    expect(
      await isEventEndingAcknowledged(repos, PROFILE_ID, "halloween:2026"),
    ).toBe(false);
    await db.close();
  });

  it("a future event with no ending config never renders anything and never errors", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    await joinOccurrence(databaseName, "f-you-its-january:2026");
    // Push the simulated date outside January's own natural window
    // (25-31 Jan) so its occurrence reads as "expired" (joined, not
    // manually enabled, no longer available) — January has no `ending`
    // config, so this must never render or throw regardless.
    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    await setEventDateOverride(repos, PROFILE_ID, {
      enabled: true,
      eventId: F_YOU_ITS_JANUARY_EVENT_ID,
      simulatedDate: "2026-06-15T00:00:00.000Z",
    });
    await db.close();

    render(<Harness databaseName={databaseName} />);

    await waitFor(() =>
      expect(screen.getByText("Page content")).toBeInTheDocument(),
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
