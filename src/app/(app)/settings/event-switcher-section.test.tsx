import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalDraft } from "@/application/drafts/local-draft-service";
import { setEventDateOverride } from "@/application/events/event-date-override-store";
import { declineEventOccurrence } from "@/application/events/event-opt-in";
import { getEventSettings } from "@/application/events/event-settings-store";
import {
  F_YOU_ITS_JANUARY_EVENT_ID,
  HALLOWEEN_EVENT_ID,
} from "@/domain/events/event-registry";
import { EventDiscoveryProvider } from "@/components/events/event-discovery-provider";
import { ProfileProvider } from "@/components/profiles/profile-provider";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import { EventSwitcherSection } from "./event-switcher-section";
import { EventTestingSection } from "./event-testing-section";

const PROFILE_ID = "alex";

function Harness({ databaseName }: { databaseName: string }) {
  return (
    <ProfileProvider databaseName={databaseName}>
      <EventDiscoveryProvider>
        <EventSwitcherSection />
      </EventDiscoveryProvider>
    </ProfileProvider>
  );
}

/**
 * `activeEvent` defaults to January only when the whole `eventSettings`
 * argument is omitted — NOT via `??` on the field itself, which would
 * silently turn an explicitly-passed `activeEvent: null` back into
 * January (a real, latent bug that stayed invisible while
 * `isCurrentlyJoined` also required `eventsEnabled`, but would corrupt
 * every "nothing joined" test now that joined-ness is read from
 * occurrence participation instead — see `EventSwitcherSection`'s own
 * doc comment, docs/updates "HALLOWEEN PAGE REBUILD" §10).
 *
 * Also seeds `events.participations` as `"joined"` for whatever
 * `activeEvent` ends up being — a real join always writes BOTH
 * `EventSettings.activeEvent` and occurrence participation together (see
 * `applyEventOptIn`/`beginEventOptIn`), so a fixture that sets one without
 * the other describes a state the real app can never actually produce.
 * Keyed by the REAL current year (`new Date().getFullYear()`, not a faked
 * one) for every test in this file that doesn't fake timers; tests that DO
 * fake time (the "Available now" describe block) call this AFTER arming
 * `vi.setSystemTime`, so `new Date()` here still resolves against
 * whichever clock is active at call time.
 */
async function seedProfile(
  databaseName: string,
  eventSettings: {
    eventsEnabled: boolean;
    activeEvent: string | null;
    manuallyEnabledEvents?: string[];
  } = {
    eventsEnabled: true,
    activeEvent: F_YOU_ITS_JANUARY_EVENT_ID,
    manuallyEnabledEvents: [F_YOU_ITS_JANUARY_EVENT_ID],
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
  await repos.settings.set(PROFILE_ID, "events.settings", {
    eventsEnabled: eventSettings.eventsEnabled,
    eventVisualsEnabled: false,
    activeEvent: eventSettings.activeEvent,
    manuallyEnabledEvents: eventSettings.manuallyEnabledEvents ?? [
      F_YOU_ITS_JANUARY_EVENT_ID,
    ],
  });
  if (eventSettings.activeEvent) {
    await repos.settings.set(PROFILE_ID, "events.participations", {
      [`${eventSettings.activeEvent}:${new Date().getFullYear()}`]: "joined",
    });
  }
  await db.close();
}

async function seedActiveJanuaryDraft(databaseName: string) {
  const db = new FDraftLocalDatabase(databaseName);
  const repos = createLocalRepositories(db);
  await repos.films.create({
    id: "film-1",
    title: "Film 1",
    releaseYear: 2020,
    letterboxdSlug: "film-1",
    letterboxdUri: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  // A qualifying rating — January's real eligibilityRules restrict to
  // rating <= 3.5 or curated (see docs/updates, "JANUARY ELIGIBILITY
  // RULES"); an unrated film would no longer be draftable under it.
  await repos.films.upsertMetadata({
    id: "film-1-meta",
    filmId: "film-1",
    provider: "tmdb",
    posterUrl: null,
    runtimeMinutes: null,
    genres: null,
    directors: null,
    countries: null,
    languages: null,
    collectionId: null,
    collectionName: null,
    collectionOrder: null,
    averageRating: 2.5,
    popularity: null,
    watchCount: null,
    fansCount: null,
    listAppearances: null,
    externalIds: null,
    raw: null,
    releaseDate: null,
    releaseStatus: null,
    providerTitle: null,
    matchMethod: "automatic",
    lastEnrichedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  await repos.watchlist.createEntry({
    id: "entry-1",
    profileId: PROFILE_ID,
    filmId: "film-1",
    dateAdded: "2026-01-01",
    position: 0,
    isActive: true,
    selectionWeight: 1,
    importSource: null,
    importId: null,
    removedAt: null,
    removedReason: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  const created = await createLocalDraft(repos, {
    profileId: PROFILE_ID,
    timezone: "UTC",
    config: {
      difficulty: "baby",
      timeMode: "timer",
      randomCount: 1,
      challengeCount: 0,
    },
    sourceEventId: F_YOU_ITS_JANUARY_EVENT_ID,
  });
  await db.close();
  if (!created.ok) throw new Error("unreachable — draft creation failed");
  return created.draftId;
}

describe("EventSwitcherSection — Current Event: Event Visuals toggle (event system Phase 8)", () => {
  afterEach(() => {
    cleanup();
  });

  it("toggling Event Visuals persists eventVisualsEnabled without touching eventsEnabled, activeEvent, or manuallyEnabledEvents", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    const user = userEvent.setup();

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByLabelText("Event Visuals")).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Event Visuals")).not.toBeChecked();

    await user.click(screen.getByLabelText("Event Visuals"));

    await waitFor(() =>
      expect(screen.getByLabelText("Event Visuals")).toBeChecked(),
    );

    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    const settings = await getEventSettings(repos, PROFILE_ID);
    expect(settings).toEqual({
      eventsEnabled: true,
      eventVisualsEnabled: true,
      activeEvent: F_YOU_ITS_JANUARY_EVENT_ID,
      manuallyEnabledEvents: [F_YOU_ITS_JANUARY_EVENT_ID],
    });
    await db.close();
  });

  it("toggling Event Visuals while an active event draft exists never mutates the draft record", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    const draftId = await seedActiveJanuaryDraft(databaseName);
    const user = userEvent.setup();

    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    const draftBefore = await repos.drafts.getById(PROFILE_ID, draftId);
    await db.close();

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByLabelText("Event Visuals")).toBeInTheDocument(),
    );

    await user.click(screen.getByLabelText("Event Visuals"));
    await waitFor(() =>
      expect(screen.getByLabelText("Event Visuals")).toBeChecked(),
    );
    // Toggle it back off too — a round trip, not just a single flip.
    await user.click(screen.getByLabelText("Event Visuals"));
    await waitFor(() =>
      expect(screen.getByLabelText("Event Visuals")).not.toBeChecked(),
    );

    const afterDb = new FDraftLocalDatabase(databaseName);
    const afterRepos = createLocalRepositories(afterDb);
    const draftAfter = await afterRepos.drafts.getById(PROFILE_ID, draftId);
    const settingsAfter = await getEventSettings(afterRepos, PROFILE_ID);
    await afterDb.close();

    expect(draftAfter).toEqual(draftBefore);
    expect(settingsAfter.eventsEnabled).toBe(true);
    expect(settingsAfter.activeEvent).toBe(F_YOU_ITS_JANUARY_EVENT_ID);
    expect(settingsAfter.eventVisualsEnabled).toBe(false);
  });
});

describe("EventSwitcherSection — Current Event: Event Gameplay toggle (HALLOWEEN PAGE REBUILD §10 — no longer leaves the event)", () => {
  afterEach(() => {
    cleanup();
  });

  // REVERSED from this test's earlier premise: turning Event Gameplay off
  // used to leave the event entirely (clearing `activeEvent`, declining
  // participation) — a real bug, since nothing about a "Gameplay" toggle
  // implies "remove my joined page/nav." It now flips ONLY
  // `EventSettings.eventsEnabled`; `activeEvent` and occurrence
  // participation are both left completely alone, which is what keeps
  // "Current Event" itself showing afterward (see the next test) and is
  // the same thing that keeps the real nav tab/page from disappearing.
  it("never touches an active draft, never awards anything, and only flips eventsEnabled — activeEvent and manuallyEnabledEvents are both preserved", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    const draftId = await seedActiveJanuaryDraft(databaseName);
    const user = userEvent.setup();

    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    const draftBefore = await repos.drafts.getById(PROFILE_ID, draftId);
    const lifetimeBefore = await repos.points.getBalance(
      PROFILE_ID,
      "lifetime",
    );
    const signalBefore = await repos.points.getBalance(PROFILE_ID, "signal");
    await db.close();

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByLabelText("Event Gameplay")).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Event Gameplay")).toBeChecked();

    await user.click(screen.getByLabelText("Event Gameplay"));

    await waitFor(async () => {
      const afterDb = new FDraftLocalDatabase(databaseName);
      const afterRepos = createLocalRepositories(afterDb);
      const settingsAfter = await getEventSettings(afterRepos, PROFILE_ID);
      await afterDb.close();
      expect(settingsAfter.eventsEnabled).toBe(false);
    });

    const afterDb = new FDraftLocalDatabase(databaseName);
    const afterRepos = createLocalRepositories(afterDb);
    const draftAfter = await afterRepos.drafts.getById(PROFILE_ID, draftId);
    const settingsAfter = await getEventSettings(afterRepos, PROFILE_ID);
    const lifetimeAfter = await afterRepos.points.getBalance(
      PROFILE_ID,
      "lifetime",
    );
    const signalAfter = await afterRepos.points.getBalance(
      PROFILE_ID,
      "signal",
    );
    await afterDb.close();

    // The active draft — including its own sourceEventId/rewardsGrantedAt
    // — is completely untouched.
    expect(draftAfter).toEqual(draftBefore);
    // Nothing was awarded to any currency.
    expect(lifetimeAfter).toBe(lifetimeBefore);
    expect(signalAfter).toBe(signalBefore);
    // `activeEvent`/`manuallyEnabledEvents` are BOTH unchanged — this is
    // no longer a "leave" action of any kind.
    expect(settingsAfter.activeEvent).toBe(F_YOU_ITS_JANUARY_EVENT_ID);
    expect(settingsAfter.manuallyEnabledEvents).toEqual([
      F_YOU_ITS_JANUARY_EVENT_ID,
    ]);
  });

  it("Current Event stays visible (with Gameplay now unchecked) instead of reverting to the Available-now list", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    const user = userEvent.setup();

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByLabelText("Event Gameplay")).toBeChecked(),
    );

    await user.click(screen.getByLabelText("Event Gameplay"));

    await waitFor(() =>
      expect(screen.getByLabelText("Event Gameplay")).not.toBeChecked(),
    );
    // Still the "Current Event" view — never falls back to "Available now".
    expect(screen.getByText("Current Event")).toBeInTheDocument();
    expect(screen.queryByText("Available now")).not.toBeInTheDocument();

    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    const participations = await repos.settings.get(
      PROFILE_ID,
      "events.participations",
    );
    await db.close();
    // Occurrence participation is untouched — still genuinely "joined",
    // which is the one thing the real nav tab/page visibility depends on.
    expect(
      (participations as Record<string, string> | null)?.[
        `${F_YOU_ITS_JANUARY_EVENT_ID}:${new Date().getFullYear()}`
      ],
    ).toBe("joined");
  });

  it("turning Gameplay back on re-enables it without touching anything else", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName, {
      eventsEnabled: false,
      activeEvent: F_YOU_ITS_JANUARY_EVENT_ID,
    });
    const user = userEvent.setup();

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByLabelText("Event Gameplay")).not.toBeChecked(),
    );

    await user.click(screen.getByLabelText("Event Gameplay"));

    await waitFor(async () => {
      const db = new FDraftLocalDatabase(databaseName);
      const repos = createLocalRepositories(db);
      const settings = await getEventSettings(repos, PROFILE_ID);
      await db.close();
      expect(settings.eventsEnabled).toBe(true);
      expect(settings.activeEvent).toBe(F_YOU_ITS_JANUARY_EVENT_ID);
    });
  });
});

describe("EventSwitcherSection — Available Events (PROMPT B2.1 §4: active events only)", () => {
  beforeEach(() => {
    // Pinned outside BOTH January's real window (25–31 Jan) and Halloween's
    // real natural window (30 Sep 19:00 – 1 Nov 00:00, see
    // `event-registry.ts`) — the default for these tests; individual tests
    // override it when they need to simulate being inside a window.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-15T00:00:00.000Z"));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("nothing naturally active and not currently joined to anything: shows 'No events are currently running.', no catalogue of inactive events to force", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName, {
      eventsEnabled: false,
      activeEvent: null,
    });

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByText("Available now")).toBeInTheDocument(),
    );
    expect(
      screen.getByText("No events are currently running."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Halloween")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /join/i }),
    ).not.toBeInTheDocument();
  });

  it("during Halloween's window, not currently joined to anything: lists Halloween with a working Join button", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName, {
      eventsEnabled: false,
      activeEvent: null,
    });
    vi.setSystemTime(new Date("2026-10-15T20:00:00.000Z"));
    const user = userEvent.setup();

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByText("Halloween")).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole("button", {
        name: "Let me in.",
      }),
    );

    await waitFor(async () => {
      const db = new FDraftLocalDatabase(databaseName);
      const repos = createLocalRepositories(db);
      const settings = await getEventSettings(repos, PROFILE_ID);
      await db.close();
      expect(settings.activeEvent).toBe(HALLOWEEN_EVENT_ID);
      // Naturally available — never recorded as manually enabled.
      expect(settings.manuallyEnabledEvents).not.toContain(HALLOWEEN_EVENT_ID);
    });
  });

  it("Admin Mode's Event Test Switcher override makes Halloween available even though the real clock is outside the window", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName, {
      eventsEnabled: false,
      activeEvent: null,
    });
    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    const profile = await repos.profiles.getById(PROFILE_ID);
    await repos.profiles.update({
      ...profile!,
      settings: { ...profile!.settings, adminMode: true },
    });
    await setEventDateOverride(repos, PROFILE_ID, {
      enabled: true,
      eventId: HALLOWEEN_EVENT_ID,
      simulatedDate: "2026-10-15T20:00:00.000Z",
    });
    await db.close();

    render(<Harness databaseName={databaseName} />);

    await waitFor(() =>
      expect(screen.getByText("Halloween")).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", {
        name: "Let me in.",
      }),
    ).toBeInTheDocument();
  });

  it("already joined to an event: Halloween is never offered as a second available event, even while naturally active", async () => {
    const databaseName = crypto.randomUUID();
    // Already opted into January (seedProfile's default).
    await seedProfile(databaseName);
    vi.setSystemTime(new Date("2026-10-15T20:00:00.000Z"));

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByText("Current Event")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Available now")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Let me in.",
      }),
    ).not.toBeInTheDocument();
  });

  it("shows Halloween's natural window alongside its Join button (SETTINGS INFORMATION ARCHITECTURE REBUILD §4)", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName, {
      eventsEnabled: false,
      activeEvent: null,
    });
    vi.setSystemTime(new Date("2026-10-15T20:00:00.000Z"));

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByText("Halloween")).toBeInTheDocument(),
    );
    expect(
      screen.getByText("30 September, 7pm – 31 October"),
    ).toBeInTheDocument();
  });

  it("an event declined earlier in this same occurrence is still offered here, with a working Join button", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName, {
      eventsEnabled: false,
      activeEvent: null,
    });
    vi.setSystemTime(new Date("2026-10-15T20:00:00.000Z"));
    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    await declineEventOccurrence(repos, {
      profileId: PROFILE_ID,
      occurrenceKey: `${HALLOWEEN_EVENT_ID}:2026`,
    });
    await db.close();
    const user = userEvent.setup();

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByText("Halloween")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Let me in." }));

    await waitFor(async () => {
      const afterDb = new FDraftLocalDatabase(databaseName);
      const afterRepos = createLocalRepositories(afterDb);
      const settings = await getEventSettings(afterRepos, PROFILE_ID);
      await afterDb.close();
      expect(settings.activeEvent).toBe(HALLOWEEN_EVENT_ID);
    });
  });
});

describe("EventSwitcherSection — Current Event: Open <event> link", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("links straight to the joined event's own page", async () => {
    // Pinned INSIDE Halloween's real natural window — "Current Event" is
    // now derived from `isOccurrenceActiveNow` (joined AND available),
    // not the raw `activeEvent` field, so this event must genuinely be
    // available for this test to mean anything (see docs/updates, "EVENT
    // SYSTEM BUGFIX — JANUARY REMAINS ACTIVE DURING HALLOWEEN TESTING").
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T20:00:00.000Z"));
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName, {
      eventsEnabled: true,
      activeEvent: HALLOWEEN_EVENT_ID,
      manuallyEnabledEvents: [],
    });

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByText("Current Event")).toBeInTheDocument(),
    );
    const openLink = screen.getByRole("button", { name: "Open Halloween" });
    expect(openLink).toHaveAttribute("href", "/events/halloween");
  });
});

describe("EventSwitcherSection — regression: January remains active during Halloween testing", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  // THE exact reported bug: a profile naturally joined January (during
  // its own real window, NEVER manually activated), then later has
  // Halloween's window simulated via Admin Event Testing. "Current
  // Event" used to keep showing January forever — read straight off the
  // stale, single-slot `EventSettings.activeEvent`, which is set on
  // every join and never cleared when that event's own window closes —
  // while the real current event (Halloween, once joined) silently
  // disappeared, having already been excluded from "Available now" as
  // "already joined to something." Fixed by deriving "Current Event"
  // from `isOccurrenceActiveNow` (participation joined AND currently
  // available) instead.
  it("a naturally-joined (never manually-activated) January occurrence is NOT shown as Current Event once Halloween's window is simulated", async () => {
    const databaseName = crypto.randomUUID();
    // `manuallyEnabledEvents: []` is the crux — this is a NATURAL join,
    // which `isOccurrenceActiveNow` correctly does NOT exempt from the
    // closing-window check (unlike a manual activation, which legitimately
    // stays active year-round by design).
    await seedProfile(databaseName, {
      eventsEnabled: true,
      activeEvent: F_YOU_ITS_JANUARY_EVENT_ID,
      manuallyEnabledEvents: [],
    });

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T20:00:00.000Z"));

    render(<Harness databaseName={databaseName} />);

    // Halloween is now the genuinely current, available event — Settings
    // must offer it, never keep showing January's stale "Current Event".
    await waitFor(() =>
      expect(screen.getByText("Available now")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Current Event")).not.toBeInTheDocument();
    expect(screen.queryByText("F* You, It's January!")).not.toBeInTheDocument();
    expect(screen.getByText("Halloween")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Let me in." }),
    ).toBeInTheDocument();
  });

  it("switching the Admin Event Testing override live (no remount) immediately updates which event Settings shows as current", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName, {
      eventsEnabled: true,
      activeEvent: F_YOU_ITS_JANUARY_EVENT_ID,
      manuallyEnabledEvents: [],
    });
    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    const profile = await repos.profiles.getById(PROFILE_ID);
    await repos.profiles.update({
      ...profile!,
      settings: { ...profile!.settings, adminMode: true },
    });
    await db.close();

    function CombinedHarness({ dbName }: { dbName: string }) {
      return (
        <ProfileProvider databaseName={dbName}>
          <EventDiscoveryProvider>
            <EventTestingSection />
            <EventSwitcherSection />
          </EventDiscoveryProvider>
        </ProfileProvider>
      );
    }

    const user = userEvent.setup();
    render(<CombinedHarness dbName={databaseName} />);

    // Still January's real window is irrelevant here — no override is set
    // yet, so nothing is naturally available and January isn't manually
    // enabled: neither event shows as current.
    await waitFor(() =>
      expect(screen.getByText("Available now")).toBeInTheDocument(),
    );

    // Switch the override live to Halloween, no remount anywhere. Halloween
    // is available but not yet joined, so it shows with a Join button —
    // unambiguous even alongside the diagnostic panel's own "Halloween"
    // text and the <select>'s own "Halloween" option.
    await user.selectOptions(
      screen.getByLabelText("Event Date Override"),
      HALLOWEEN_EVENT_ID,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Let me in." }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: "Open F* You, It's January!" }),
    ).not.toBeInTheDocument();

    // Switch it again, straight to January — Halloween's Join button must
    // disappear and January's own genuinely-joined, now-available
    // occurrence must show as Current Event, all without a reload.
    await user.selectOptions(
      screen.getByLabelText("Event Date Override"),
      F_YOU_ITS_JANUARY_EVENT_ID,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Open F* You, It's January!" }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: "Let me in." }),
    ).not.toBeInTheDocument();
  });
});
