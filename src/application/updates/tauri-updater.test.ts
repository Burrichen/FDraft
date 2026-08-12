import { describe, expect, it, vi } from "vitest";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  checkForUpdate,
  downloadAndInstallUpdate,
  relaunchApp,
  type UpdateHandle,
} from "./tauri-updater";

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn(),
}));

function fakeHandle(
  downloadAndInstall: (onEvent?: (event: unknown) => void) => Promise<void>,
): UpdateHandle {
  return { _update: { downloadAndInstall } as never };
}

describe("checkForUpdate", () => {
  it("reports up-to-date when the updater endpoint has nothing newer", async () => {
    vi.mocked(check).mockResolvedValue(null);
    expect(await checkForUpdate()).toEqual({ status: "up-to-date" });
  });

  it("reports available with the release's version and notes", async () => {
    vi.mocked(check).mockResolvedValue({
      version: "1.1.0",
      currentVersion: "1.0.0",
      body: "• New challenge options\n• Bug fixes",
    } as never);

    const result = await checkForUpdate();
    expect(result.status).toBe("available");
    if (result.status === "available") {
      expect(result.info).toEqual({
        version: "1.1.0",
        currentVersion: "1.0.0",
        releaseNotes: "• New challenge options\n• Bug fixes",
      });
    }
  });

  it("reports releaseNotes as null when the release has no body", async () => {
    vi.mocked(check).mockResolvedValue({
      version: "1.1.0",
      currentVersion: "1.0.0",
    } as never);

    const result = await checkForUpdate();
    expect(result.status).toBe("available");
    if (result.status === "available") {
      expect(result.info.releaseNotes).toBeNull();
    }
  });

  it("fails soft — a thrown network error becomes a structured error result, never an unhandled rejection", async () => {
    vi.mocked(check).mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await checkForUpdate()).toEqual({
      status: "error",
      message: "Failed to fetch",
    });
  });

  it("fails soft for a non-Error rejection too (a malformed manifest, say)", async () => {
    vi.mocked(check).mockRejectedValue("not an Error instance");
    const result = await checkForUpdate();
    expect(result.status).toBe("error");
  });
});

describe("downloadAndInstallUpdate", () => {
  it("reports install progress from Started/Progress/Finished events", async () => {
    const handle = fakeHandle(async (onEvent) => {
      onEvent?.({ event: "Started", data: { contentLength: 200 } });
      onEvent?.({ event: "Progress", data: { chunkLength: 100 } });
      onEvent?.({ event: "Progress", data: { chunkLength: 100 } });
      onEvent?.({ event: "Finished" });
    });

    const events: unknown[] = [];
    const result = await downloadAndInstallUpdate(handle, (p) =>
      events.push(p),
    );

    expect(result).toEqual({ status: "installed" });
    expect(events).toEqual([
      { phase: "started", totalBytes: 200 },
      { phase: "progress", percent: 50 },
      { phase: "progress", percent: 100 },
      { phase: "finished" },
    ]);
  });

  it("reports an indeterminate (null) percent when the release has no content-length", async () => {
    const handle = fakeHandle(async (onEvent) => {
      onEvent?.({ event: "Started", data: {} });
      onEvent?.({ event: "Progress", data: { chunkLength: 100 } });
    });

    const events: unknown[] = [];
    await downloadAndInstallUpdate(handle, (p) => events.push(p));

    expect(events).toEqual([
      { phase: "started", totalBytes: null },
      { phase: "progress", percent: null },
    ]);
  });

  it("fails soft when the download/install itself throws", async () => {
    const handle = fakeHandle(async () => {
      throw new Error("disk full");
    });
    expect(await downloadAndInstallUpdate(handle)).toEqual({
      status: "error",
      message: "disk full",
    });
  });
});

describe("relaunchApp", () => {
  it("delegates directly to the process plugin's relaunch", async () => {
    await relaunchApp();
    expect(relaunch).toHaveBeenCalledTimes(1);
  });
});
