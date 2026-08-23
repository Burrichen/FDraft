import { afterEach, describe, expect, it } from "vitest";
import { applyEventOptIn } from "@/application/events/event-opt-in";
import {
  getEventSettings,
  setEventSettings,
} from "@/application/events/event-settings-store";
import {
  F_YOU_ITS_JANUARY_EVENT_ID,
  HALLOWEEN_EVENT_ID,
} from "@/domain/events/event-registry";
import { FixedClock } from "@/domain/time/clock";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import { dismissEventForCycle } from "./event-dismissal-store";
import { DEFAULT_EVENT_SETTINGS } from "@/domain/events/event-settings";
import { resolveEventIntroToShow } from "./event-intro";

const PROFILE_ID = "alex";
const JANUARY_2026 = new FixedClock(new Date("2026-01-27T00:00:00.000Z"));
const JANUARY_2027 = new FixedClock(new Date("2027-01-27T00:00:00.000Z"));
const JUNE_2026 = new FixedClock(new Date("2026-06-15T00:00:00.000Z"));

describe("resolveEventIntroToShow", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("Event Switcher off — never shows an intro, even for a naturally available event", async () => {
    db = new FDraftLocalDatabase(`event-intro-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await setEventSettings(repos, PROFILE_ID, {
      ...DEFAULT_EVENT_SETTINGS,
      eventsEnabled: false,
    });

    const result = await resolveEventIntroToShow(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock: JANUARY_2026 },
    );

    expect(result).toBeNull();
  });

  it("Event Switcher on, newly available event, never opted in or dismissed — shows the intro", async () => {
    db = new FDraftLocalDatabase(`event-intro-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await setEventSettings(repos, PROFILE_ID, {
      ...DEFAULT_EVENT_SETTINGS,
      eventsEnabled: true,
    });

    const result = await resolveEventIntroToShow(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock: JANUARY_2026 },
    );

    expect(result).toEqual({
      event: expect.anything(),
      cycleId: "2026",
      eventVisualsEnabled: false,
    });
    expect(result?.event.id).toBe(F_YOU_ITS_JANUARY_EVENT_ID);
  });

  it("not naturally available right now — no intro, regardless of the switch", async () => {
    db = new FDraftLocalDatabase(`event-intro-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await setEventSettings(repos, PROFILE_ID, {
      ...DEFAULT_EVENT_SETTINGS,
      eventsEnabled: true,
    });

    const result = await resolveEventIntroToShow(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock: JUNE_2026 },
    );

    expect(result).toBeNull();
  });

  it("already opted into this event — no intro modal", async () => {
    db = new FDraftLocalDatabase(`event-intro-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await applyEventOptIn(repos, {
      profileId: PROFILE_ID,
      eventId: F_YOU_ITS_JANUARY_EVENT_ID,
      manuallyEnabled: false,
    });

    const result = await resolveEventIntroToShow(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock: JANUARY_2026 },
    );

    expect(result).toBeNull();
  });

  it("dismissed for the current cycle — no intro until a new cycle begins", async () => {
    db = new FDraftLocalDatabase(`event-intro-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await setEventSettings(repos, PROFILE_ID, {
      ...DEFAULT_EVENT_SETTINGS,
      eventsEnabled: true,
    });
    await dismissEventForCycle(
      repos,
      PROFILE_ID,
      F_YOU_ITS_JANUARY_EVENT_ID,
      "2026",
    );

    const dismissedThisCycle = await resolveEventIntroToShow(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock: JANUARY_2026 },
    );
    expect(dismissedThisCycle).toBeNull();

    const nextCycle = await resolveEventIntroToShow(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock: JANUARY_2027 },
    );
    expect(nextCycle?.event.id).toBe(F_YOU_ITS_JANUARY_EVENT_ID);
    expect(nextCycle?.cycleId).toBe("2027");
  });

  it("already opted into a DIFFERENT event — no intro for a second, newly-available event (regression, PROMPT B2.1 — the January-header-leaking-onto-Halloween's-page bug)", async () => {
    db = new FDraftLocalDatabase(`event-intro-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await applyEventOptIn(repos, {
      profileId: PROFILE_ID,
      eventId: HALLOWEEN_EVENT_ID,
      manuallyEnabled: false,
    });

    // January is genuinely, naturally available right now — the OLD bug
    // only ever skipped the loop entry matching `activeEvent` itself, so
    // it would still return January here even though the profile is
    // already committed to Halloween.
    const result = await resolveEventIntroToShow(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock: JANUARY_2026 },
    );

    expect(result).toBeNull();
  });

  it("dismissing the event does not affect its opt-in-ability — Settings' opt-in path is untouched by dismissal state", async () => {
    db = new FDraftLocalDatabase(`event-intro-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await dismissEventForCycle(
      repos,
      PROFILE_ID,
      F_YOU_ITS_JANUARY_EVENT_ID,
      "2026",
    );

    await applyEventOptIn(repos, {
      profileId: PROFILE_ID,
      eventId: F_YOU_ITS_JANUARY_EVENT_ID,
      manuallyEnabled: false,
    });

    const settings = await getEventSettings(repos, PROFILE_ID);
    expect(settings.activeEvent).toBe(F_YOU_ITS_JANUARY_EVENT_ID);
  });
});
