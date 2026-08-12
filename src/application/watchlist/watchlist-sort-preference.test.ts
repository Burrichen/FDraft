import { afterEach, describe, expect, it } from "vitest";
import {
  getWatchlistSortPreference,
  setWatchlistSortPreference,
} from "@/application/watchlist/watchlist-sort-preference";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";

const PROFILE_ID = "alex";

describe("getWatchlistSortPreference / setWatchlistSortPreference", () => {
  let db: FDraftLocalDatabase;
  afterEach(async () => {
    await db?.delete();
  });

  it("defaults to Date Added — Newest First when nothing has been set", async () => {
    db = new FDraftLocalDatabase(`watchlist-sort-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    expect(await getWatchlistSortPreference(repos, PROFILE_ID)).toBe(
      "date_added_desc",
    );
  });

  it("persists a chosen sort and reads it back — survives a simulated reload", async () => {
    db = new FDraftLocalDatabase(`watchlist-sort-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    await setWatchlistSortPreference(repos, PROFILE_ID, "title_asc");
    expect(await getWatchlistSortPreference(repos, PROFILE_ID)).toBe(
      "title_asc",
    );

    // A fresh repositories instance against the same underlying database —
    // the same thing a real app reload does.
    const reloadedRepos = createLocalRepositories(db);
    expect(await getWatchlistSortPreference(reloadedRepos, PROFILE_ID)).toBe(
      "title_asc",
    );
  });

  it("persists 'shuffle' as the remembered MODE, not any particular resulting order", async () => {
    db = new FDraftLocalDatabase(`watchlist-sort-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    await setWatchlistSortPreference(repos, PROFILE_ID, "shuffle");
    expect(await getWatchlistSortPreference(repos, PROFILE_ID)).toBe("shuffle");
  });

  it("falls back to the default for a corrupted or stale persisted value, rather than crashing", async () => {
    db = new FDraftLocalDatabase(`watchlist-sort-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);
    await repos.settings.set(PROFILE_ID, "watchlist.sort", "not_a_real_sort");

    expect(await getWatchlistSortPreference(repos, PROFILE_ID)).toBe(
      "date_added_desc",
    );
  });

  it("keeps each profile's preference independent", async () => {
    db = new FDraftLocalDatabase(`watchlist-sort-${crypto.randomUUID()}`);
    const repos = createLocalRepositories(db);

    await setWatchlistSortPreference(repos, "profile-a", "rating_desc");
    await setWatchlistSortPreference(repos, "profile-b", "title_desc");

    expect(await getWatchlistSortPreference(repos, "profile-a")).toBe(
      "rating_desc",
    );
    expect(await getWatchlistSortPreference(repos, "profile-b")).toBe(
      "title_desc",
    );
  });
});
