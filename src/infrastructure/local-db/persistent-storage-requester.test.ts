import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserPersistentStorageRequester } from "./persistent-storage-requester";

describe("BrowserPersistentStorageRequester", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls navigator.storage.persist() the first time, when not already persisted", async () => {
    const persist = vi.fn().mockResolvedValue(true);
    const persisted = vi.fn().mockResolvedValue(false);
    vi.stubGlobal("navigator", { storage: { persist, persisted } });

    await new BrowserPersistentStorageRequester().requestOnce();

    expect(persisted).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("never asks twice, even across separate instances", async () => {
    const persist = vi.fn().mockResolvedValue(true);
    const persisted = vi.fn().mockResolvedValue(false);
    vi.stubGlobal("navigator", { storage: { persist, persisted } });

    await new BrowserPersistentStorageRequester().requestOnce();
    await new BrowserPersistentStorageRequester().requestOnce();

    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("skips calling persist() if storage is already persisted", async () => {
    const persist = vi.fn().mockResolvedValue(true);
    const persisted = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("navigator", { storage: { persist, persisted } });

    await new BrowserPersistentStorageRequester().requestOnce();

    expect(persisted).toHaveBeenCalledTimes(1);
    expect(persist).not.toHaveBeenCalled();
  });

  it("does nothing, without throwing, in a browser with no Storage Manager API", async () => {
    vi.stubGlobal("navigator", {});

    await expect(
      new BrowserPersistentStorageRequester().requestOnce(),
    ).resolves.toBeUndefined();
    expect(
      window.localStorage.getItem("fdraft:storage-persist-requested"),
    ).toBe("1");
  });

  it("swallows an unexpected rejection from persist() rather than throwing", async () => {
    const persist = vi
      .fn()
      .mockRejectedValue(new Error("denied by embedder policy"));
    const persisted = vi.fn().mockResolvedValue(false);
    vi.stubGlobal("navigator", { storage: { persist, persisted } });

    await expect(
      new BrowserPersistentStorageRequester().requestOnce(),
    ).resolves.toBeUndefined();
  });
});
