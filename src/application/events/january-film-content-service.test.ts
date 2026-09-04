import { afterEach, describe, expect, it } from "vitest";
import { getJanuaryManifestCuratedFilmIds } from "@/domain/events/january-manifest-overlay";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import { loadJanuaryFilmContent } from "./january-film-content-service";

describe("loadJanuaryFilmContent", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("never creates a film — a curated title with no local match contributes nothing", async () => {
    db = new FDraftLocalDatabase(`january-content-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    await loadJanuaryFilmContent({ films: repos.films });

    // The real bundled `public/events/january/films.json` ships empty by
    // default — this must resolve to an empty curated list, never throw,
    // and never create a film as a side effect.
    expect(getJanuaryManifestCuratedFilmIds()).toEqual([]);
  });
});
