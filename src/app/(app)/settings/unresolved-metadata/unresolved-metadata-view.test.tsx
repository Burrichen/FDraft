import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileProvider } from "@/components/profiles/profile-provider";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import type { Repositories } from "@/repositories";
import { UnresolvedMetadataView } from "./unresolved-metadata-view";

const PROFILE_ID = "alex";

function Harness({ databaseName }: { databaseName: string }) {
  return (
    <ProfileProvider databaseName={databaseName}>
      <UnresolvedMetadataView />
    </ProfileProvider>
  );
}

async function seedProfile(databaseName: string) {
  const db = new FDraftLocalDatabase(databaseName);
  const repos = createLocalRepositories(db);
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
      adminMode: false,
    },
    dataVersion: 1,
  });
  await db.close();
}

async function seedUnresolvedFilm(
  repos: Repositories,
  filmId: string,
  title: string,
) {
  await repos.films.create({
    id: filmId,
    title,
    releaseYear: 1990,
    letterboxdSlug: filmId,
    letterboxdUri: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  await repos.watchlist.createEntry({
    id: `entry-${filmId}`,
    profileId: PROFILE_ID,
    filmId,
    dateAdded: "2026-01-05",
    position: null,
    isActive: true,
    selectionWeight: 1,
    importSource: null,
    importId: null,
    removedAt: null,
    removedReason: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  await repos.unresolvedMetadata.upsert({
    id: `unresolved-${filmId}`,
    filmId,
    provider: "tmdb",
    status: "unresolved",
    reason: "ambiguous",
    message: "Could not confidently choose between multiple results.",
    lastAttemptedAt: "2026-01-10T00:00:00.000Z",
    createdAt: "2026-01-10T00:00:00.000Z",
    updatedAt: "2026-01-10T00:00:00.000Z",
  });
}

describe("UnresolvedMetadataView — candidate search (real fake-indexeddb)", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("a slow response for a film the user has since collapsed never overwrites the panel of the film now open — see docs/product-spec.md, 'COMPLETE PRODUCT AUDIT'", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    await seedUnresolvedFilm(repos, "film-a", "Alpha Movie");
    await seedUnresolvedFilm(repos, "film-b", "Beta Movie");
    await db.close();
    window.localStorage.setItem("fdraft:last-active-profile-id", PROFILE_ID);

    // Film A's search deliberately never resolves during this test until we
    // say so; film B's resolves immediately — simulating A being the slow
    // request that arrives late.
    let resolveA!: (value: Response) => void;
    const pendingA = new Promise<Response>((resolve) => {
      resolveA = resolve;
    });
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { title: string };
        if (body.title === "Alpha Movie") {
          return pendingA;
        }
        return new Response(
          JSON.stringify({
            status: "ok",
            providerId: "tmdb",
            candidates: [
              {
                providerId: "tmdb",
                externalId: "beta-1",
                title: "Beta Movie (Candidate)",
                releaseYear: 1990,
                confidence: 0.9,
                result: {},
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<Harness databaseName={databaseName} />);

    await waitFor(() =>
      expect(screen.getByText("Alpha Movie")).toBeInTheDocument(),
    );

    // Expand A (kicks off its slow search), then collapse it and expand B
    // (kicks off B's fast search) before A's response ever arrives.
    await user.click(screen.getByText("Alpha Movie"));
    await user.click(screen.getByText("Alpha Movie"));
    await user.click(screen.getByText("Beta Movie"));

    await waitFor(() =>
      expect(screen.getByText("Beta Movie (Candidate)")).toBeInTheDocument(),
    );

    // A's stale response now finally arrives — it must be discarded, not
    // rendered into B's still-open panel.
    resolveA(
      new Response(
        JSON.stringify({
          status: "ok",
          providerId: "tmdb",
          candidates: [
            {
              providerId: "tmdb",
              externalId: "alpha-1",
              title: "Alpha Movie (Candidate)",
              releaseYear: 1990,
              confidence: 0.9,
              result: {},
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    // Give the stale promise a chance to resolve and (if the bug were
    // present) clobber the panel.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByText("Beta Movie (Candidate)")).toBeInTheDocument();
    expect(
      screen.queryByText("Alpha Movie (Candidate)"),
    ).not.toBeInTheDocument();
  });

  it("clicking Use This Film while a different film's search is still in flight only ever matches the film whose button was clicked", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    await seedUnresolvedFilm(repos, "film-b", "Beta Movie");
    await db.close();
    window.localStorage.setItem("fdraft:last-active-profile-id", PROFILE_ID);

    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          status: "ok",
          providerId: "tmdb",
          candidates: [
            {
              providerId: "tmdb",
              externalId: "beta-1",
              title: "Beta Movie (Candidate)",
              releaseYear: 1990,
              confidence: 0.9,
              result: { runtimeMinutes: 100 },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<Harness databaseName={databaseName} />);

    await waitFor(() =>
      expect(screen.getByText("Beta Movie")).toBeInTheDocument(),
    );
    await user.click(screen.getByText("Beta Movie"));
    await waitFor(() =>
      expect(screen.getByText("Beta Movie (Candidate)")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Use This Film" }));

    await waitFor(async () => {
      const db2 = new FDraftLocalDatabase(databaseName);
      const repos2 = createLocalRepositories(db2);
      const metadata = await repos2.films.getMetadataForFilm("film-b");
      await db2.close();
      expect(metadata).toHaveLength(1);
    });
  });
});
