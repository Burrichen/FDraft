import { afterEach, describe, expect, it } from "vitest";
import { getEffectiveEventDate } from "@/application/events/event-clock";
import { setEventDateOverride } from "@/application/events/event-date-override-store";
import { FixedClock } from "@/domain/time/clock";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import type { Repositories } from "@/repositories";

const PROFILE_ID = "alex";
const REAL_NOW = new FixedClock(new Date("2026-06-15T00:00:00.000Z"));

async function seedProfile(repos: Repositories, adminMode: boolean) {
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
      adminMode,
      halloweenPumpkinState: "uncarved",
    },
    dataVersion: 1,
  });
}

describe("getEffectiveEventDate", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("uses the real clock when no profile exists at all", async () => {
    db = new FDraftLocalDatabase(`event-clock-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    const now = await getEffectiveEventDate(repos, PROFILE_ID, {
      clock: REAL_NOW,
    });
    expect(now).toEqual(REAL_NOW.now());
  });

  it("uses the real clock when Admin Mode is off, even if an override is configured", async () => {
    db = new FDraftLocalDatabase(`event-clock-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedProfile(repos, false);
    await setEventDateOverride(repos, PROFILE_ID, {
      enabled: true,
      eventId: "halloween",
      simulatedDate: "2026-10-15T20:00:00.000Z",
    });

    const now = await getEffectiveEventDate(repos, PROFILE_ID, {
      clock: REAL_NOW,
    });
    expect(now).toEqual(REAL_NOW.now());
  });

  it("uses the real clock when Admin Mode is on but no override has been configured", async () => {
    db = new FDraftLocalDatabase(`event-clock-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedProfile(repos, true);

    const now = await getEffectiveEventDate(repos, PROFILE_ID, {
      clock: REAL_NOW,
    });
    expect(now).toEqual(REAL_NOW.now());
  });

  it("uses the real clock when Admin Mode is on but the override is disabled", async () => {
    db = new FDraftLocalDatabase(`event-clock-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedProfile(repos, true);
    await setEventDateOverride(repos, PROFILE_ID, {
      enabled: false,
      eventId: "halloween",
      simulatedDate: "2026-10-15T20:00:00.000Z",
    });

    const now = await getEffectiveEventDate(repos, PROFILE_ID, {
      clock: REAL_NOW,
    });
    expect(now).toEqual(REAL_NOW.now());
  });

  it("uses the simulated date when Admin Mode is on and the override is enabled", async () => {
    db = new FDraftLocalDatabase(`event-clock-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedProfile(repos, true);
    await setEventDateOverride(repos, PROFILE_ID, {
      enabled: true,
      eventId: "halloween",
      simulatedDate: "2026-10-15T20:00:00.000Z",
    });

    const now = await getEffectiveEventDate(repos, PROFILE_ID, {
      clock: REAL_NOW,
    });
    expect(now).toEqual(new Date("2026-10-15T20:00:00.000Z"));
  });

  it("falls back to the real clock for a corrupted simulatedDate, rather than returning an Invalid Date", async () => {
    db = new FDraftLocalDatabase(`event-clock-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedProfile(repos, true);
    await setEventDateOverride(repos, PROFILE_ID, {
      enabled: true,
      eventId: "halloween",
      simulatedDate: "not-a-real-date",
    });

    const now = await getEffectiveEventDate(repos, PROFILE_ID, {
      clock: REAL_NOW,
    });
    expect(now).toEqual(REAL_NOW.now());
  });

  it("suspends the override immediately when Admin Mode turns off, and restores it when Admin Mode turns back on — without losing the stored configuration", async () => {
    db = new FDraftLocalDatabase(`event-clock-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await seedProfile(repos, true);
    await setEventDateOverride(repos, PROFILE_ID, {
      enabled: true,
      eventId: "halloween",
      simulatedDate: "2026-10-15T20:00:00.000Z",
    });

    // Admin ON, override ON — simulated date applies.
    expect(
      await getEffectiveEventDate(repos, PROFILE_ID, { clock: REAL_NOW }),
    ).toEqual(new Date("2026-10-15T20:00:00.000Z"));

    // Admin OFF — real date used immediately, override config untouched.
    const profile = await repos.profiles.getById(PROFILE_ID);
    await repos.profiles.update({
      ...profile!,
      settings: { ...profile!.settings, adminMode: false },
    });
    expect(
      await getEffectiveEventDate(repos, PROFILE_ID, { clock: REAL_NOW }),
    ).toEqual(REAL_NOW.now());

    // Admin ON again — the same stored override configuration is restored,
    // with no need to re-select it.
    const profileAgain = await repos.profiles.getById(PROFILE_ID);
    await repos.profiles.update({
      ...profileAgain!,
      settings: { ...profileAgain!.settings, adminMode: true },
    });
    expect(
      await getEffectiveEventDate(repos, PROFILE_ID, { clock: REAL_NOW }),
    ).toEqual(new Date("2026-10-15T20:00:00.000Z"));
  });
});
