import { afterEach, describe, expect, it } from "vitest";
import { ProfileService } from "@/application/profiles/profile-service";
import { FixedClock } from "@/domain/time/clock";
import { InMemoryActiveProfilePointer } from "@/infrastructure/local-db/active-profile-pointer";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";

function buildService(overrides: { clock?: FixedClock } = {}) {
  const db = new FDraftLocalDatabase(`profile-service-${crypto.randomUUID()}`);
  const repos = createLocalRepositories(db);
  const pointer = new InMemoryActiveProfilePointer();
  const clock =
    overrides.clock ?? new FixedClock(new Date("2026-01-01T00:00:00.000Z"));
  let counter = 0;
  const service = new ProfileService({
    profiles: repos.profiles,
    dataErasure: repos.dataErasure,
    pointer,
    currentSchemaVersion: 1,
    idGenerator: { generate: () => `profile-${++counter}` },
    clock,
  });
  return { service, db, pointer, clock };
}

describe("ProfileService", () => {
  const dbs: FDraftLocalDatabase[] = [];
  afterEach(async () => {
    await Promise.all(dbs.splice(0).map((db) => db.delete()));
  });

  it("creates a profile and persists it (local profile creation)", async () => {
    const { service, db } = buildService();
    dbs.push(db);

    const profile = await service.createProfile("Alex", "Europe/London");
    expect(profile.displayName).toBe("Alex");
    expect(profile.timezone).toBe("Europe/London");
    expect(profile.dataVersion).toBe(1);

    const listed = await service.listProfiles();
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(profile.id);
  });

  it("first launch, zero profiles: resolveInitialProfile returns null (must show 'create a profile')", async () => {
    const { service, db } = buildService();
    dbs.push(db);

    expect(await service.resolveInitialProfile()).toBeNull();
  });

  it("single-profile behaviour: auto-opens the only profile without needing a remembered pointer", async () => {
    const { service, db } = buildService();
    dbs.push(db);

    const created = await service.createProfile("Alex", "UTC");
    const opened = await service.resolveInitialProfile();
    expect(opened?.id).toBe(created.id);
  });

  it("multiple profiles with no remembered pointer: resolveInitialProfile returns null (picker required)", async () => {
    const { service, db } = buildService();
    dbs.push(db);

    await service.createProfile("Alex", "UTC");
    await service.createProfile("Sam", "UTC");
    expect(await service.resolveInitialProfile()).toBeNull();
  });

  it("profile switching: switchToProfile bumps lastOpenedAt and remembers the pointer for next launch", async () => {
    const clock = new FixedClock(new Date("2026-01-01T00:00:00.000Z"));
    const { service, db, pointer } = buildService({ clock });
    dbs.push(db);

    const alex = await service.createProfile("Alex", "UTC");
    const sam = await service.createProfile("Sam", "UTC");

    clock.set(new Date("2026-03-01T00:00:00.000Z"));
    const switched = await service.switchToProfile(sam.id);
    expect(switched.lastOpenedAt).toBe("2026-03-01T00:00:00.000Z");
    expect(pointer.get()).toBe(sam.id);

    // With multiple profiles, a remembered pointer resumes automatically next launch.
    const reopened = await service.resolveInitialProfile();
    expect(reopened?.id).toBe(sam.id);
    expect(alex.id).not.toBe(sam.id);
  });

  it("a remembered pointer for a deleted profile is cleared and no longer honoured", async () => {
    const { service, db, pointer } = buildService();
    dbs.push(db);

    // Three profiles so that after deleting one, two remain — otherwise
    // the single-remaining-profile auto-open rule would mask this case.
    const alex = await service.createProfile("Alex", "UTC");
    await service.createProfile("Sam", "UTC");
    await service.createProfile("Jo", "UTC");
    await service.switchToProfile(alex.id);
    expect(pointer.get()).toBe(alex.id);

    await service.deleteProfile(alex.id);
    expect(pointer.get()).toBeNull();
    expect(await service.resolveInitialProfile()).toBeNull();
  });

  it("renameProfile updates the display name without touching other fields", async () => {
    const { service, db } = buildService();
    dbs.push(db);

    const alex = await service.createProfile("Alex", "UTC");
    const renamed = await service.renameProfile(alex.id, "  Alexandra  ");
    expect(renamed.displayName).toBe("Alexandra");
    expect(renamed.id).toBe(alex.id);
    expect(renamed.timezone).toBe(alex.timezone);
  });

  it("createProfile never reuses an id across profiles (stable, unique IDs)", async () => {
    const { service, db } = buildService();
    dbs.push(db);

    const alex = await service.createProfile("Alex", "UTC");
    const sam = await service.createProfile("Sam", "UTC");
    expect(alex.id).not.toBe(sam.id);
  });

  it("updateSettings merges a partial update, leaving other settings and profile fields untouched", async () => {
    const { service, db } = buildService();
    dbs.push(db);

    const alex = await service.createProfile("Alex", "UTC");
    expect(alex.settings.defaultPage).toBe("watchlist");

    const updated = await service.updateSettings(alex.id, {
      defaultPage: "drafts",
    });
    expect(updated.settings.defaultPage).toBe("drafts");
    expect(updated.settings.reducedMotion).toBe(alex.settings.reducedMotion);
    expect(updated.displayName).toBe(alex.displayName);
    expect(updated.id).toBe(alex.id);

    const persisted = await service.listProfiles();
    expect(persisted[0].settings.defaultPage).toBe("drafts");
  });

  it("updateSettings keeps each profile's settings independent", async () => {
    const { service, db } = buildService();
    dbs.push(db);

    const alex = await service.createProfile("Alex", "UTC");
    const sam = await service.createProfile("Sam", "UTC");
    await service.updateSettings(alex.id, { defaultPage: "drafts" });
    await service.updateSettings(sam.id, { defaultPage: "stats" });

    const [profiles] = await Promise.all([service.listProfiles()]);
    const alexAfter = profiles.find((p) => p.id === alex.id)!;
    const samAfter = profiles.find((p) => p.id === sam.id)!;
    expect(alexAfter.settings.defaultPage).toBe("drafts");
    expect(samAfter.settings.defaultPage).toBe("stats");
  });

  it("updateSettings throws for a profile id that doesn't exist", async () => {
    const { service, db } = buildService();
    dbs.push(db);

    await expect(
      service.updateSettings("does-not-exist", { defaultPage: "stats" }),
    ).rejects.toThrow();
  });
});
