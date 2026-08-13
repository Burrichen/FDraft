import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { check } from "@tauri-apps/plugin-updater";
import { getVersion } from "@tauri-apps/api/app";
import { InMemoryUpdatePreferenceStore } from "@/infrastructure/updates/update-preference-store";
import { UpdateProvider, useUpdateContext } from "./update-provider";

vi.mock("@/infrastructure/tauri/desktop-runtime", () => ({
  isDesktopRuntime: () => true,
}));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn() }));

function Probe() {
  const {
    state,
    currentVersion,
    autoCheckEnabled,
    setAutoCheckEnabled,
    checkNow,
  } = useUpdateContext();
  return (
    <div>
      <p data-testid="phase">{state.phase}</p>
      <p data-testid="version">{currentVersion ?? "unknown"}</p>
      <p data-testid="auto-check">{String(autoCheckEnabled)}</p>
      <button onClick={() => setAutoCheckEnabled(!autoCheckEnabled)}>
        Toggle auto-check
      </button>
      <button onClick={() => void checkNow()}>Check for Updates</button>
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

  it("does not check again this session after an automatic check already ran, even via a second mount of the same store", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.0.0");
    vi.mocked(check).mockResolvedValue(null);
    const store = new InMemoryUpdatePreferenceStore();
    const { unmount } = renderProvider(store);
    await waitFor(() => expect(check).toHaveBeenCalledTimes(1));
    unmount();

    // A fresh mount is a fresh session in this provider's own model (the
    // "already checked" guard is an in-memory ref) — the cross-session
    // guard is `lastCheckedAt` instead, which the fake store now has set.
    renderProvider(store);
    await act(async () => {});
    expect(check).toHaveBeenCalledTimes(1);
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
});
