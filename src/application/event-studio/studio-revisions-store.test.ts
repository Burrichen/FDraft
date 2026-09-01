import { afterEach, describe, expect, it } from "vitest";
import {
  MAX_STUDIO_REVISIONS,
  addStudioRevision,
  createRevisionLabel,
  getStudioRevisions,
} from "./studio-revisions-store";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import { fdraftThemeSchema } from "@/domain/event-themes/fdraft-theme-schema";

const PROFILE_ID = "alex";
const PRESET_ID = "halloween";

function fixtureTheme() {
  return fdraftThemeSchema.parse({
    schemaVersion: 1,
    themeId: "halloween",
    eventId: "halloween",
    scope: "event",
    assets: {},
    layouts: {},
  });
}

describe("studio-revisions-store (EVENT STUDIO — PHASE 6 §4, a bounded non-Git checkpoint list)", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("no revisions yet -> empty list", async () => {
    db = new FDraftLocalDatabase(`studio-revisions-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    expect(await getStudioRevisions(repos, PROFILE_ID, PRESET_ID)).toEqual([]);
  });

  it("addStudioRevision adds a revision retrievable via getStudioRevisions", async () => {
    db = new FDraftLocalDatabase(`studio-revisions-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    const theme = fixtureTheme();

    await addStudioRevision(repos, PROFILE_ID, PRESET_ID, theme, "Saved 14:32");

    const revisions = await getStudioRevisions(repos, PROFILE_ID, PRESET_ID);
    expect(revisions).toHaveLength(1);
    expect(revisions[0].theme).toEqual(theme);
    expect(revisions[0].label).toBe("Saved 14:32");
    expect(typeof revisions[0].id).toBe("string");
  });

  it("orders newest first", async () => {
    db = new FDraftLocalDatabase(`studio-revisions-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await addStudioRevision(
      repos,
      PROFILE_ID,
      PRESET_ID,
      fixtureTheme(),
      "first",
      "2026-09-01T10:00:00.000Z",
    );
    await addStudioRevision(
      repos,
      PROFILE_ID,
      PRESET_ID,
      fixtureTheme(),
      "second",
      "2026-09-01T11:00:00.000Z",
    );

    const revisions = await getStudioRevisions(repos, PROFILE_ID, PRESET_ID);
    expect(revisions.map((r) => r.label)).toEqual(["second", "first"]);
  });

  it(`prunes down to MAX_STUDIO_REVISIONS (${MAX_STUDIO_REVISIONS}), dropping the oldest first`, async () => {
    db = new FDraftLocalDatabase(`studio-revisions-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    for (let i = 0; i < MAX_STUDIO_REVISIONS + 3; i += 1) {
      await addStudioRevision(
        repos,
        PROFILE_ID,
        PRESET_ID,
        fixtureTheme(),
        `revision-${i}`,
        `2026-09-01T${String(10 + i).padStart(2, "0")}:00:00.000Z`,
      );
    }

    const revisions = await getStudioRevisions(repos, PROFILE_ID, PRESET_ID);
    expect(revisions).toHaveLength(MAX_STUDIO_REVISIONS);
    expect(revisions[0].label).toBe(`revision-${MAX_STUDIO_REVISIONS + 2}`);
    expect(revisions.at(-1)!.label).toBe("revision-3");
  });

  it("is keyed per preset — one preset's revisions don't leak into another's", async () => {
    db = new FDraftLocalDatabase(`studio-revisions-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await addStudioRevision(
      repos,
      PROFILE_ID,
      "halloween",
      fixtureTheme(),
      "halloween-rev",
    );
    expect(await getStudioRevisions(repos, PROFILE_ID, "christmas")).toEqual(
      [],
    );
  });
});

describe("createRevisionLabel", () => {
  it('formats as "Saved <time>"', () => {
    // Only the "Saved " prefix is asserted, never the time's own digit
    // shape — `toLocaleTimeString` formats using the RUNTIME's default
    // locale, not guaranteed to be "en-US" (or even ASCII digits) in
    // every environment this runs in (see EVENT STUDIO — PHASE 7 CI fix).
    const label = createRevisionLabel(new Date("2026-09-01T14:32:00"));
    expect(label).toMatch(/^Saved .+$/);
  });
});
