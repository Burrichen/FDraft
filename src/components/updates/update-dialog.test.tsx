import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { check } from "@tauri-apps/plugin-updater";
import { getVersion } from "@tauri-apps/api/app";
import { fetchPublishedReleases } from "@/infrastructure/updates/github-releases-client";
import { InMemoryUpdatePreferenceStore } from "@/infrastructure/updates/update-preference-store";
import { UpdateDialog } from "./update-dialog";
import { UpdateProvider, useUpdateContext } from "./update-provider";

vi.mock("@/infrastructure/tauri/desktop-runtime", () => ({
  isDesktopRuntime: () => true,
}));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn() }));
vi.mock("@/infrastructure/updates/github-releases-client", () => ({
  fetchPublishedReleases: vi.fn().mockResolvedValue([]),
}));

afterEach(() => {
  cleanup();
  vi.mocked(check).mockReset();
  vi.mocked(getVersion).mockReset();
  vi.mocked(fetchPublishedReleases).mockReset().mockResolvedValue([]);
});

function CheckNowButton() {
  const { checkNow } = useUpdateContext();
  return <button onClick={() => void checkNow()}>Check for Updates</button>;
}

function renderDialog(store = new InMemoryUpdatePreferenceStore()) {
  return render(
    <UpdateProvider store={store}>
      <UpdateDialog />
      <CheckNowButton />
    </UpdateProvider>,
  );
}

describe("UpdateDialog", () => {
  it("shows the version and parsed title from the release body on a startup-triggered popup, with all three buttons", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.0.2");
    vi.mocked(check).mockResolvedValue({
      version: "1.0.3",
      currentVersion: "1.0.2",
      body: "### v1.0.3 — Now Updating\n\nSome notes here.",
    } as never);
    renderDialog();

    await waitFor(() =>
      expect(
        screen.getByText("New Update Available: 1.0.3 — Now Updating"),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("Some notes here.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Update Now" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Update Later" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Don't tell me when to upgrade!",
      }),
    ).toBeInTheDocument();
  });

  it("omits the opt-out button for a manually-triggered check", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.0.2");
    const store = new InMemoryUpdatePreferenceStore();
    store.setAutoCheckEnabled(false);
    vi.mocked(check).mockResolvedValue({
      version: "1.0.3",
      currentVersion: "1.0.2",
      body: "### v1.0.3 — Now Updating\n\nSome notes here.",
    } as never);
    const user = userEvent.setup();
    renderDialog(store);

    // Nothing automatic fires (disabled) — the dialog stays closed until
    // the manual check runs.
    expect(screen.queryByText(/New Update Available/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Check for Updates" }));
    await waitFor(() =>
      expect(screen.getByText(/New Update Available/)).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Update Now" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Update Later" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Don't tell me when to upgrade!",
      }),
    ).not.toBeInTheDocument();
  });

  it("shows a fallback message when the release has no usable body", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.0.2");
    vi.mocked(check).mockResolvedValue({
      version: "1.0.3",
      currentVersion: "1.0.2",
      body: null,
    } as never);
    renderDialog();

    await waitFor(() =>
      expect(
        screen.getByText("New Update Available: 1.0.3"),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText("No patch notes are available for this version."),
    ).toBeInTheDocument();
  });

  it("lists skipped intermediate releases under 'Also includes changes from'", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.0.1");
    vi.mocked(check).mockResolvedValue({
      version: "1.0.3",
      currentVersion: "1.0.1",
      body: "### v1.0.3 — Now Updating\n\nLatest notes.",
    } as never);
    vi.mocked(fetchPublishedReleases).mockResolvedValue([
      { version: "1.0.1", body: "### v1.0.1 — First" },
      {
        version: "1.0.2",
        body: "### v1.0.2 — The Green Pen Patch\n\nMiddle notes.",
      },
      { version: "1.0.3", body: "### v1.0.3 — Now Updating\n\nLatest notes." },
    ]);
    renderDialog();

    await waitFor(() =>
      expect(
        screen.getByText("Also includes changes from"),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText("v1.0.2 — The Green Pen Patch"),
    ).toBeInTheDocument();
    expect(screen.getByText("Middle notes.")).toBeInTheDocument();
    // The skipped-releases list never repeats the target version itself.
    expect(screen.queryByText(/v1\.0\.3 —/)).not.toBeInTheDocument();
  });

  it("clicking 'Update Later' closes the dialog and remembers the version", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.0.2");
    vi.mocked(check).mockResolvedValue({
      version: "1.0.3",
      currentVersion: "1.0.2",
      body: "### v1.0.3 — Now Updating",
    } as never);
    const store = new InMemoryUpdatePreferenceStore();
    const user = userEvent.setup();
    renderDialog(store);

    await waitFor(() =>
      expect(screen.getByText(/New Update Available/)).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Update Later" }));
    expect(screen.queryByText(/New Update Available/)).not.toBeInTheDocument();
    expect(store.getLastPromptedVersion()).toBe("1.0.3");
  });

  it('clicking "Don\'t tell me when to upgrade!" closes the dialog and disables future startup prompts', async () => {
    vi.mocked(getVersion).mockResolvedValue("1.0.2");
    vi.mocked(check).mockResolvedValue({
      version: "1.0.3",
      currentVersion: "1.0.2",
      body: "### v1.0.3 — Now Updating",
    } as never);
    const store = new InMemoryUpdatePreferenceStore();
    const user = userEvent.setup();
    renderDialog(store);

    await waitFor(() =>
      expect(screen.getByText(/New Update Available/)).toBeInTheDocument(),
    );
    await user.click(
      screen.getByRole("button", { name: "Don't tell me when to upgrade!" }),
    );
    expect(screen.queryByText(/New Update Available/)).not.toBeInTheDocument();
    expect(store.getStartupPromptsEnabled()).toBe(false);
  });
});
