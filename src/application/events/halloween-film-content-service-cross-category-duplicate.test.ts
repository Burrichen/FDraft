import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * A dedicated file for this one scenario (see docs/updates, "STATIC EVENT
 * FILM CONTENT PACKS" §8/§17) — a top-level, hoisted `vi.mock` is the
 * reliable way to swap `HALLOWEEN_FILM_CONTENT` for a fixture containing
 * a deliberate cross-category duplicate, without disturbing
 * `halloween-film-content-service.test.ts`'s own use of the REAL bundled
 * content.
 */
vi.mock("@/domain/events/event-film-content", () => ({
  HALLOWEEN_FILM_CONTENT: {
    schemaVersion: 1,
    event: "halloween",
    horror: [{ title: "Beetlejuice", year: 1988 }],
    kitsch: [{ title: "Beetlejuice", year: 1988 }],
  },
}));

const { getHalloweenManifestFilmIds } =
  await import("@/domain/events/halloween-manifest-overlay");
const { createLocalRepositories } =
  await import("@/infrastructure/local-db/create-local-repositories");
const { FDraftLocalDatabase } =
  await import("@/infrastructure/local-db/database");
const { loadHalloweenFilmContent } =
  await import("./halloween-film-content-service");

describe("loadHalloweenFilmContent — cross-category duplicate warning", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("warns (without removing the film from either list) when a title+year appears in both horror and kitsch", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const db = new FDraftLocalDatabase(
      `halloween-content-dupe-${crypto.randomUUID()}`,
    );
    const repos = createLocalRepositories(db);

    await loadHalloweenFilmContent({
      films: repos.films,
      unresolvedMetadata: repos.unresolvedMetadata,
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Beetlejuice"),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("more than one category"),
    );

    const { horrorFilmIds, kitschFilmIds } = getHalloweenManifestFilmIds();
    expect(horrorFilmIds).toHaveLength(1);
    expect(kitschFilmIds).toHaveLength(1);
    expect(horrorFilmIds).toEqual(kitschFilmIds);

    await db.delete();
  });
});
