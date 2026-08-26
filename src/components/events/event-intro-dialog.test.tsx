import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalDraft } from "@/application/drafts/local-draft-service";
import { getEventSettings } from "@/application/events/event-settings-store";
import { getEventParticipations } from "@/application/events/event-participation-store";
import {
  F_YOU_ITS_JANUARY_EVENT_ID,
  HALLOWEEN_EVENT_ID,
} from "@/domain/events/event-registry";
import { EventDiscoveryProvider } from "@/components/events/event-discovery-provider";
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
      <EventDiscoveryProvider>
        <WatchUndoProvider>
          <EventIntroDialog />
          <p>Page content</p>
        </WatchUndoProvider>
      </EventDiscoveryProvider>
    </ProfileProvider>
  );
}

async function seedProfile(databaseName: string, eventVisualsEnabled = false) {
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
  // Note: no `events.settings` write here — under the new occurrence-based
  // model (see docs/updates, "EVENT LIFECYCLE REPAIR" §3/§5), the intro
  // modal no longer depends on `EventSettings.eventsEnabled` at all, so a
  // profile with NO settings ever written is exactly the case that proves
  // the modal is reachable for a genuinely first-time profile. Individual
  // tests below write `eventVisualsEnabled` directly where they need to.
  if (eventVisualsEnabled) {
    await repos.settings.set(PROFILE_ID, "events.settings", {
      eventsEnabled: false,
      eventVisualsEnabled: true,
      activeEvent: null,
      manuallyEnabledEvents: [],
    });
  }
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

  it("a brand-new profile, no EventSettings ever written — the intro modal still appears (EVENT LIFECYCLE REPAIR regression)", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-27T00:00:00.000Z"));

    render(<Harness databaseName={databaseName} />);

    await waitFor(() =>
      expect(screen.getByText(EVENT_NAME)).toBeInTheDocument(),
    );
    expect(
      screen.getAllByText(/permanent Misery Point/i).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Opt In" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nah" })).toBeInTheDocument();
    expect(screen.getByText(/isn't permanent/i)).toBeInTheDocument();
  });

  it("Event visuals disabled — the intro modal shows the event's real name/content but no themed icon", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName, false);
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
    await seedProfile(databaseName, true);
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
    await seedProfile(databaseName);
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
    const participations = await getEventParticipations(repos, PROFILE_ID);
    expect(participations["f-you-its-january:2026"]).toBe("joined");
    await db.close();
  });

  it("Opt In with an active draft completes immediately — no Say Goodbye detour, and the draft is left completely untouched (PROMPT B2.1 §1)", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
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
      expect(screen.queryByText(EVENT_NAME)).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByText("Say goodbye to your draft?"),
    ).not.toBeInTheDocument();

    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    const settings = await getEventSettings(repos, PROFILE_ID);
    expect(settings.activeEvent).toBe(F_YOU_ITS_JANUARY_EVENT_ID);
    const draft = await repos.drafts.getById(PROFILE_ID, draftId);
    expect(draft?.status).toBe("active");
    expect(draft?.sourceEventId).toBeNull();
    await db.close();
  });

  it("Nah dismisses the modal and persists a decline for this occurrence — it does not reappear on reload", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
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
    const participations = await getEventParticipations(repos, PROFILE_ID);
    expect(participations["f-you-its-january:2026"]).toBe("declined");
    // Declining is not permanent — the event stays opt-in-able from Settings.
    const settings = await getEventSettings(repos, PROFILE_ID);
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

  it("a new occurrence makes the intro eligible to appear again after a prior decline", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
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

  it("an event the profile already joined for this occurrence never shows its own intro again", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    await repos.settings.set(PROFILE_ID, "events.settings", {
      eventsEnabled: true,
      eventVisualsEnabled: false,
      activeEvent: F_YOU_ITS_JANUARY_EVENT_ID,
      manuallyEnabledEvents: [],
    });
    await repos.settings.set(PROFILE_ID, "events.participations", {
      "f-you-its-january:2026": "joined",
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

  it("shows the exact 'Let me in.' / 'I don't want to be scared!' labels, not the generic Opt In/Nah", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T20:00:00.000Z"));

    render(<Harness databaseName={databaseName} />);

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Halloween" }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", {
        name: "Let me in.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "I don't want to be scared!" }),
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
    await seedProfile(databaseName);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T20:00:00.000Z"));
    const user = userEvent.setup();

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Halloween" }),
      ).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole("button", {
        name: "Let me in.",
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

  it("'I don't want to be scared!' dismisses the modal and it does not reappear on reload within the same occurrence", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T20:00:00.000Z"));
    const user = userEvent.setup();

    const first = render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Halloween" }),
      ).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole("button", { name: "I don't want to be scared!" }),
    );
    await waitFor(() =>
      expect(screen.queryByText("Halloween")).not.toBeInTheDocument(),
    );

    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    const participations = await getEventParticipations(repos, PROFILE_ID);
    expect(participations[`${HALLOWEEN_EVENT_ID}:2026`]).toBe("declined");
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
    await seedProfile(databaseName);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T20:00:00.000Z"));

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Halloween" }),
      ).toBeInTheDocument(),
    );

    const dialog = screen.getByRole("alertdialog");
    expect(dialog.className).toContain("theme-halloween");
    // The decoration cluster is purely aria-hidden.
    expect(dialog.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});

/**
 * See docs/updates, "EVENT LIFECYCLE REPAIR" §4: "the introduction modal
 * must not depend on the current page... this must work regardless of
 * whether the user's default page is Watchlist, Drafts, History, Stats,
 * or Settings." `EventIntroDialog` is mounted once in `AppShell`, above
 * `{children}` (the routed page) — it never reads `usePathname()` or any
 * route state at all, so this proves that architecturally: the exact same
 * modal appears, unmodified, alongside a stand-in for each named page's
 * own content, with no route-specific mocking needed because none exists
 * for it to depend on.
 */
function RouteHarness({
  databaseName,
  routeLabel,
}: {
  databaseName: string;
  routeLabel: string;
}) {
  return (
    <ProfileProvider databaseName={databaseName}>
      <EventDiscoveryProvider>
        <WatchUndoProvider>
          <EventIntroDialog />
          <p>{routeLabel} page content</p>
        </WatchUndoProvider>
      </EventDiscoveryProvider>
    </ProfileProvider>
  );
}

describe("EventIntroDialog — appears regardless of the current route (EVENT LIFECYCLE REPAIR §4)", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.useRealTimers();
  });

  for (const routeLabel of ["Watchlist", "Drafts", "Stats"]) {
    it(`appears over the ${routeLabel} page`, async () => {
      const databaseName = crypto.randomUUID();
      await seedProfile(databaseName);
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-01-27T00:00:00.000Z"));

      render(
        <RouteHarness databaseName={databaseName} routeLabel={routeLabel} />,
      );

      await waitFor(() =>
        expect(screen.getByText(EVENT_NAME)).toBeInTheDocument(),
      );
      // The "page" underneath is still there — the modal overlays it,
      // never replaces or navigates away from it.
      expect(
        screen.getByText(`${routeLabel} page content`),
      ).toBeInTheDocument();
    });
  }
});
