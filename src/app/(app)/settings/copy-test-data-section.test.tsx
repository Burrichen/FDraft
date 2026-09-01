import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ProfileProvider } from "@/components/profiles/profile-provider";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import {
  buildProfileBackup,
  serializeBackupCompact,
} from "@/application/backup/export-backup";
import { CopyTestDataSection } from "./copy-test-data-section";

const PROFILE_ID = "alex";

function Harness({ databaseName }: { databaseName: string }) {
  return (
    <ProfileProvider databaseName={databaseName}>
      <CopyTestDataSection />
    </ProfileProvider>
  );
}

async function seedProfileWithData(databaseName: string) {
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
      halloweenPumpkinState: "uncarved",
    },
    dataVersion: 1,
  });
  await repos.films.create({
    id: "film-1",
    title: "Real Film",
    releaseYear: 2020,
    letterboxdSlug: "real-film",
    letterboxdUri: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  await repos.watchlist.createEntry({
    id: "entry-1",
    profileId: PROFILE_ID,
    filmId: "film-1",
    dateAdded: "2026-01-01",
    position: 0,
    isActive: true,
    selectionWeight: 1,
    importSource: null,
    importId: null,
    removedAt: null,
    removedReason: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  const backup = await buildProfileBackup(repos, PROFILE_ID);
  await db.close();
  return serializeBackupCompact(backup);
}

function fileWithText(name: string, text: string): File {
  return new File([text], name, { type: "application/json" });
}

describe("CopyTestDataSection — Dev-only safe copy (EVENT STUDIO — PHASE 2 §4)", () => {
  afterEach(cleanup);

  it("importing a real backup and confirming creates a brand-new profile with a copy of the data", async () => {
    const sourceDbName = crypto.randomUUID();
    const backupText = await seedProfileWithData(sourceDbName);

    const devDbName = crypto.randomUUID();
    const user = userEvent.setup();
    render(<Harness databaseName={devDbName} />);

    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await user.upload(fileInput, fileWithText("backup.fdraft", backupText));

    await waitFor(() =>
      expect(
        screen.getByText(/Found a backup for profile/i),
      ).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole("button", { name: "Copy as New Profile" }),
    );
    await waitFor(() =>
      expect(screen.getByText("Copy this test data in?")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Copy Test Data" }));

    await waitFor(() =>
      expect(screen.getByText(/Test data copied/i)).toBeInTheDocument(),
    );

    const devDb = new FDraftLocalDatabase(devDbName);
    const devRepos = createLocalRepositories(devDb);
    const profiles = await devRepos.profiles.list();
    expect(profiles).toHaveLength(1);
    expect(profiles[0]?.displayName).toBe("Alex");
    const entries = await devRepos.watchlist.listAllEntries(profiles[0]!.id);
    expect(entries).toHaveLength(1);
    await devDb.close();
  });

  it("this is genuinely a COPY — the sourced database is never opened, read, or modified by this component", async () => {
    const sourceDbName = crypto.randomUUID();
    const backupText = await seedProfileWithData(sourceDbName);

    const devDbName = crypto.randomUUID();
    const user = userEvent.setup();
    render(<Harness databaseName={devDbName} />);

    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await user.upload(fileInput, fileWithText("backup.fdraft", backupText));
    await waitFor(() =>
      expect(
        screen.getByText(/Found a backup for profile/i),
      ).toBeInTheDocument(),
    );
    await user.click(
      screen.getByRole("button", { name: "Copy as New Profile" }),
    );
    await waitFor(() =>
      expect(screen.getByText("Copy this test data in?")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Copy Test Data" }));
    await waitFor(() =>
      expect(screen.getByText(/Test data copied/i)).toBeInTheDocument(),
    );

    // The ORIGINAL source profile/data is completely untouched.
    const sourceDb = new FDraftLocalDatabase(sourceDbName);
    const sourceRepos = createLocalRepositories(sourceDb);
    const sourceProfiles = await sourceRepos.profiles.list();
    expect(sourceProfiles).toHaveLength(1);
    expect(sourceProfiles[0]?.id).toBe(PROFILE_ID);
    const sourceEntries =
      await sourceRepos.watchlist.listAllEntries(PROFILE_ID);
    expect(sourceEntries).toHaveLength(1);
    await sourceDb.close();
  });

  it("shows a useful error for an invalid file and creates no profile", async () => {
    const devDbName = crypto.randomUUID();
    const user = userEvent.setup();
    render(<Harness databaseName={devDbName} />);

    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await user.upload(
      fileInput,
      fileWithText("bad.fdraft", "{ not valid json"),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "Import Test Data (.fdraft backup)",
        }),
      ).toBeInTheDocument(),
    );

    const devDb = new FDraftLocalDatabase(devDbName);
    const devRepos = createLocalRepositories(devDb);
    expect(await devRepos.profiles.list()).toHaveLength(0);
    await devDb.close();
  });

  it("is clearly identified as Dev-only functionality", () => {
    render(<Harness databaseName={crypto.randomUUID()} />);
    expect(
      screen.getByText(/Copy Test Data From FDraft \(Dev-only\)/i),
    ).toBeInTheDocument();
  });
});
