import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { getThemePreviewOverride } from "@/application/event-themes/theme-preview-override-store";
import { ProfileProvider } from "@/components/profiles/profile-provider";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import { FDraftThemeImportSection } from "./fdraft-theme-import-section";

const PROFILE_ID = "alex";

function Harness({ databaseName }: { databaseName: string }) {
  return (
    <ProfileProvider databaseName={databaseName}>
      <FDraftThemeImportSection />
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
      adminMode: true,
      halloweenPumpkinState: "uncarved",
    },
    dataVersion: 1,
  });
  await db.close();
}

function fileWithText(name: string, text: string): File {
  return new File([text], name, { type: "application/json" });
}

const VALID_THEME_TEXT = JSON.stringify({
  schemaVersion: 1,
  themeId: "halloween",
  eventId: "halloween",
  scope: "event",
  displayName: "Halloween",
  assets: { ghost: "events/halloween/decorations/ghost.png" },
  layouts: {
    eventPage: {
      states: {
        active: {
          breakpoints: {
            desktop: {
              placements: [{ id: "p1", kind: "fixed", assetId: "ghost" }],
            },
          },
        },
      },
    },
  },
});

describe("FDraftThemeImportSection — Admin-only QA import (EVENT STUDIO — PHASE 1 §14)", () => {
  afterEach(cleanup);

  it("importing a valid file stores it as a preview override and shows a live preview", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    const user = userEvent.setup();

    render(<Harness databaseName={databaseName} />);
    const input = await screen.findByLabelText(
      /import \.fdraft-theme for preview/i,
    );

    await user.upload(
      input,
      fileWithText("halloween.fdraft-theme", VALID_THEME_TEXT),
    );

    await waitFor(() =>
      expect(screen.getByText(/previewing/i)).toBeInTheDocument(),
    );
    expect(screen.getByText("(halloween)")).toBeInTheDocument();

    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    const stored = await getThemePreviewOverride(repos, PROFILE_ID);
    expect(stored?.themeId).toBe("halloween");
    await db.close();
  });

  it("importing an invalid file shows a useful error and never stores an override", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    const user = userEvent.setup();

    render(<Harness databaseName={databaseName} />);
    const input = await screen.findByLabelText(
      /import \.fdraft-theme for preview/i,
    );

    await user.upload(
      input,
      fileWithText("bad.fdraft-theme", "{ not valid json"),
    );

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent(/not valid json/i);

    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    expect(await getThemePreviewOverride(repos, PROFILE_ID)).toBeNull();
    await db.close();
  });

  it("Remove Preview Override clears the stored override and the preview pane", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    const user = userEvent.setup();

    render(<Harness databaseName={databaseName} />);
    const input = await screen.findByLabelText(
      /import \.fdraft-theme for preview/i,
    );
    await user.upload(
      input,
      fileWithText("halloween.fdraft-theme", VALID_THEME_TEXT),
    );
    await waitFor(() =>
      expect(screen.getByText(/previewing/i)).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole("button", { name: /remove preview override/i }),
    );

    await waitFor(() =>
      expect(screen.queryByText(/previewing/i)).not.toBeInTheDocument(),
    );
    expect(screen.getByText(/no preview override active/i)).toBeInTheDocument();

    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    expect(await getThemePreviewOverride(repos, PROFILE_ID)).toBeNull();
    await db.close();
  });

  it("is clearly identified as Admin/testing-only functionality", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByText(/admin\/testing only/i)).toBeInTheDocument(),
    );
  });
});
