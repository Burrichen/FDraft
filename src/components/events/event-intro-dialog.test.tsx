import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalDraft } from "@/application/drafts/local-draft-service";
import { getEventDismissals } from "@/application/events/event-dismissal-store";
import { getEventSettings } from "@/application/events/event-settings-store";
import {
  F_YOU_ITS_JANUARY_EVENT_ID,
  HALLOWEEN_EVENT_ID,
} from "@/domain/events/event-registry";
import { ProfileProvider } from "@/components/profiles/profile-provider";
import { WatchUndoProvider } from "@/components/watch-undo/watch-undo-provider";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import { EventIntroDialog } from "./event-intro-dialog";

const EVENT_NAME = "F* You, It's January!";
const PROFILE_ID = "alex";

function Harness({ databaseName }: { databaseName: string }) {
  return (
    <ProfileProvider databaseName={databaseName}>
      <WatchUndoProvider>
        <EventIntroDialog />
        <p>Page content</p>
      </WatchUndoProvider>
    </ProfileProvider>
  );
}

async function seedProfile(
  databaseName: string,
  eventsEnabled: boolean,
  eventVisualsEnabled = false,
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
  await repos.settings.set(PROFILE_ID, "events.settings", {
    eventsEnabled,
    eventVisualsEnabled,
    activeEvent: null,
    manuallyEnabledEvents: [],
  });
  await db.close();
}

async function seedActiveDraft(databaseName: string) {
  const db = new FDraftLocalDatabase(databaseName);
  const repos = createLocalRepositories(db);
  for (let i = 0; i < 2; i++) {
    const filmId = `film-${i}`;
    await repos.films.create({
      id: filmId,
      title: `Film ${i}`,
      releaseYear: 2000 + i,
      letterboxdSlug: filmId,
      letterboxdUri: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await repos.watchlist.createEntry({
      id: `entry-${i}`,
      profileId: PROFILE_ID,
      filmId,
      dateAdded: "2026-01-01",
      position: i,
      isActive: true,
      selectionWeight: 1,
      importSource: null,
      importId: null,
      removedAt: null,
      removedReason: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  }
  const created = await createLocalDraft(repos, {
    profileId: PROFILE_ID,
    timezone: "UTC",
    config: {
      difficulty: "baby",
      timeMode: "timer",
      randomCount: 2,
      challengeCount: 0,
    },
  });
  await db.close();
  if (!created.ok) throw new Error("unreachable — draft creation failed");
  return created.draftId;
}

describe("EventIntroDialog (real fake-indexeddb)", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.useRealTimers();
  });

  it("Event Switcher off — no intro modal, even in January", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName, false);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-27T00:00:00.000Z"));

    render(<Harness databaseName={databaseName} />);

    await waitFor(() =>
      expect(screen.getByText("Page content")).toBeInTheDocument(),
    );
    expect(screen.queryByText(EVENT_NAME)).not.toBeInTheDocument();
  });

  it("Event Switcher on, newly available event — the intro modal appears with its own content", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName, true);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-27T00:00:00.000Z"));

    render(<Harness databaseName={databaseName} />);

    await waitFor(() =>
      expect(screen.getByText(EVENT_NAME)).toBeInTheDocument(),
    );
    expect(
      screen.getAllByText(/permanent Misery Points/i).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Opt In" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nah" })).toBeInTheDocument();
    expect(screen.getByText(/isn't permanent/i)).toBeInTheDocument();
  });

  it("Event visuals disabled — the intro modal shows the event's real name/content but no themed icon", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName, true, false);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-27T00:00:00.000Z"));

    render(<Harness databaseName={databaseName} />);

    await waitFor(() =>
      expect(screen.getByText(EVENT_NAME)).toBeInTheDocument(),
    );
    const title = screen.getByRole("heading", { name: EVENT_NAME });
    expect(title.querySelector("svg")).not.toBeInTheDocument();
  });

  it("Event visuals enabled — the intro modal shows the event's configured themed icon", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName, true, true);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-27T00:00:00.000Z"));

    render(<Harness databaseName={databaseName} />);

    await waitFor(() =>
      expect(screen.getByText(EVENT_NAME)).toBeInTheDocument(),
    );
    const title = screen.getByRole("heading", { name: EVENT_NAME });
    expect(title.querySelector("svg")).toBeInTheDocument();
  });

  it("Opt In with no active draft runs the existing opt-in flow directly", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName, true);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-27T00:00:00.000Z"));
    const user = userEvent.setup();

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByText(EVENT_NAME)).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Opt In" }));

    await waitFor(() =>
      expect(screen.queryByText(EVENT_NAME)).not.toBeInTheDocument(),
    );

    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    const settings = await getEventSettings(repos, PROFILE_ID);
    expect(settings.activeEvent).toBe(F_YOU_ITS_JANUARY_EVENT_ID);
    await db.close();
  });

  it("Opt In with an active draft shows the Say Goodbye flow before completing the opt-in", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName, true);
    const draftId = await seedActiveDraft(databaseName);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-27T00:00:00.000Z"));
    const user = userEvent.setup();

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByText(EVENT_NAME)).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Opt In" }));

    await waitFor(() =>
      expect(
        screen.getByText("Say goodbye to your draft?"),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText(EVENT_NAME)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Say Goodbye" }));

    await waitFor(() =>
      expect(
        screen.queryByText("Say goodbye to your draft?"),
      ).not.toBeInTheDocument(),
    );

    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    const settings = await getEventSettings(repos, PROFILE_ID);
    expect(settings.activeEvent).toBe(F_YOU_ITS_JANUARY_EVENT_ID);
    const draft = await repos.drafts.getById(PROFILE_ID, draftId);
    expect(draft?.status).toBe("discarded");
    await db.close();
  });

  it("Nah dismisses the modal and persists the dismissal for this cycle — it does not reappear on reload", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName, true);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-27T00:00:00.000Z"));
    const user = userEvent.setup();

    const first = render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByText(EVENT_NAME)).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Nah" }));

    await waitFor(() =>
      expect(screen.queryByText(EVENT_NAME)).not.toBeInTheDocument(),
    );

    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    const dismissals = await getEventDismissals(repos, PROFILE_ID);
    expect(dismissals[F_YOU_ITS_JANUARY_EVENT_ID]).toBe("2026");
    // Declining is not permanent — the event stays opt-in-able from Settings.
    const settings = await getEventSettings(repos, PROFILE_ID);
    expect(settings.eventsEnabled).toBe(true);
    expect(settings.activeEvent).toBeNull();
    await db.close();

    first.unmount();
    cleanup();

    // Simulates reopening the app — a fresh mount against the same database.
    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByText("Page content")).toBeInTheDocument(),
    );
    expect(screen.queryByText(EVENT_NAME)).not.toBeInTheDocument();
  });

  it("a new availability cycle makes the intro eligible to appear again after a prior dismissal", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName, true);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-27T00:00:00.000Z"));
    const user = userEvent.setup();

    const first = render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByText(EVENT_NAME)).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Nah" }));
    await waitFor(() =>
      expect(screen.queryByText(EVENT_NAME)).not.toBeInTheDocument(),
    );
    first.unmount();
    cleanup();

    vi.setSystemTime(new Date("2027-01-27T00:00:00.000Z"));
    render(<Harness databaseName={databaseName} />);

    await waitFor(() =>
      expect(screen.getByText(EVENT_NAME)).toBeInTheDocument(),
    );
  });

  it("an event the profile already opted into never shows its own intro again", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName, true);
    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    await repos.settings.set(PROFILE_ID, "events.settings", {
      eventsEnabled: true,
      eventVisualsEnabled: false,
      activeEvent: F_YOU_ITS_JANUARY_EVENT_ID,
      manuallyEnabledEvents: [],
    });
    await db.close();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-27T00:00:00.000Z"));

    render(<Harness databaseName={databaseName} />);

    await waitFor(() =>
      expect(screen.getByText("Page content")).toBeInTheDocument(),
    );
    expect(screen.queryByText(EVENT_NAME)).not.toBeInTheDocument();
  });
});

describe("EventIntroDialog — Halloween's exact custom button copy (PROMPT 18)", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.useRealTimers();
  });

  it("shows the exact 'I want to join the Halloween Event' / 'I'm not interested' labels, not the generic Opt In/Nah", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName, true);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T20:00:00.000Z"));

    render(<Harness databaseName={databaseName} />);

    await waitFor(() =>
      expect(screen.getByText("Halloween")).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", {
        name: "I want to join the Halloween Event",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "I'm not interested" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Opt In" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Nah" }),
    ).not.toBeInTheDocument();
  });

  it("joining Halloween applies immediately (no active draft), never showing the generic labels either", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName, true);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T20:00:00.000Z"));
    const user = userEvent.setup();

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByText("Halloween")).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole("button", {
        name: "I want to join the Halloween Event",
      }),
    );

    await waitFor(() =>
      expect(screen.queryByText("Halloween")).not.toBeInTheDocument(),
    );

    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    const settings = await getEventSettings(repos, PROFILE_ID);
    await db.close();
    expect(settings.activeEvent).toBe(HALLOWEEN_EVENT_ID);
    expect(settings.eventVisualsEnabled).toBe(true);
  });
});

describe("EventIntroDialog — Halloween decline does not repeatedly return (PROMPT 21)", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.useRealTimers();
  });

  it("'I'm not interested' dismisses the modal and it does not reappear on reload within the same occurrence", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName, true);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T20:00:00.000Z"));
    const user = userEvent.setup();

    const first = render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByText("Halloween")).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole("button", { name: "I'm not interested" }),
    );
    await waitFor(() =>
      expect(screen.queryByText("Halloween")).not.toBeInTheDocument(),
    );

    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    const dismissals = await getEventDismissals(repos, PROFILE_ID);
    expect(dismissals[HALLOWEEN_EVENT_ID]).toBeTruthy();
    // Declining is not permanent — Halloween stays reachable from Settings.
    const settings = await getEventSettings(repos, PROFILE_ID);
    expect(settings.activeEvent).toBeNull();
    await db.close();

    first.unmount();
    cleanup();

    // Simulates reopening the app later the SAME occurrence — a fresh mount
    // against the same database, same simulated moment.
    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByText("Page content")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Halloween")).not.toBeInTheDocument();

    // Still doesn't return a day later, still within the same occurrence.
    vi.setSystemTime(new Date("2026-10-16T12:00:00.000Z"));
    cleanup();
    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByText("Page content")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Halloween")).not.toBeInTheDocument();
  });
});

describe("EventIntroDialog — Halloween theme + decoration (PROMPT 20)", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.useRealTimers();
  });

  it("Halloween's modal gets the Kitsch Halloween theme class and its own decoration, generically via EventVisualTheme", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName, true);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T20:00:00.000Z"));

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByText("Halloween")).toBeInTheDocument(),
    );

    const dialog = screen.getByRole("alertdialog");
    expect(dialog.className).toContain("theme-halloween");
    // The decoration cluster is purely aria-hidden.
    expect(dialog.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});
