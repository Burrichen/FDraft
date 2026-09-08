import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getEventDiscovery,
  isOccurrenceActiveNow,
  isOccurrenceExpired,
  resolveEventEndingCandidate,
} from "@/application/events/event-discovery";
import { getEventManualActivations } from "@/application/events/event-manual-activation-store";
import { beginEventOptIn } from "@/application/events/event-opt-in";
import {
  CHRISTMAS_EVENT_ID,
  F_YOU_ITS_JANUARY_EVENT_ID,
  HALLOWEEN_EVENT_ID,
} from "@/domain/events/event-registry";
import { FixedClock } from "@/domain/time/clock";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import type { Repositories } from "@/repositories";

const PROFILE_ID = "alex";

async function seedProfile(repos: Repositories) {
  await repos.profiles.create({
    id: PROFILE_ID,
    displayName: "Alex",
    createdAt: "2027-01-01T00:00:00.000Z",
    lastOpenedAt: "2027-01-01T00:00:00.000Z",
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
}

function statusFor(
  statuses: Awaited<ReturnType<typeof getEventDiscovery>>["statuses"],
  eventId: string,
) {
  return statuses.find((status) => status.event.id === eventId)!;
}

/**
 * Covers docs/updates, "FDRAFT UPDATE 1 — JANUARY / HALLOWEEN / CHRISTMAS
 * REGRESSION" — a MANUALLY activated event now reaches its own
 * Event-over experience instead of persisting indefinitely with nothing
 * to conclude it (see `event-manual-activation-store.ts`), without
 * breaking the deliberate "a mid-year opt-in stays active for the rest of
 * its run" feature.
 */
describe("manual activation lifecycle", () => {
  let db: FDraftLocalDatabase;
  let repos: Repositories;

  beforeEach(async () => {
    db = new FDraftLocalDatabase(`manual-activation-${crypto.randomUUID()}`);
    repos = createLocalRepositories(db) as Repositories;
    await seedProfile(repos);
  });

  afterEach(async () => {
    await db?.delete();
  });

  /** June 2027 — outside every event's natural window. */
  const OFF_SEASON = new FixedClock(new Date("2027-06-15T12:00:00.000Z"));

  it("records the activation's own end — the next occurrence end — when joined manually", async () => {
    await beginEventOptIn(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        eventId: F_YOU_ITS_JANUARY_EVENT_ID,
      },
      { clock: OFF_SEASON },
    );

    const activations = await getEventManualActivations(repos, PROFILE_ID);
    // January's window has already closed for 2027, so the activation
    // runs to the END of the next one: 1 February 2028 — pinned to the
    // occurrence it was actually joined under.
    expect(activations[F_YOU_ITS_JANUARY_EVENT_ID]).toEqual({
      endsAt: "2028-02-01T00:00:00.000Z",
      occurrenceKey: `${F_YOU_ITS_JANUARY_EVENT_ID}:2027`,
    });
  });

  it("stays ACTIVE for the whole of that run — the mid-year opt-in feature is preserved", async () => {
    await beginEventOptIn(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        eventId: F_YOU_ITS_JANUARY_EVENT_ID,
      },
      { clock: OFF_SEASON },
    );

    // Every instant here is inside the run AND outside January's own real
    // window — see the next test for what happens when the real season
    // arrives partway through a run.
    for (const instant of [
      "2027-06-15T12:00:01.000Z",
      "2027-09-01T00:00:00.000Z",
      "2027-12-31T12:00:00.000Z",
      "2028-01-24T23:59:00.000Z",
    ]) {
      const discovery = await getEventDiscovery(
        repos,
        { profileId: PROFILE_ID, timezone: "UTC" },
        { clock: new FixedClock(new Date(instant)) },
      );
      const status = statusFor(discovery.statuses, F_YOU_ITS_JANUARY_EVENT_ID);
      expect(isOccurrenceActiveNow(status), instant).toBe(true);
      expect(isOccurrenceExpired(status), instant).toBe(false);
      // Never both at once.
      expect(status.manualActivationEnded, instant).toBe(false);
    }
  });

  it("hands over to the real season if it opens partway through the run, then still ends the run afterwards", async () => {
    await beginEventOptIn(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        eventId: F_YOU_ITS_JANUARY_EVENT_ID,
      },
      { clock: OFF_SEASON },
    );

    // 28 January 2028 — inside January's REAL window, which the June 2027
    // activation was running towards. A live season always wins outright,
    // so the pin releases and this profile is simply looking at the 2028
    // occurrence it hasn't answered yet (it gets 2028's own intro modal).
    const inSeason = await getEventDiscovery(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock: new FixedClock(new Date("2028-01-28T12:00:00.000Z")) },
    );
    const during = statusFor(inSeason.statuses, F_YOU_ITS_JANUARY_EVENT_ID);
    expect(during.available).toBe(true);
    expect(during.occurrenceKey).toBe(`${F_YOU_ITS_JANUARY_EVENT_ID}:2028`);
    expect(during.participation).toBe("unanswered");
    expect(isOccurrenceExpired(during)).toBe(false);

    // Once that season closes, the pin re-engages on the occurrence the
    // activation actually joined, so the run still gets its ending.
    const after = await getEventDiscovery(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock: new FixedClock(new Date("2028-02-01T00:00:01.000Z")) },
    );
    const ended = statusFor(after.statuses, F_YOU_ITS_JANUARY_EVENT_ID);
    expect(ended.occurrenceKey).toBe(`${F_YOU_ITS_JANUARY_EVENT_ID}:2027`);
    expect(isOccurrenceExpired(ended)).toBe(true);
    expect(resolveEventEndingCandidate(after.statuses)?.occurrenceKey).toBe(
      `${F_YOU_ITS_JANUARY_EVENT_ID}:2027`,
    );
  });

  it("releases the pin once the run's ending is acknowledged, so a later season gets its own", async () => {
    await beginEventOptIn(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        eventId: F_YOU_ITS_JANUARY_EVENT_ID,
      },
      { clock: OFF_SEASON },
    );
    // Acknowledge the run's own ending.
    await repos.settings.set(PROFILE_ID, "events.endingAcknowledgements", {
      [`${F_YOU_ITS_JANUARY_EVENT_ID}:2027`]: true,
    });

    const discovery = await getEventDiscovery(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock: new FixedClock(new Date("2028-02-01T00:00:01.000Z")) },
    );
    const status = statusFor(discovery.statuses, F_YOU_ITS_JANUARY_EVENT_ID);
    // No longer pinned to 2027 — the activation has nothing outstanding,
    // so this event is evaluated normally again.
    expect(status.occurrenceKey).toBe(`${F_YOU_ITS_JANUARY_EVENT_ID}:2028`);
    expect(resolveEventEndingCandidate(discovery.statuses)).toBeNull();
  });

  it("expires once that run ends, and only then shows its ending", async () => {
    await beginEventOptIn(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        eventId: F_YOU_ITS_JANUARY_EVENT_ID,
      },
      { clock: OFF_SEASON },
    );

    const discovery = await getEventDiscovery(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock: new FixedClock(new Date("2028-02-01T00:00:01.000Z")) },
    );
    const status = statusFor(discovery.statuses, F_YOU_ITS_JANUARY_EVENT_ID);
    expect(status.manualActivationEnded).toBe(true);
    expect(isOccurrenceActiveNow(status)).toBe(false);
    expect(isOccurrenceExpired(status)).toBe(true);
    // And the generic ending resolver now genuinely offers it, which it
    // never could for a manual activation before.
    expect(resolveEventEndingCandidate(discovery.statuses)?.event.id).toBe(
      F_YOU_ITS_JANUARY_EVENT_ID,
    );
  });

  it("works the same for Christmas, including its two-stage ending", async () => {
    await beginEventOptIn(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC", eventId: CHRISTMAS_EVENT_ID },
      { clock: OFF_SEASON },
    );
    const activations = await getEventManualActivations(repos, PROFILE_ID);
    // Christmas's 2027 window is still ahead in June, so the activation
    // runs to THIS year's end: 1 January 2028.
    expect(activations[CHRISTMAS_EVENT_ID]?.endsAt).toBe(
      "2028-01-01T00:00:00.000Z",
    );

    const discovery = await getEventDiscovery(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock: new FixedClock(new Date("2028-01-01T00:00:01.000Z")) },
    );
    const candidate = resolveEventEndingCandidate(discovery.statuses);
    expect(candidate?.event.id).toBe(CHRISTMAS_EVENT_ID);
    expect(candidate?.event.ending?.stinger?.message).toBe(
      "Fuck you, it's January!",
    );
  });

  it("never expires a NATURAL join early, even for a profile that manually activated in a previous year", async () => {
    // Manually activate January off-season in 2027 (run ends 1 Feb 2028),
    // then let that run finish — `manuallyEnabledEvents` keeps the event
    // forever as a historical record, so this is the case where a stale
    // recorded end could wrongly expire a brand-new natural join.
    await beginEventOptIn(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        eventId: F_YOU_ITS_JANUARY_EVENT_ID,
      },
      { clock: OFF_SEASON },
    );

    // Now inside January 2029's real window, naturally joined.
    const inWindow = new FixedClock(new Date("2029-01-28T12:00:00.000Z"));
    await beginEventOptIn(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        eventId: F_YOU_ITS_JANUARY_EVENT_ID,
      },
      { clock: inWindow },
    );

    const discovery = await getEventDiscovery(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock: inWindow },
    );
    const status = statusFor(discovery.statuses, F_YOU_ITS_JANUARY_EVENT_ID);
    // Available wins outright: a live window is never "expired", whatever
    // any recorded manual end says.
    expect(status.available).toBe(true);
    expect(isOccurrenceActiveNow(status)).toBe(true);
    expect(isOccurrenceExpired(status)).toBe(false);
    expect(resolveEventEndingCandidate(discovery.statuses)).toBeNull();
  });

  it("records nothing for a natural join, leaving its window the only thing that concludes it", async () => {
    await beginEventOptIn(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC", eventId: HALLOWEEN_EVENT_ID },
      { clock: new FixedClock(new Date("2027-10-15T12:00:00.000Z")) },
    );
    expect(await getEventManualActivations(repos, PROFILE_ID)).toEqual({});

    const discovery = await getEventDiscovery(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock: new FixedClock(new Date("2027-11-01T00:00:01.000Z")) },
    );
    const status = statusFor(discovery.statuses, HALLOWEEN_EVENT_ID);
    expect(status.manuallyEnabled).toBe(false);
    expect(status.manualActivationEnded).toBe(false);
    expect(isOccurrenceExpired(status)).toBe(true);
  });

  it("treats a profile with no recorded end as still running — existing data is never retroactively expired", async () => {
    // Simulates a profile that manually activated on a build before the
    // activation's end was recorded: joined, manually enabled, nothing in
    // the new settings key.
    await repos.settings.set(PROFILE_ID, "events.settings", {
      eventsEnabled: true,
      eventVisualsEnabled: false,
      activeEvent: F_YOU_ITS_JANUARY_EVENT_ID,
      manuallyEnabledEvents: [F_YOU_ITS_JANUARY_EVENT_ID],
    });
    await repos.settings.set(PROFILE_ID, "events.participations", {
      [`${F_YOU_ITS_JANUARY_EVENT_ID}:2027`]: "joined",
    });

    const discovery = await getEventDiscovery(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock: OFF_SEASON },
    );
    const status = statusFor(discovery.statuses, F_YOU_ITS_JANUARY_EVENT_ID);
    expect(status.manualActivationEnded).toBe(false);
    expect(isOccurrenceActiveNow(status)).toBe(true);
    expect(isOccurrenceExpired(status)).toBe(false);
  });
});
