import { afterEach, describe, expect, it, vi } from "vitest";
import { getHalloweenManifestFilmIds } from "@/domain/events/halloween-manifest-overlay";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import { loadHalloweenFilmContent } from "./halloween-film-content-service";

describe("loadHalloweenFilmContent", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
    vi.restoreAllMocks();
  });

  it("resolves the real bundled horror/kitsch content into the overlay, creating films that don't exist locally yet", async () => {
    db = new FDraftLocalDatabase(`halloween-content-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    // Enrichment naturally fails offline in this test environment — that's
    // fine and expected (see the service's own doc comment: swallowed,
    // never breaks loading).
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await loadHalloweenFilmContent({
      films: repos.films,
      unresolvedMetadata: repos.unresolvedMetadata,
    });

    const { horrorFilmIds, kitschFilmIds } = getHalloweenManifestFilmIds();
    // The real bundled `films.json` ships at least the original 3+3
    // testing-fixture titles (see `public/events/halloween/films.json`) —
    // exact counts aren't asserted here since the content is expected to
    // grow, only that loading genuinely resolved something real.
    expect(horrorFilmIds.length).toBeGreaterThan(0);
    expect(kitschFilmIds.length).toBeGreaterThan(0);

    const halloweenFilm = await repos.films.findByTitleAndYear(
      "Halloween",
      1978,
    );
    expect(halloweenFilm).not.toBeNull();
    vi.unstubAllGlobals();
  });

  it("never creates a duplicate film on a second load of the same content", async () => {
    db = new FDraftLocalDatabase(`halloween-content-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await loadHalloweenFilmContent({
      films: repos.films,
      unresolvedMetadata: repos.unresolvedMetadata,
    });
    const firstIds = getHalloweenManifestFilmIds();

    await loadHalloweenFilmContent({
      films: repos.films,
      unresolvedMetadata: repos.unresolvedMetadata,
    });
    const secondIds = getHalloweenManifestFilmIds();

    expect([...secondIds.horrorFilmIds].sort()).toEqual(
      [...firstIds.horrorFilmIds].sort(),
    );
    expect([...secondIds.kitschFilmIds].sort()).toEqual(
      [...firstIds.kitschFilmIds].sort(),
    );
    vi.unstubAllGlobals();
  });

  it("never throws even when metadata enrichment fails entirely", async () => {
    db = new FDraftLocalDatabase(`halloween-content-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(
      loadHalloweenFilmContent({
        films: repos.films,
        unresolvedMetadata: repos.unresolvedMetadata,
      }),
    ).resolves.toBeUndefined();
    vi.unstubAllGlobals();
  });
});
