import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getHalloweenManifestFilmIds,
  setHalloweenManifestFilmIds,
} from "@/domain/events/halloween-manifest-overlay";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import {
  ensureHalloweenFilmContentLoaded,
  loadHalloweenFilmContent,
} from "./halloween-film-content-service";

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

/**
 * Covers docs/updates, "FDRAFT UPDATE 1 — EVENT WATCHLIST PREFERENCE
 * CLEANUP" §1/§6 — the guard that stops Halloween's fixed automatic Draft
 * builder from racing `app-shell.tsx`'s fire-and-forget content load and
 * rendering "Horror 0 available" with unusable sliders, mirroring
 * Christmas's own `ensureEventCategoryFilmContentLoaded`.
 */
describe("ensureHalloweenFilmContentLoaded", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
    vi.restoreAllMocks();
    setHalloweenManifestFilmIds({ horrorFilmIds: [], kitschFilmIds: [] });
  });

  it("loads the real content when Horror/Kitsch haven't resolved yet", async () => {
    db = new FDraftLocalDatabase(
      `halloween-ensure-content-${crypto.randomUUID()}`,
    );
    const repos = createLocalRepositories(db);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    setHalloweenManifestFilmIds({ horrorFilmIds: [], kitschFilmIds: [] });
    await ensureHalloweenFilmContentLoaded({
      films: repos.films,
      unresolvedMetadata: repos.unresolvedMetadata,
    });

    const { horrorFilmIds, kitschFilmIds } = getHalloweenManifestFilmIds();
    expect(horrorFilmIds.length).toBeGreaterThan(0);
    expect(kitschFilmIds.length).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });

  it("is a no-op once Horror/Kitsch have already resolved — never a second redundant load", async () => {
    db = new FDraftLocalDatabase(
      `halloween-ensure-content-noop-${crypto.randomUUID()}`,
    );
    const repos = createLocalRepositories(db);
    // Simulate app-shell's own load already having finished — the ensure
    // must see this and do nothing further, regardless of what's actually
    // in the repository.
    setHalloweenManifestFilmIds({
      horrorFilmIds: ["already-resolved-horror"],
      kitschFilmIds: ["already-resolved-kitsch"],
    });

    await ensureHalloweenFilmContentLoaded({
      films: repos.films,
      unresolvedMetadata: repos.unresolvedMetadata,
    });

    // Unchanged — the real bundled content was never loaded on top of it.
    expect(getHalloweenManifestFilmIds()).toEqual({
      horrorFilmIds: ["already-resolved-horror"],
      kitschFilmIds: ["already-resolved-kitsch"],
    });
  });
});
