import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { createLocalDraft } from "@/application/drafts/local-draft-service";
import { getEventSettings } from "@/application/events/event-settings-store";
import {
  F_YOU_ITS_JANUARY_EVENT_ID,
  HALLOWEEN_EVENT_ID,
} from "@/domain/events/event-registry";
import { ProfileProvider } from "@/components/profiles/profile-provider";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import { EventSwitcherSection } from "./event-switcher-section";

const PROFILE_ID = "alex";

function Harness({ databaseName }: { databaseName: string }) {
  return (
    <ProfileProvider databaseName={databaseName}>
      <EventSwitcherSection />
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
    settings: { reducedMotion: false, defaultPage: "watchlist" },
    dataVersion: 1,
  });
  await repos.settings.set(PROFILE_ID, "events.settings", {
    eventsEnabled: true,
    eventVisualsEnabled: false,
    activeEvent: F_YOU_ITS_JANUARY_EVENT_ID,
    manuallyEnabledEvents: [F_YOU_ITS_JANUARY_EVENT_ID],
  });
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

describe("EventSwitcherSection — Event visuals toggle (event system Phase 8)", () => {
  afterEach(() => {
    cleanup();
  });

  it("toggling Event visuals persists eventVisualsEnabled without touching eventsEnabled, activeEvent, or manuallyEnabledEvents", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    const user = userEvent.setup();

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByLabelText("Event visuals")).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Event visuals")).not.toBeChecked();

    await user.click(screen.getByLabelText("Event visuals"));

    await waitFor(() =>
      expect(screen.getByLabelText("Event visuals")).toBeChecked(),
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

  it("toggling Event visuals while an active event draft exists never mutates the draft record", async () => {
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
      expect(screen.getByLabelText("Event visuals")).toBeInTheDocument(),
    );

    await user.click(screen.getByLabelText("Event visuals"));
    await waitFor(() =>
      expect(screen.getByLabelText("Event visuals")).toBeChecked(),
    );
    // Toggle it back off too — a round trip, not just a single flip.
    await user.click(screen.getByLabelText("Event visuals"));
    await waitFor(() =>
      expect(screen.getByLabelText("Event visuals")).not.toBeChecked(),
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

describe("EventSwitcherSection — turning Events off (event system Phase 10 hardening)", () => {
  afterEach(() => {
    cleanup();
  });

  it("never touches an active draft, never awards anything, and only clears eventsEnabled/activeEvent — manuallyEnabledEvents is preserved", async () => {
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
      expect(screen.getByLabelText("Events")).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Events")).toBeChecked();

    await user.click(screen.getByLabelText("Events"));

    await waitFor(() =>
      expect(screen.getByLabelText("Events")).not.toBeChecked(),
    );

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
    // — is completely untouched by turning Events off.
    expect(draftAfter).toEqual(draftBefore);
    // Nothing was awarded to any currency.
    expect(lifetimeAfter).toBe(lifetimeBefore);
    expect(signalAfter).toBe(signalBefore);
    // Explicit transition behaviour: eventsEnabled/activeEvent clear, but
    // manuallyEnabledEvents (this profile's event history) is preserved,
    // not wiped — "preserve user data non-destructively."
    expect(settingsAfter.eventsEnabled).toBe(false);
    expect(settingsAfter.activeEvent).toBeNull();
    expect(settingsAfter.manuallyEnabledEvents).toEqual([
      F_YOU_ITS_JANUARY_EVENT_ID,
    ]);
  });
});

describe("EventSwitcherSection — the displayed available event is the one that actually activates (audit fix)", () => {
  afterEach(() => {
    cleanup();
  });

  it("clicking Opt In next to Halloween activates Halloween, not the registry's first entry (January)", async () => {
    const databaseName = crypto.randomUUID();
    // Already opted into January — this pushes Halloween (the registry's
    // next manually-activatable entry) into the "available now" slot.
    await seedProfile(databaseName);
    const user = userEvent.setup();

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByText("Halloween")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Opt In" }));

    await waitFor(() =>
      expect(screen.queryByText("Halloween")).not.toBeInTheDocument(),
    );

    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    const settings = await getEventSettings(repos, PROFILE_ID);
    await db.close();
    expect(settings.activeEvent).toBe(HALLOWEEN_EVENT_ID);
    expect(settings.manuallyEnabledEvents).toContain(HALLOWEEN_EVENT_ID);
  });
});
