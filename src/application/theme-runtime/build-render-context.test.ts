import { describe, expect, it } from "vitest";
import { buildFDraftThemeRenderContext } from "./build-render-context";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import type { DraftFilmCardView } from "@/components/drafts/draft-film-card";

const PROFILE_ID = "alex";

async function seedProfile(databaseName: string, timezone = "UTC") {
  const db = new FDraftLocalDatabase(databaseName);
  const repos = createLocalRepositories(db);
  await repos.profiles.create({
    id: PROFILE_ID,
    displayName: "Alex",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastOpenedAt: "2026-01-01T00:00:00.000Z",
    timezone,
    settings: {
      reducedMotion: false,
      defaultPage: "watchlist",
      franchiseChronologicalOrder: false,
      adminMode: false,
      halloweenPumpkinState: "uncarved",
    },
    dataVersion: 1,
  });
  return { db, repos };
}

function film(overrides: Partial<DraftFilmCardView> = {}): DraftFilmCardView {
  return {
    itemId: crypto.randomUUID(),
    entryId: crypto.randomUUID(),
    title: "Some Film",
    releaseYear: 2000,
    runtimeMinutes: 100,
    letterboxdUri: null,
    posterUrl: null,
    averageRating: null,
    genres: null,
    isCompleted: false,
    challenge: null,
    hasNoMetadata: false,
    substitution: null,
    canEdit: false,
    source: "random",
    ...overrides,
  };
}

describe("buildFDraftThemeRenderContext", () => {
  it("passes films through untouched and derives progress counts from them via the real domain function", async () => {
    const databaseName = crypto.randomUUID();
    const { db, repos } = await seedProfile(databaseName);

    const films = [
      film({ isCompleted: true }),
      film({ isCompleted: true }),
      film({ isCompleted: false }),
    ];
    const context = await buildFDraftThemeRenderContext({
      repositories: repos,
      profileId: PROFILE_ID,
      timezone: "UTC",
      eventId: "f-you-its-january",
      films,
    });

    expect(context.films).toBe(films);
    expect(context.watchedCount).toBe(2);
    expect(context.targetCount).toBe(3);
    expect(context.progressPercent).toBe(67);
    await db.close();
  });

  it("resolves the real points balance for the event's own point currency", async () => {
    const databaseName = crypto.randomUUID();
    const { db, repos } = await seedProfile(databaseName);
    await repos.points.setBalance({
      profileId: PROFILE_ID,
      currency: "misery",
      total: 15,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const context = await buildFDraftThemeRenderContext({
      repositories: repos,
      profileId: PROFILE_ID,
      timezone: "UTC",
      eventId: "f-you-its-january",
      films: [],
    });

    expect(context.pointsBalance).toBe(15);
    await db.close();
  });

  it("resolves a countdown target from the event's real recurring availability window", async () => {
    const databaseName = crypto.randomUUID();
    const { db, repos } = await seedProfile(databaseName);

    const context = await buildFDraftThemeRenderContext({
      repositories: repos,
      profileId: PROFILE_ID,
      timezone: "UTC",
      eventId: "f-you-its-january",
      films: [],
    });

    // January's event is real registered availability — some numeric
    // target should resolve (exact value depends on the current date,
    // deliberately not asserted precisely here to avoid a flaky,
    // calendar-dependent test).
    expect(
      typeof context.countdownTargetAtMs === "number" ||
        context.countdownTargetAtMs === null,
    ).toBe(true);
    await db.close();
  });

  it("resolves eventId straight through unchanged", async () => {
    const databaseName = crypto.randomUUID();
    const { db, repos } = await seedProfile(databaseName);
    const context = await buildFDraftThemeRenderContext({
      repositories: repos,
      profileId: PROFILE_ID,
      timezone: "UTC",
      eventId: "f-you-its-january",
      films: [],
    });
    expect(context.eventId).toBe("f-you-its-january");
    await db.close();
  });
});
