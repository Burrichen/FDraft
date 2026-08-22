import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { check } from "@tauri-apps/plugin-updater";
import { getVersion } from "@tauri-apps/api/app";
import { fetchPublishedReleases } from "@/infrastructure/updates/github-releases-client";
import { InMemoryUpdatePreferenceStore } from "@/infrastructure/updates/update-preference-store";
import { UpdateProvider, useUpdateContext } from "./update-provider";

vi.mock("@/infrastructure/tauri/desktop-runtime", () => ({
  isDesktopRuntime: () => true,
}));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn() }));
// Never hit the real network in tests — `runCheck` fetches this
// separately from the mocked `check()` above whenever it finds an
// update, so it needs its own mock too (default: nothing to add).
vi.mock("@/infrastructure/updates/github-releases-client", () => ({
  fetchPublishedReleases: vi.fn().mockResolvedValue([]),
}));

function Probe() {
  const {
    state,
    currentVersion,
    autoCheckEnabled,
    setAutoCheckEnabled,
    startupPromptsEnabled,
    checkNow,
    dismiss,
    disableStartupPrompts,
  } = useUpdateContext();
  return (
    <div>
      <p data-testid="phase">{state.phase}</p>
      <p data-testid="source">
        {state.phase === "available" ? state.source : "n/a"}
      </p>
      <p data-testid="skipped-releases">
        {state.phase === "available"
          ? state.skippedReleases.map((r) => r.version).join(",")
          : "n/a"}
      </p>
      <p data-testid="version">{currentVersion ?? "unknown"}</p>
      <p data-testid="auto-check">{String(autoCheckEnabled)}</p>
      <p data-testid="startup-prompts">{String(startupPromptsEnabled)}</p>
      <button onClick={() => setAutoCheckEnabled(!autoCheckEnabled)}>
        Toggle auto-check
      </button>
      <button onClick={() => void checkNow()}>Check for Updates</button>
      <button onClick={dismiss}>Update Later</button>
      <button onClick={disableStartupPrompts}>
        Don&apos;t tell me when to upgrade!
      </button>
    </div>
  );
}

function renderProvider(store = new InMemoryUpdatePreferenceStore()) {
  return render(
    <UpdateProvider store={store}>
      <Probe />
    </UpdateProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.mocked(check).mockReset();
  vi.mocked(getVersion).mockReset();
  vi.mocked(fetchPublishedReleases).mockReset().mockResolvedValue([]);
});

describe("UpdateProvider", () => {
  it("resolves and displays the running app's own version", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    vi.mocked(check).mockResolvedValue(null);
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId("version")).toHaveTextContent("1.0.0"),
    );
  });

  it("automatically checks once on mount when enabled, landing back on idle when already up to date", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    vi.mocked(check).mockResolvedValue(null);
    renderProvider();

    await waitFor(() => expect(check).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("phase")).toHaveTextContent("idle");
  });

  it("does NOT automatically check when the user has turned it off", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    vi.mocked(check).mockResolvedValue(null);
    const store = new InMemoryUpdatePreferenceStore();
    store.setAutoCheckEnabled(false);
    renderProvider(store);

    await waitFor(() =>
      expect(screen.getByTestId("version")).toHaveTextContent("1.0.0"),
    );
    expect(check).not.toHaveBeenCalled();
  });

  it("manual 'Check for Updates' still works even with automatic checking disabled", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    vi.mocked(check).mockResolvedValue(null);
    const store = new InMemoryUpdatePreferenceStore();
    store.setAutoCheckEnabled(false);
    const user = userEvent.setup();
    renderProvider(store);

    expect(check).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Check for Updates" }));
    await waitFor(() => expect(check).toHaveBeenCalledTimes(1));
  });

  it("transitions to 'available' when an update exists, surfacing its version", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    vi.mocked(check).mockResolvedValue({
      version: "1.1.0",
      currentVersion: "1.0.0",
      body: "Bug fixes",
    } as never);
    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("phase")).toHaveTextContent("available"),
    );
  });

  it("fails silently on an automatic check error — stays idle, never surfaces the error", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    vi.mocked(check).mockRejectedValue(new Error("offline"));
    renderProvider();

    await waitFor(() => expect(check).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("phase")).toHaveTextContent("idle");
  });

  it("surfaces an error from a MANUAL check, unlike an automatic one", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    vi.mocked(check).mockRejectedValue(new Error("offline"));
    const store = new InMemoryUpdatePreferenceStore();
    store.setAutoCheckEnabled(false);
    const user = userEvent.setup();
    renderProvider(store);

    await user.click(screen.getByRole("button", { name: "Check for Updates" }));
    await waitFor(() =>
      expect(screen.getByTestId("phase")).toHaveTextContent("error"),
    );
  });

  it("does not check again within the same mount after an automatic check already ran", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    vi.mocked(check).mockResolvedValue(null);
    const store = new InMemoryUpdatePreferenceStore();
    renderProvider(store);
    await waitFor(() => expect(check).toHaveBeenCalledTimes(1));

    // Nothing else re-renders this same provider instance into checking
    // again — `hasCheckedThisSession` guards exactly this case (a
    // remount, a route change), not a whole new app startup.
    await act(async () => {});
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("checks again on every fresh startup (a new mount), with no cross-session cooldown", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    vi.mocked(check).mockResolvedValue(null);
    const store = new InMemoryUpdatePreferenceStore();
    const { unmount } = renderProvider(store);
    await waitFor(() => expect(check).toHaveBeenCalledTimes(1));
    unmount();

    // A fresh mount is a fresh app startup — see docs/updates, v1.0.3
    // "Now Updating": "FDraft should automatically check for updates on
    // startup," with no minimum-interval gate suppressing it.
    renderProvider(store);
    await waitFor(() => expect(check).toHaveBeenCalledTimes(2));
  });

  it("persists the auto-check preference immediately when toggled", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    vi.mocked(check).mockResolvedValue(null);
    const store = new InMemoryUpdatePreferenceStore();
    const user = userEvent.setup();
    renderProvider(store);

    await user.click(screen.getByRole("button", { name: "Toggle auto-check" }));
    expect(store.getAutoCheckEnabled()).toBe(false);
    expect(screen.getByTestId("auto-check")).toHaveTextContent("false");
  });

  it("tags an automatically-found update as 'startup'", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    vi.mocked(check).mockResolvedValue({
      version: "1.1.0",
      currentVersion: "1.0.0",
      body: "Bug fixes",
    } as never);
    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("phase")).toHaveTextContent("available"),
    );
    expect(screen.getByTestId("source")).toHaveTextContent("startup");
  });

  it("tags a manually-found update as 'manual'", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    vi.mocked(check).mockResolvedValue({
      version: "1.1.0",
      currentVersion: "1.0.0",
      body: "Bug fixes",
    } as never);
    const store = new InMemoryUpdatePreferenceStore();
    store.setAutoCheckEnabled(false);
    const user = userEvent.setup();
    renderProvider(store);

    await user.click(screen.getByRole("button", { name: "Check for Updates" }));
    await waitFor(() =>
      expect(screen.getByTestId("phase")).toHaveTextContent("available"),
    );
    expect(screen.getByTestId("source")).toHaveTextContent("manual");
  });

  it("does not re-show the startup popup for a version already dismissed with 'Update Later', but does for a newer one", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    vi.mocked(check).mockResolvedValue({
      version: "1.1.0",
      currentVersion: "1.0.0",
      body: "Bug fixes",
    } as never);
    const store = new InMemoryUpdatePreferenceStore();
    const user = userEvent.setup();
    const { unmount } = renderProvider(store);
    await waitFor(() =>
      expect(screen.getByTestId("phase")).toHaveTextContent("available"),
    );
    await user.click(screen.getByRole("button", { name: "Update Later" }));
    expect(store.getLastPromptedVersion()).toBe("1.1.0");
    unmount();

    // Same version again on the next startup — silently skipped.
    renderProvider(store);
    await waitFor(() => expect(check).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("phase")).toHaveTextContent("idle");
  });

  it("shows the startup popup again once a newer version is found", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    const store = new InMemoryUpdatePreferenceStore();
    store.setLastPromptedVersion("1.1.0");
    vi.mocked(check).mockResolvedValue({
      version: "1.2.0",
      currentVersion: "1.0.0",
      body: "More fixes",
    } as never);
    renderProvider(store);

    await waitFor(() =>
      expect(screen.getByTestId("phase")).toHaveTextContent("available"),
    );
  });

  it("'Don't tell me when to upgrade!' suppresses future startup popups but leaves manual checking working", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    vi.mocked(check).mockResolvedValue({
      version: "1.1.0",
      currentVersion: "1.0.0",
      body: "Bug fixes",
    } as never);
    const store = new InMemoryUpdatePreferenceStore();
    const user = userEvent.setup();
    const { unmount } = renderProvider(store);
    await waitFor(() =>
      expect(screen.getByTestId("phase")).toHaveTextContent("available"),
    );
    await user.click(
      screen.getByRole("button", { name: "Don't tell me when to upgrade!" }),
    );
    expect(store.getStartupPromptsEnabled()).toBe(false);
    expect(screen.getByTestId("startup-prompts")).toHaveTextContent("false");
    unmount();

    // Next startup: the automatic check still runs (autoCheckEnabled is
    // untouched), but no popup appears for it.
    renderProvider(store);
    await waitFor(() => expect(check).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("phase")).toHaveTextContent("idle");

    // A manual check, though, still surfaces it.
    await user.click(screen.getByRole("button", { name: "Check for Updates" }));
    await waitFor(() =>
      expect(screen.getByTestId("phase")).toHaveTextContent("available"),
    );
    expect(screen.getByTestId("source")).toHaveTextContent("manual");
  });

  it("fills in any release skipped by a multi-version jump, without delaying the dialog itself", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.0.1");
    vi.mocked(check).mockResolvedValue({
      version: "1.0.3",
      currentVersion: "1.0.1",
      body: "### v1.0.3 — Now Updating\n\nLatest notes",
    } as never);
    vi.mocked(fetchPublishedReleases).mockResolvedValue([
      { version: "1.0.1", body: "### v1.0.1 — First" },
      { version: "1.0.2", body: "### v1.0.2 — The Green Pen Patch" },
      { version: "1.0.3", body: "### v1.0.3 — Now Updating" },
    ]);
    renderProvider();

    // The dialog itself appears immediately, before the extra lookup
    // resolves — it's additive, never a precondition for showing it.
    await waitFor(() =>
      expect(screen.getByTestId("phase")).toHaveTextContent("available"),
    );
    await waitFor(() =>
      expect(screen.getByTestId("skipped-releases")).toHaveTextContent("1.0.2"),
    );
    // Neither the current version (1.0.1) nor the target itself (1.0.3,
    // already the dialog's own primary heading) appear in the list.
    expect(screen.getByTestId("skipped-releases")).toHaveTextContent("1.0.2");
    expect(screen.getByTestId("skipped-releases").textContent).not.toContain(
      "1.0.1",
    );
    expect(screen.getByTestId("skipped-releases").textContent).not.toContain(
      "1.0.3",
    );
  });

  it("leaves skippedReleases empty when the lookup fails, without surfacing an error", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.0.1");
    vi.mocked(check).mockResolvedValue({
      version: "1.0.3",
      currentVersion: "1.0.1",
      body: "Notes",
    } as never);
    vi.mocked(fetchPublishedReleases).mockRejectedValue(new Error("offline"));
    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("phase")).toHaveTextContent("available"),
    );
    await act(async () => {});
    expect(screen.getByTestId("skipped-releases")).toHaveTextContent("");
  });
});
