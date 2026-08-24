import { afterEach, describe, expect, it } from "vitest";
import {
  applyEventOptIn,
  beginEventOptIn,
  declineEventOccurrence,
} from "@/application/events/event-opt-in";
import { getEventSettings } from "@/application/events/event-settings-store";
import {
  F_YOU_ITS_JANUARY_EVENT_ID,
  HALLOWEEN_EVENT_ID,
} from "@/domain/events/event-registry";
import { FixedClock } from "@/domain/time/clock";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
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

  // REGRESSION (see docs/updates, "EVENT LIFECYCLE REPAIR" §3/§5 — root
  // cause of "the modal does not reliably appear when Halloween first
  // becomes naturally active"): the previous version gated this ENTIRELY
  // on `EventSettings.eventsEnabled`, a flag that starts `false` for every
  // profile and is ONLY ever flipped `true` by a real opt-in — so a
  // brand-new profile that had NEVER joined anything could never be shown
  // ANY event's intro, no matter how long it waited. This test proves that
  // structurally-unreachable precondition is gone: a profile with no
  // `EventSettings` ever written at all still sees the intro the moment a
  // real natural window opens.
  it("a brand-new profile, with no EventSettings ever written, still sees the intro for a naturally active event", async () => {
    db = new FDraftLocalDatabase(`event-intro-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    const result = await resolveEventIntroToShow(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock: JANUARY_2026 },
    );

    expect(result).toEqual({
      event: expect.anything(),
      occurrenceKey: "f-you-its-january:2026",
      eventVisualsEnabled: false,
    });
    expect(result?.event.id).toBe(F_YOU_ITS_JANUARY_EVENT_ID);
  });

  it("not naturally available right now — no intro", async () => {
    db = new FDraftLocalDatabase(`event-intro-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    const result = await resolveEventIntroToShow(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock: JUNE_2026 },
    );

    expect(result).toBeNull();
  });

  it("already opted into this event's current occurrence — no intro modal for it again", async () => {
    db = new FDraftLocalDatabase(`event-intro-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    // `beginEventOptIn` (not `applyEventOptIn` directly) — the real join
    // flow, which is what actually records occurrence participation; see
    // docs/updates, "EVENT LIFECYCLE REPAIR" §7.
    await beginEventOptIn(
      repos,
      {
        profileId: PROFILE_ID,
        timezone: "UTC",
        eventId: F_YOU_ITS_JANUARY_EVENT_ID,
      },
      { clock: JANUARY_2026 },
    );

    const result = await resolveEventIntroToShow(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock: JANUARY_2026 },
    );

    expect(result).toBeNull();
  });

  it("declined for the current occurrence — no intro until a new occurrence begins next year", async () => {
    db = new FDraftLocalDatabase(`event-intro-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await declineEventOccurrence(repos, {
      profileId: PROFILE_ID,
      occurrenceKey: "f-you-its-january:2026",
    });

    const declinedThisOccurrence = await resolveEventIntroToShow(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock: JANUARY_2026 },
    );
    expect(declinedThisOccurrence).toBeNull();

    const nextOccurrence = await resolveEventIntroToShow(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock: JANUARY_2027 },
    );
    expect(nextOccurrence?.event.id).toBe(F_YOU_ITS_JANUARY_EVENT_ID);
    expect(nextOccurrence?.occurrenceKey).toBe("f-you-its-january:2027");
  });

  // ARCHITECTURE CHANGE (see docs/updates, "EVENT LIFECYCLE REPAIR" §1/§4):
  // the previous version deliberately blocked a SECOND event's intro once
  // a profile was joined to ANY event — a workaround for the old single
  // `EventSettings.activeEvent` slot, which a second opt-in would silently
  // overwrite, corrupting the first join. Occurrence-keyed participation
  // has no shared slot to corrupt (see `event-participation-store.ts`), so
  // this is INTENTIONALLY reversed: a profile already joined to Halloween
  // can still be offered January's intro once January's own occurrence
  // naturally opens — consistent with the dual-draft architecture already
  // allowing both to run at once.
  it("already joined to a DIFFERENT event — a second, independently-available event's intro still shows (dual participation is intentional)", async () => {
    db = new FDraftLocalDatabase(`event-intro-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await applyEventOptIn(repos, {
      profileId: PROFILE_ID,
      eventId: HALLOWEEN_EVENT_ID,
      manuallyEnabled: false,
    });

    const result = await resolveEventIntroToShow(
      repos,
      { profileId: PROFILE_ID, timezone: "UTC" },
      { clock: JANUARY_2026 },
    );

    expect(result?.event.id).toBe(F_YOU_ITS_JANUARY_EVENT_ID);
  });

  it("declining the intro does not affect Settings' own opt-in path — declining and later joining from Settings both work independently", async () => {
    db = new FDraftLocalDatabase(`event-intro-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await declineEventOccurrence(repos, {
      profileId: PROFILE_ID,
      occurrenceKey: "f-you-its-january:2026",
    });

    await applyEventOptIn(repos, {
      profileId: PROFILE_ID,
      eventId: F_YOU_ITS_JANUARY_EVENT_ID,
      manuallyEnabled: false,
    });

    const settings = await getEventSettings(repos, PROFILE_ID);
    expect(settings.activeEvent).toBe(F_YOU_ITS_JANUARY_EVENT_ID);
  });
});
