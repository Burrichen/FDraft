import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ProfileProvider } from "@/components/profiles/profile-provider";
import { UpdateProvider } from "@/components/updates/update-provider";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import { InMemoryUpdatePreferenceStore } from "@/infrastructure/updates/update-preference-store";
import { SettingsView } from "./settings-view";

function Harness({ databaseName }: { databaseName: string }) {
  return (
    <UpdateProvider store={new InMemoryUpdatePreferenceStore()}>
      <ProfileProvider databaseName={databaseName}>
        <SettingsView />
      </ProfileProvider>
    </UpdateProvider>
  );
}

/** Seeds one starter profile directly (bypassing the first-run UI, which lives in a different component) so SettingsView has an active profile to render against from the first render. */
async function seedProfile(
  databaseName: string,
  id: string,
  displayName: string,
) {
  const db = new FDraftLocalDatabase(databaseName);
  const repos = createLocalRepositories(db);
  await repos.profiles.create({
    id,
    displayName,
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

describe("SettingsView — profile management (real fake-indexeddb)", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("creating a second profile from Settings adds it to the list immediately", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName, "alex", "Alex");
    const user = userEvent.setup();
    render(<Harness databaseName={databaseName} />);

    await waitFor(() =>
      expect(screen.getByText("Settings")).toBeInTheDocument(),
    );
    expect(
      within(screen.getByRole("list")).getByText("Alex"),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("New profile name"), "Sam");
    await user.click(screen.getByRole("button", { name: "+ Create Profile" }));

    await waitFor(() => expect(screen.getByText("Sam")).toBeInTheDocument());
  });

  it("renaming a profile updates it in place", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName, "alex", "Alex");
    const user = userEvent.setup();
    render(<Harness databaseName={databaseName} />);

    await waitFor(() =>
      expect(
        within(screen.getByRole("list")).getByText("Alex"),
      ).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: 'Rename "Alex"' }));

    const input = screen.getByLabelText("Profile name");
    await user.clear(input);
    await user.type(input, "Alexandra");
    await user.click(screen.getByRole("button", { name: "Save name" }));

    await waitFor(() =>
      expect(
        within(screen.getByRole("list")).getByText("Alexandra"),
      ).toBeInTheDocument(),
    );
    expect(
      within(screen.getByRole("list")).queryByText("Alex"),
    ).not.toBeInTheDocument();
  });

  it("switching profiles from Settings changes which one is marked Active", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName, "alex", "Alex");
    await seedProfile(databaseName, "sam", "Sam");
    // With two existing profiles and no remembered pointer, resolveInitialProfile
    // returns null (picker state) — SettingsView needs an *active* profile to
    // render at all, so remember one up front the same way switchToProfile would.
    window.localStorage.setItem("fdraft:last-active-profile-id", "alex");

    const user = userEvent.setup();
    render(<Harness databaseName={databaseName} />);

    await waitFor(() =>
      expect(screen.getByText("Settings")).toBeInTheDocument(),
    );
    const samRow = within(screen.getByRole("list"))
      .getByText("Sam")
      .closest("li")!;
    await user.click(within(samRow).getByRole("button", { name: "Switch to" }));

    await waitFor(() => {
      const updatedSamRow = within(screen.getByRole("list"))
        .getByText("Sam")
        .closest("li")!;
      expect(within(updatedSamRow).getByText("Active")).toBeInTheDocument();
    });
  });

  it("deleting a profile requires opening a confirmation dialog — a single click never deletes it", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName, "alex", "Alex");
    await seedProfile(databaseName, "sam", "Sam");
    window.localStorage.setItem("fdraft:last-active-profile-id", "alex");

    const user = userEvent.setup();
    render(<Harness databaseName={databaseName} />);

    await waitFor(() => expect(screen.getByText("Sam")).toBeInTheDocument());
    const samRow = screen.getByText("Sam").closest("li")!;
    await user.click(
      within(samRow).getByRole("button", { name: 'Delete "Sam"' }),
    );

    // The dialog is open; Sam must still exist until the destructive action inside it is clicked.
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByText(/permanently deletes/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Sam")).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole("button", { name: "Delete permanently" }),
    );

    await waitFor(() =>
      expect(screen.queryByText("Sam")).not.toBeInTheDocument(),
    );
    expect(
      within(screen.getByRole("list")).getByText("Alex"),
    ).toBeInTheDocument();
  });

  it("cancelling the delete dialog leaves the profile untouched", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName, "alex", "Alex");
    await seedProfile(databaseName, "sam", "Sam");
    window.localStorage.setItem("fdraft:last-active-profile-id", "alex");

    const user = userEvent.setup();
    render(<Harness databaseName={databaseName} />);

    await waitFor(() => expect(screen.getByText("Sam")).toBeInTheDocument());
    const samRow = screen.getByText("Sam").closest("li")!;
    await user.click(
      within(samRow).getByRole("button", { name: 'Delete "Sam"' }),
    );

    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.getByText("Sam")).toBeInTheDocument();
  });
});
