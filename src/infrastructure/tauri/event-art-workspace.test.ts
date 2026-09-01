import { afterEach, describe, expect, it, vi } from "vitest";

const isDesktopRuntimeMock = vi.fn<() => boolean>();
vi.mock("./desktop-runtime", () => ({
  isDesktopRuntime: () => isDesktopRuntimeMock(),
}));

const openMock = vi.fn();
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => openMock(...args),
}));

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

const openPathMock = vi.fn();
vi.mock("@tauri-apps/plugin-opener", () => ({
  openPath: (...args: unknown[]) => openPathMock(...args),
}));

const {
  openEventArtWorkspaceFolder,
  pickEventArtWorkspaceFolder,
  validateEventArtWorkspaceFolder,
  checkEventArtWorkspaceAssetPaths,
  readCanonicalThemeFile,
  writeCanonicalThemeFile,
  pickImportSourceFile,
  copyEventArtAsset,
  deleteEventArtAsset,
  getDevProjectRoot,
} = await import("./event-art-workspace");

describe("Event Art Workspace native seam — graceful degradation outside the desktop shell (EVENT STUDIO — PHASE 2 §8)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("pickEventArtWorkspaceFolder returns null (never throws) when not running inside Tauri", async () => {
    isDesktopRuntimeMock.mockReturnValue(false);
    await expect(pickEventArtWorkspaceFolder()).resolves.toBeNull();
    expect(openMock).not.toHaveBeenCalled();
  });

  it("pickEventArtWorkspaceFolder opens a directory-only dialog and returns the chosen path", async () => {
    isDesktopRuntimeMock.mockReturnValue(true);
    openMock.mockResolvedValue("/Users/dev/FDraft");

    const result = await pickEventArtWorkspaceFolder();

    expect(result).toBe("/Users/dev/FDraft");
    expect(openMock).toHaveBeenCalledWith(
      expect.objectContaining({ directory: true }),
    );
  });

  it("pickEventArtWorkspaceFolder returns null when the user cancels", async () => {
    isDesktopRuntimeMock.mockReturnValue(true);
    openMock.mockResolvedValue(null);

    expect(await pickEventArtWorkspaceFolder()).toBeNull();
  });

  it("validateEventArtWorkspaceFolder reports invalid (never throws) when not running inside Tauri", async () => {
    isDesktopRuntimeMock.mockReturnValue(false);

    const result = await validateEventArtWorkspaceFolder("/some/path");

    expect(result.valid).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("validateEventArtWorkspaceFolder forwards the path to the Rust command and returns its verdict", async () => {
    isDesktopRuntimeMock.mockReturnValue(true);
    invokeMock.mockResolvedValue({ valid: true, missing: [] });

    const result = await validateEventArtWorkspaceFolder("/Users/dev/FDraft");

    expect(result).toEqual({ valid: true, missing: [] });
    expect(invokeMock).toHaveBeenCalledWith(
      "validate_event_art_workspace_folder",
      { path: "/Users/dev/FDraft" },
    );
  });

  it("validateEventArtWorkspaceFolder reports the missing markers for an invalid folder", async () => {
    isDesktopRuntimeMock.mockReturnValue(true);
    invokeMock.mockResolvedValue({
      valid: false,
      missing: ["public/events/", "public/event-themes/"],
    });

    const result = await validateEventArtWorkspaceFolder("/tmp/not-fdraft");

    expect(result.valid).toBe(false);
    expect(result.missing).toEqual(["public/events/", "public/event-themes/"]);
  });

  it("openEventArtWorkspaceFolder is a safe no-op outside the desktop shell", async () => {
    isDesktopRuntimeMock.mockReturnValue(false);
    await expect(
      openEventArtWorkspaceFolder("/Users/dev/FDraft"),
    ).resolves.toBeUndefined();
    expect(openPathMock).not.toHaveBeenCalled();
  });

  it("openEventArtWorkspaceFolder opens the path via the shared opener plugin", async () => {
    isDesktopRuntimeMock.mockReturnValue(true);
    openPathMock.mockResolvedValue(undefined);

    await openEventArtWorkspaceFolder("/Users/dev/FDraft");

    expect(openPathMock).toHaveBeenCalledWith("/Users/dev/FDraft");
  });

  it("never throws even if the underlying plugin call rejects", async () => {
    isDesktopRuntimeMock.mockReturnValue(true);
    openMock.mockRejectedValue(new Error("dialog unavailable"));
    invokeMock.mockRejectedValue(new Error("command not registered"));
    openPathMock.mockRejectedValue(new Error("opener failed"));

    await expect(pickEventArtWorkspaceFolder()).resolves.toBeNull();
    await expect(validateEventArtWorkspaceFolder("/x")).resolves.toMatchObject({
      valid: false,
    });
    await expect(openEventArtWorkspaceFolder("/x")).resolves.toBeUndefined();
  });
});

describe("checkEventArtWorkspaceAssetPaths (EVENT STUDIO — PHASE 6 §11)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reports every path as false (never throws) outside the desktop shell", async () => {
    isDesktopRuntimeMock.mockReturnValue(false);
    const result = await checkEventArtWorkspaceAssetPaths("/repo", [
      "events/halloween/interactives/ghost-1.png",
    ]);
    expect(result).toEqual({
      "events/halloween/interactives/ghost-1.png": false,
    });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("forwards the paths and returns the Rust command's verdict", async () => {
    isDesktopRuntimeMock.mockReturnValue(true);
    invokeMock.mockResolvedValue({
      "events/halloween/interactives/ghost-1.png": true,
      "events/halloween/interactives/missing-cat.png": false,
    });

    const result = await checkEventArtWorkspaceAssetPaths("/repo", [
      "events/halloween/interactives/ghost-1.png",
      "events/halloween/interactives/missing-cat.png",
    ]);

    expect(result["events/halloween/interactives/ghost-1.png"]).toBe(true);
    expect(result["events/halloween/interactives/missing-cat.png"]).toBe(false);
    expect(invokeMock).toHaveBeenCalledWith(
      "check_event_art_workspace_asset_paths",
      {
        path: "/repo",
        relativePaths: [
          "events/halloween/interactives/ghost-1.png",
          "events/halloween/interactives/missing-cat.png",
        ],
      },
    );
  });

  it("degrades to false for every path if the command itself throws", async () => {
    isDesktopRuntimeMock.mockReturnValue(true);
    invokeMock.mockRejectedValue(new Error("command not registered"));

    const result = await checkEventArtWorkspaceAssetPaths("/repo", [
      "events/a.png",
    ]);

    expect(result).toEqual({ "events/a.png": false });
  });
});

describe("readCanonicalThemeFile / writeCanonicalThemeFile (EVENT STUDIO — PHASE 6 §12)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("readCanonicalThemeFile returns null outside the desktop shell", async () => {
    isDesktopRuntimeMock.mockReturnValue(false);
    await expect(
      readCanonicalThemeFile("/repo", "halloween"),
    ).resolves.toBeNull();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("readCanonicalThemeFile forwards to the Rust command and returns its content", async () => {
    isDesktopRuntimeMock.mockReturnValue(true);
    invokeMock.mockResolvedValue('{"themeId":"halloween"}');

    const result = await readCanonicalThemeFile("/repo", "halloween");

    expect(result).toBe('{"themeId":"halloween"}');
    expect(invokeMock).toHaveBeenCalledWith("read_canonical_theme_file", {
      path: "/repo",
      themeId: "halloween",
    });
  });

  it("readCanonicalThemeFile returns null (never throws) if the command rejects", async () => {
    isDesktopRuntimeMock.mockReturnValue(true);
    invokeMock.mockRejectedValue(new Error("boom"));
    await expect(
      readCanonicalThemeFile("/repo", "halloween"),
    ).resolves.toBeNull();
  });

  it("writeCanonicalThemeFile reports a clear error outside the desktop shell, never writing", async () => {
    isDesktopRuntimeMock.mockReturnValue(false);
    const result = await writeCanonicalThemeFile("/repo", "halloween", "{}");
    expect(result.ok).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("writeCanonicalThemeFile forwards to the Rust command and reports success", async () => {
    isDesktopRuntimeMock.mockReturnValue(true);
    invokeMock.mockResolvedValue(undefined);

    const result = await writeCanonicalThemeFile(
      "/repo",
      "halloween",
      '{"themeId":"halloween"}',
    );

    expect(result).toEqual({ ok: true });
    expect(invokeMock).toHaveBeenCalledWith("write_canonical_theme_file", {
      path: "/repo",
      themeId: "halloween",
      contents: '{"themeId":"halloween"}',
    });
  });

  it("writeCanonicalThemeFile surfaces the underlying error message on failure", async () => {
    isDesktopRuntimeMock.mockReturnValue(true);
    invokeMock.mockRejectedValue(new Error("disk full"));

    const result = await writeCanonicalThemeFile("/repo", "halloween", "{}");

    expect(result).toEqual({ ok: false, error: "disk full" });
  });
});

describe("pickImportSourceFile / copyEventArtAsset / deleteEventArtAsset / getDevProjectRoot (EVENT STUDIO — PHASE 9)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("pickImportSourceFile returns null outside the desktop shell", async () => {
    isDesktopRuntimeMock.mockReturnValue(false);
    await expect(pickImportSourceFile()).resolves.toBeNull();
    expect(openMock).not.toHaveBeenCalled();
  });

  it("pickImportSourceFile opens a file dialog restricted to png/webp/svg", async () => {
    isDesktopRuntimeMock.mockReturnValue(true);
    openMock.mockResolvedValue("/Users/dev/Pictures/ghost.png");

    const result = await pickImportSourceFile();

    expect(result).toBe("/Users/dev/Pictures/ghost.png");
    expect(openMock).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: false,
        filters: [{ name: "Images", extensions: ["png", "webp", "svg"] }],
      }),
    );
  });

  it("pickImportSourceFile returns null when the user cancels", async () => {
    isDesktopRuntimeMock.mockReturnValue(true);
    openMock.mockResolvedValue(null);
    expect(await pickImportSourceFile()).toBeNull();
  });

  it("copyEventArtAsset reports a clear error outside the desktop shell, never invoking", async () => {
    isDesktopRuntimeMock.mockReturnValue(false);
    const result = await copyEventArtAsset(
      "/repo",
      "/tmp/ghost.png",
      "halloween",
      "decorations",
      "ghost.png",
    );
    expect(result.ok).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("copyEventArtAsset forwards to the Rust command and returns the new relative path", async () => {
    isDesktopRuntimeMock.mockReturnValue(true);
    invokeMock.mockResolvedValue("events/halloween/decorations/ghost.png");

    const result = await copyEventArtAsset(
      "/repo",
      "/tmp/ghost.png",
      "halloween",
      "decorations",
      "ghost.png",
    );

    expect(result).toEqual({
      ok: true,
      relativePath: "events/halloween/decorations/ghost.png",
    });
    expect(invokeMock).toHaveBeenCalledWith("copy_event_art_asset", {
      path: "/repo",
      sourcePath: "/tmp/ghost.png",
      eventId: "halloween",
      category: "decorations",
      fileName: "ghost.png",
    });
  });

  it("copyEventArtAsset surfaces the underlying error message on failure", async () => {
    isDesktopRuntimeMock.mockReturnValue(true);
    invokeMock.mockRejectedValue(new Error("Invalid category."));

    const result = await copyEventArtAsset(
      "/repo",
      "/tmp/ghost.png",
      "halloween",
      "not-real",
      "ghost.png",
    );

    expect(result).toEqual({ ok: false, error: "Invalid category." });
  });

  it("deleteEventArtAsset reports a clear error outside the desktop shell, never invoking", async () => {
    isDesktopRuntimeMock.mockReturnValue(false);
    const result = await deleteEventArtAsset(
      "/repo",
      "events/halloween/decorations/ghost.png",
    );
    expect(result.ok).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("deleteEventArtAsset forwards to the Rust command and reports success", async () => {
    isDesktopRuntimeMock.mockReturnValue(true);
    invokeMock.mockResolvedValue(undefined);

    const result = await deleteEventArtAsset(
      "/repo",
      "events/halloween/decorations/ghost.png",
    );

    expect(result).toEqual({ ok: true });
    expect(invokeMock).toHaveBeenCalledWith("delete_event_art_asset", {
      path: "/repo",
      relativeAssetPath: "events/halloween/decorations/ghost.png",
    });
  });

  it("deleteEventArtAsset surfaces the underlying error message on failure", async () => {
    isDesktopRuntimeMock.mockReturnValue(true);
    invokeMock.mockRejectedValue(new Error("Asset not found."));

    const result = await deleteEventArtAsset("/repo", "events/halloween/x.png");

    expect(result).toEqual({ ok: false, error: "Asset not found." });
  });

  it("getDevProjectRoot returns null outside the desktop shell", async () => {
    isDesktopRuntimeMock.mockReturnValue(false);
    await expect(getDevProjectRoot()).resolves.toBeNull();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("getDevProjectRoot forwards to the Rust command and returns its result", async () => {
    isDesktopRuntimeMock.mockReturnValue(true);
    invokeMock.mockResolvedValue("/Users/dev/FDraft");

    const result = await getDevProjectRoot();

    expect(result).toBe("/Users/dev/FDraft");
    expect(invokeMock).toHaveBeenCalledWith("get_dev_project_root");
  });

  it("getDevProjectRoot returns null (never throws) if the command rejects", async () => {
    isDesktopRuntimeMock.mockReturnValue(true);
    invokeMock.mockRejectedValue(new Error("not registered"));
    await expect(getDevProjectRoot()).resolves.toBeNull();
  });
});
