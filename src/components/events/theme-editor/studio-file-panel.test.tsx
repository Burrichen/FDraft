import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import {
  addPlacement,
  createFixedPlacement,
} from "@/domain/event-studio/placement-ops";
import { fdraftThemeSchema } from "@/domain/event-themes/fdraft-theme-schema";

const getStudioRevisionsMock = vi.fn();
const addStudioRevisionMock = vi.fn();
vi.mock("@/application/event-studio/studio-revisions-store", () => ({
  getStudioRevisions: (...args: unknown[]) => getStudioRevisionsMock(...args),
  addStudioRevision: (...args: unknown[]) => addStudioRevisionMock(...args),
  createRevisionLabel: (at: Date = new Date()) =>
    `Saved ${at.toLocaleTimeString()}`,
}));

const loadCanonicalEventThemeMock = vi.fn();
vi.mock("@/application/event-themes/load-canonical-event-theme", () => ({
  loadCanonicalEventTheme: (...args: unknown[]) =>
    loadCanonicalEventThemeMock(...args),
}));

const downloadThemeFileMock = vi.fn();
vi.mock("@/application/event-studio/theme-download", () => ({
  downloadThemeFile: (...args: unknown[]) => downloadThemeFileMock(...args),
}));

const checkEventArtWorkspaceAssetPathsMock = vi.fn();
const readCanonicalThemeFileMock = vi.fn();
const writeCanonicalThemeFileMock = vi.fn();
vi.mock("@/infrastructure/tauri/event-art-workspace", () => ({
  checkEventArtWorkspaceAssetPaths: (...args: unknown[]) =>
    checkEventArtWorkspaceAssetPathsMock(...args),
  readCanonicalThemeFile: (...args: unknown[]) =>
    readCanonicalThemeFileMock(...args),
  writeCanonicalThemeFile: (...args: unknown[]) =>
    writeCanonicalThemeFileMock(...args),
}));

const { StudioFilePanel } = await import("./studio-file-panel");

const WATCHLIST = {
  pageId: "watchlist" as const,
  stateId: "active",
  breakpointId: "desktop" as const,
};

function themeWithGhost(assetPath = "events/halloween/interactives/ghost.png") {
  const empty = fdraftThemeSchema.parse({
    schemaVersion: 1,
    themeId: "halloween",
    eventId: "halloween",
    scope: "event",
    assets: { ghost: assetPath },
    layouts: {},
  });
  return addPlacement(empty, WATCHLIST, createFixedPlacement("p1", "ghost"));
}

function baseProps(
  overrides: Partial<Parameters<typeof StudioFilePanel>[0]> = {},
) {
  return {
    open: true,
    onOpenChange: vi.fn(),
    profileId: "alex",
    presetId: "halloween",
    presetLabel: "Halloween",
    pageId: "watchlist" as const,
    pageLabel: "Watchlist",
    stateId: "active",
    breakpointId: "desktop" as const,
    breakpointLabel: "Desktop",
    theme: themeWithGhost(),
    workspacePath: null,
    onCommitTheme: vi.fn(),
    ...overrides,
  };
}

describe("StudioFilePanel (EVENT STUDIO — PHASE 6)", () => {
  let db: FDraftLocalDatabase;

  beforeEach(() => {
    getStudioRevisionsMock.mockResolvedValue([]);
  });

  afterEach(async () => {
    cleanup();
    vi.clearAllMocks();
    await db?.delete();
  });

  async function renderPanel(
    overrides: Partial<Parameters<typeof StudioFilePanel>[0]> = {},
  ) {
    db = new FDraftLocalDatabase(`studio-file-panel-${crypto.randomUUID()}`);
    const repositories = createLocalRepositories(db);
    render(
      <StudioFilePanel {...baseProps(overrides)} repositories={repositories} />,
    );
    await waitFor(() =>
      expect(screen.getByText("Studio File")).toBeInTheDocument(),
    );
  }

  it("shows an empty state when there are no revisions yet", async () => {
    await renderPanel();
    await waitFor(() =>
      expect(screen.getByText("No revisions yet.")).toBeInTheDocument(),
    );
  });

  it("lists revisions and restoring one commits its theme", async () => {
    const revisionTheme = themeWithGhost();
    getStudioRevisionsMock.mockResolvedValue([
      {
        id: "rev-1",
        label: "Saved 14:32",
        theme: revisionTheme,
        createdAt: "2026-09-01T14:32:00.000Z",
      },
    ]);
    const onCommitTheme = vi.fn();
    await renderPanel({ onCommitTheme });

    await waitFor(() =>
      expect(screen.getByText("Saved 14:32")).toBeInTheDocument(),
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Restore" }));

    expect(onCommitTheme).toHaveBeenCalledWith(revisionTheme);
  });

  it("Reset Current Page fetches the canonical theme and commits the page-scoped reset", async () => {
    const canonical = themeWithGhost();
    loadCanonicalEventThemeMock.mockResolvedValue({
      ok: true,
      theme: canonical,
    });
    const onCommitTheme = vi.fn();
    await renderPanel({ onCommitTheme });

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: /Reset Current Page/i }),
    );

    await waitFor(() => expect(onCommitTheme).toHaveBeenCalled());
    expect(loadCanonicalEventThemeMock).toHaveBeenCalledWith("halloween");
  });

  it("Reset Entire Event/Preset requires confirmation before committing", async () => {
    const canonical = themeWithGhost();
    loadCanonicalEventThemeMock.mockResolvedValue({
      ok: true,
      theme: canonical,
    });
    const onCommitTheme = vi.fn();
    await renderPanel({ onCommitTheme });

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Reset Entire Event/Preset…" }),
    );
    expect(onCommitTheme).not.toHaveBeenCalled();
    expect(
      screen.getByText("Reset the entire Event/Preset?"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reset everything" }));

    await waitFor(() => expect(onCommitTheme).toHaveBeenCalledWith(canonical));
  });

  it("Import: a valid file offers replace-entire-preset and page-scoped-import, and replace commits the imported theme after confirmation", async () => {
    const imported = themeWithGhost();
    const onCommitTheme = vi.fn();
    await renderPanel({ onCommitTheme });

    const file = new File(
      [JSON.stringify(imported)],
      "halloween.fdraft-theme",
      {
        type: "application/json",
      },
    );
    const input = screen.getByLabelText("Import .fdraft-theme file");
    const user = userEvent.setup();
    await user.upload(input, file);

    await waitFor(() =>
      expect(screen.getByText(/halloween/)).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole("button", { name: "Replace entire preset" }),
    );
    await user.click(screen.getByRole("button", { name: "Replace" }));

    expect(onCommitTheme).toHaveBeenCalledWith(imported);
  });

  it("Import: a malformed file shows a clear error and offers no scope actions", async () => {
    await renderPanel();
    const file = new File(["not json"], "broken.fdraft-theme", {
      type: "application/json",
    });
    const input = screen.getByLabelText("Import .fdraft-theme file");
    const user = userEvent.setup();
    await user.upload(input, file);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/JSON/i),
    );
    expect(
      screen.queryByRole("button", { name: "Replace entire preset" }),
    ).not.toBeInTheDocument();
  });

  it("Export Current Page shows a ready-to-export preview and downloads on click", async () => {
    const onCommitTheme = vi.fn();
    await renderPanel({ onCommitTheme });

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Export Current Page…" }),
    );

    await waitFor(() =>
      expect(screen.getByText(/Ready to export/)).toBeInTheDocument(),
    );
    expect(
      screen.getByText("Halloween - Watchlist.fdraft-theme"),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Download .fdraft-theme" }),
    );
    expect(downloadThemeFileMock).toHaveBeenCalledWith(
      expect.objectContaining({ themeId: "halloween" }),
      "Halloween - Watchlist.fdraft-theme",
    );
  });

  it("Export to FDraft Repo: blocks on missing required assets and offers an explicit override", async () => {
    checkEventArtWorkspaceAssetPathsMock.mockResolvedValue({
      "events/halloween/interactives/ghost.png": false,
    });
    readCanonicalThemeFileMock.mockResolvedValue(null);
    await renderPanel({ workspacePath: "/Users/dev/FDraft" });

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Export to FDraft Repo" }),
    );

    await waitFor(() =>
      expect(screen.getByText("Missing required assets:")).toBeInTheDocument(),
    );
    expect(writeCanonicalThemeFileMock).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", {
        name: "Export anyway despite missing assets",
      }),
    );

    await waitFor(() =>
      expect(
        screen.getByText("Write the canonical theme?"),
      ).toBeInTheDocument(),
    );
  });

  it("Export to FDraft Repo: writes the file, backing up an existing canonical theme as a revision first", async () => {
    checkEventArtWorkspaceAssetPathsMock.mockResolvedValue({
      "events/halloween/interactives/ghost.png": true,
    });
    const existingCanonical = themeWithGhost(
      "events/halloween/interactives/old.png",
    );
    readCanonicalThemeFileMock.mockResolvedValue(
      JSON.stringify(existingCanonical),
    );
    writeCanonicalThemeFileMock.mockResolvedValue({ ok: true });
    await renderPanel({ workspacePath: "/Users/dev/FDraft" });

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Export to FDraft Repo" }),
    );

    await waitFor(() =>
      expect(
        screen.getByText("Overwrite the existing canonical theme?"),
      ).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Export" }));

    await waitFor(() => expect(writeCanonicalThemeFileMock).toHaveBeenCalled());
    expect(addStudioRevisionMock).toHaveBeenCalledWith(
      expect.anything(),
      "alex",
      "halloween",
      existingCanonical,
      "Backup before repo export",
    );
    await waitFor(() =>
      expect(screen.getByText(/Exported to the repo\./)).toBeInTheDocument(),
    );
  });

  it("EVENT STUDIO — PHASE 7 §3: exported JSON never contains editor-only chrome (selection/locks/groups/undo history)", async () => {
    await renderPanel();

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Export Entire Event/Preset…" }),
    );
    await waitFor(() =>
      expect(screen.getByText(/Ready to export/)).toBeInTheDocument(),
    );
    await user.click(
      screen.getByRole("button", { name: "Download .fdraft-theme" }),
    );

    expect(downloadThemeFileMock).toHaveBeenCalled();
    const [exportedTheme] = downloadThemeFileMock.mock.calls[0]!;
    const exportedJson = JSON.stringify(exportedTheme);
    for (const chromeKey of [
      "selectedPlacementIds",
      "lockedPlacementIds",
      '"groups"',
      "undoHistory",
      '"history"',
      "marqueeRect",
      "snapToGrid",
      "showGrid",
      "safeZone",
    ]) {
      expect(exportedJson).not.toContain(chromeKey);
    }
    // The theme itself still round-trips through the exact shared
    // production schema — this isn't just "no obviously-bad keys", it's
    // "still a fully valid theme file."
    expect(fdraftThemeSchema.safeParse(exportedTheme).success).toBe(true);
  });
});
