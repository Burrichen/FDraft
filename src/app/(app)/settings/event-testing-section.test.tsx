import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { getEventDateOverride } from "@/application/events/event-date-override-store";
import { EventDiscoveryProvider } from "@/components/events/event-discovery-provider";
import { ProfileProvider } from "@/components/profiles/profile-provider";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import { EventTestingSection } from "./event-testing-section";

const PROFILE_ID = "alex";

function Harness({ databaseName }: { databaseName: string }) {
  return (
    <ProfileProvider databaseName={databaseName}>
      <EventDiscoveryProvider>
        <EventTestingSection />
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

describe("EventTestingSection", () => {
  afterEach(() => {
    cleanup();
  });

  it("defaults to Off with no indicator when nothing has been configured", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByLabelText("Event Date Override")).toHaveValue("off"),
    );
    expect(screen.queryByText(/test date active/i)).not.toBeInTheDocument();
  });

  it("selecting the Halloween preset persists an enabled override safely inside its window, and shows the indicator", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    const user = userEvent.setup();

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByLabelText("Event Date Override")).toBeInTheDocument(),
    );

    await user.selectOptions(
      screen.getByLabelText("Event Date Override"),
      "halloween",
    );

    await waitFor(() =>
      expect(screen.getByText(/test date active/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/test date active/i).textContent).toMatch(
      /halloween/i,
    );

    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    const override = await getEventDateOverride(repos, PROFILE_ID);
    await db.close();

    expect(override.enabled).toBe(true);
    expect(override.eventId).toBe("halloween");
    const simulated = new Date(override.simulatedDate!);
    // Comfortably inside Halloween's registered window (30 Sep – 2 Nov 2026).
    expect(simulated.getTime()).toBeGreaterThan(
      new Date("2026-09-30T19:00:00.000Z").getTime(),
    );
    expect(simulated.getTime()).toBeLessThan(
      new Date("2026-11-03T00:00:00.000Z").getTime(),
    );
  });

  it("selecting the January preset persists an enabled override safely inside its window", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    const user = userEvent.setup();

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByLabelText("Event Date Override")).toBeInTheDocument(),
    );

    await user.selectOptions(
      screen.getByLabelText("Event Date Override"),
      "f-you-its-january",
    );

    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    const override = await getEventDateOverride(repos, PROFILE_ID);
    await db.close();

    expect(override.enabled).toBe(true);
    expect(override.eventId).toBe("f-you-its-january");
    // 25–31 January, any year — check month/day only.
    const simulated = new Date(override.simulatedDate!);
    expect(simulated.getUTCMonth()).toBe(0); // January
    expect(simulated.getUTCDate()).toBeGreaterThanOrEqual(25);
    expect(simulated.getUTCDate()).toBeLessThanOrEqual(31);
  });

  it("editing the manual date field updates the simulated date without changing the selected event", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    const user = userEvent.setup();

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByLabelText("Event Date Override")).toBeInTheDocument(),
    );
    await user.selectOptions(
      screen.getByLabelText("Event Date Override"),
      "halloween",
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Simulated Event Date")).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText("Simulated Event Date"), {
      target: { value: "2026-10-31T23:30" },
    });

    await waitFor(async () => {
      const db = new FDraftLocalDatabase(databaseName);
      const repos = createLocalRepositories(db);
      const override = await getEventDateOverride(repos, PROFILE_ID);
      await db.close();
      expect(override.eventId).toBe("halloween");
      expect(override.simulatedDate).toBe("2026-10-31T23:30:00.000Z");
    });
  });

  it("selecting Off preserves the configuration, and re-selecting the same event restores the exact same simulated date", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    const user = userEvent.setup();

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByLabelText("Event Date Override")).toBeInTheDocument(),
    );
    await user.selectOptions(
      screen.getByLabelText("Event Date Override"),
      "halloween",
    );
    await waitFor(() =>
      expect(screen.getByText(/test date active/i)).toBeInTheDocument(),
    );

    const db1 = new FDraftLocalDatabase(databaseName);
    const repos1 = createLocalRepositories(db1);
    const beforeOff = await getEventDateOverride(repos1, PROFILE_ID);
    await db1.close();

    await user.selectOptions(
      screen.getByLabelText("Event Date Override"),
      "off",
    );
    await waitFor(() =>
      expect(screen.queryByText(/test date active/i)).not.toBeInTheDocument(),
    );

    const db2 = new FDraftLocalDatabase(databaseName);
    const repos2 = createLocalRepositories(db2);
    const afterOff = await getEventDateOverride(repos2, PROFILE_ID);
    await db2.close();
    expect(afterOff.enabled).toBe(false);
    expect(afterOff.eventId).toBe(beforeOff.eventId);
    expect(afterOff.simulatedDate).toBe(beforeOff.simulatedDate);

    await user.selectOptions(
      screen.getByLabelText("Event Date Override"),
      "halloween",
    );
    await waitFor(() =>
      expect(screen.getByText(/test date active/i)).toBeInTheDocument(),
    );

    const db3 = new FDraftLocalDatabase(databaseName);
    const repos3 = createLocalRepositories(db3);
    const restored = await getEventDateOverride(repos3, PROFILE_ID);
    await db3.close();
    expect(restored.simulatedDate).toBe(beforeOff.simulatedDate);
  });
});
