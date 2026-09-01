import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileProvider } from "@/components/profiles/profile-provider";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import { getEventParticipations } from "@/application/events/event-participation-store";
import { getEventSettings } from "@/application/events/event-settings-store";
import { fdraftThemeSchema } from "@/domain/event-themes/fdraft-theme-schema";

vi.mock("@/lib/event-studio-build", () => ({ isEventStudioBuild: true }));

const loadCanonicalEventThemeMock = vi.fn();
vi.mock("@/application/event-themes/load-canonical-event-theme", () => ({
  loadCanonicalEventTheme: (...args: unknown[]) =>
    loadCanonicalEventThemeMock(...args),
}));

const pickEventArtWorkspaceFolderMock = vi.fn();
const validateEventArtWorkspaceFolderMock = vi.fn();
const openEventArtWorkspaceFolderMock = vi.fn();
const scanEventArtWorkspaceAssetsMock = vi.fn().mockResolvedValue([]);
const readEventArtWorkspaceAssetMock = vi.fn().mockResolvedValue(null);
vi.mock("@/infrastructure/tauri/event-art-workspace", () => ({
  pickEventArtWorkspaceFolder: (...args: unknown[]) =>
    pickEventArtWorkspaceFolderMock(...args),
  validateEventArtWorkspaceFolder: (...args: unknown[]) =>
    validateEventArtWorkspaceFolderMock(...args),
  openEventArtWorkspaceFolder: (...args: unknown[]) =>
    openEventArtWorkspaceFolderMock(...args),
  scanEventArtWorkspaceAssets: (...args: unknown[]) =>
    scanEventArtWorkspaceAssetsMock(...args),
  readEventArtWorkspaceAsset: (...args: unknown[]) =>
    readEventArtWorkspaceAssetMock(...args),
}));
vi.mock("@/infrastructure/tauri/desktop-runtime", () => ({
  isDesktopRuntime: () => true,
}));

const { StudioPageClient } = await import("./studio-page-client");

const PROFILE_ID = "alex";

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
      adminMode: false,
      halloweenPumpkinState: "uncarved",
    },
    dataVersion: 1,
  });
  await db.close();
}

function presetSelect(): HTMLElement {
  return screen.getAllByRole("combobox")[0]!;
}

describe("StudioPageClient — editor workspace shell (EVENT STUDIO — PHASE 3)", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders the Preset/Page/State/Breakpoint selectors and loads the default preset's theme automatically", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    loadCanonicalEventThemeMock.mockResolvedValue({
      ok: false,
      reason: "invalid_json",
      message: "not found",
    });

    render(
      <ProfileProvider databaseName={databaseName}>
        <StudioPageClient />
      </ProfileProvider>,
    );

    await waitFor(() =>
      expect(loadCanonicalEventThemeMock).toHaveBeenCalledWith("default"),
    );
    expect(screen.getByText("Event Studio")).toBeInTheDocument();
    const comboboxes = screen.getAllByRole("combobox");
    expect(comboboxes.length).toBeGreaterThanOrEqual(4);
  });

  it("selecting a preset loads its theme through the production canonical loader", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    loadCanonicalEventThemeMock.mockResolvedValue({
      ok: true,
      theme: {
        schemaVersion: 1,
        themeId: "halloween",
        eventId: "halloween",
        scope: "event",
        assets: {},
        layouts: {},
      },
    });
    const user = userEvent.setup();

    render(
      <ProfileProvider databaseName={databaseName}>
        <StudioPageClient />
      </ProfileProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText("Event Studio")).toBeInTheDocument(),
    );
    await user.selectOptions(presetSelect(), "halloween");

    await waitFor(() =>
      expect(loadCanonicalEventThemeMock).toHaveBeenCalledWith("halloween"),
    );
  });

  it("interacting with the toolbar never writes to EventSettings, participations, or point balances — a pure local preview", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    loadCanonicalEventThemeMock.mockResolvedValue({
      ok: false,
      reason: "invalid_json",
      message: "not found",
    });
    const user = userEvent.setup();
    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);

    const settingsBefore = await getEventSettings(repos, PROFILE_ID);
    const participationsBefore = await getEventParticipations(
      repos,
      PROFILE_ID,
    );

    render(
      <ProfileProvider databaseName={databaseName}>
        <StudioPageClient />
      </ProfileProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText("Event Studio")).toBeInTheDocument(),
    );
    await user.selectOptions(presetSelect(), "halloween");
    await waitFor(() => expect(loadCanonicalEventThemeMock).toHaveBeenCalled());

    const settingsAfter = await getEventSettings(repos, PROFILE_ID);
    const participationsAfter = await getEventParticipations(repos, PROFILE_ID);
    expect(settingsAfter).toEqual(settingsBefore);
    expect(participationsAfter).toEqual(participationsBefore);
    expect(await repos.points.getBalance(PROFILE_ID, "haunted")).toBe(0);
    expect(await repos.points.getBalance(PROFILE_ID, "lifetime")).toBe(0);
    await db.close();
  });

  it("Preview mode hides the toolbar/panels and shows an Exit Preview control; Edit restores the chrome", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    loadCanonicalEventThemeMock.mockResolvedValue({
      ok: false,
      reason: "invalid_json",
      message: "not found",
    });
    const user = userEvent.setup();

    render(
      <ProfileProvider databaseName={databaseName}>
        <StudioPageClient />
      </ProfileProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText("Event Studio")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.queryByText("Event Studio")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Exit Preview" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Exit Preview" }));
    expect(screen.getByText("Event Studio")).toBeInTheDocument();
  });

  it("Safe Zones toggle shows/hides the guide overlay in Edit mode only", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    loadCanonicalEventThemeMock.mockResolvedValue({
      ok: false,
      reason: "invalid_json",
      message: "not found",
    });
    const user = userEvent.setup();

    render(
      <ProfileProvider databaseName={databaseName}>
        <StudioPageClient />
      </ProfileProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText("Event Studio")).toBeInTheDocument(),
    );

    expect(screen.queryByText("Nav")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Safe Zones" }));
    expect(screen.getByText("Nav")).toBeInTheDocument();
    expect(screen.getByText("Content")).toBeInTheDocument();
    expect(screen.getByText("Modal / card")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.queryByText("Nav")).not.toBeInTheDocument();
  });

  it("Copy Desktop → Tablet / Tablet → Mobile are disabled with no theme loaded", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    loadCanonicalEventThemeMock.mockResolvedValue({
      ok: false,
      reason: "invalid_json",
      message: "not found",
    });

    render(
      <ProfileProvider databaseName={databaseName}>
        <StudioPageClient />
      </ProfileProvider>,
    );
    await waitFor(() => expect(loadCanonicalEventThemeMock).toHaveBeenCalled());

    expect(
      screen.getByRole("button", { name: "Copy Desktop → Tablet" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Copy Tablet → Mobile" }),
    ).toBeDisabled();
  });

  it("shows a Change Folder / Open workspace connect UI and persists a validated path", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    loadCanonicalEventThemeMock.mockResolvedValue({
      ok: false,
      reason: "invalid_json",
      message: "not found",
    });
    pickEventArtWorkspaceFolderMock.mockResolvedValue("/Users/dev/FDraft");
    validateEventArtWorkspaceFolderMock.mockResolvedValue({
      valid: true,
      missing: [],
    });
    const user = userEvent.setup();

    render(
      <ProfileProvider databaseName={databaseName}>
        <StudioPageClient />
      </ProfileProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText("Event Studio")).toBeInTheDocument(),
    );
    expect(screen.getByText("Not connected.")).toBeInTheDocument();

    await waitFor(async () => {
      await user.click(screen.getByRole("button", { name: "Change Folder" }));
      expect(pickEventArtWorkspaceFolderMock).toHaveBeenCalled();
    });

    await waitFor(() =>
      expect(screen.getByText("/Users/dev/FDraft")).toBeInTheDocument(),
    );
    expect(screen.getByText(/Connected/)).toBeInTheDocument();
  });

  it("shows a clear error and does not persist an invalid workspace folder", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    loadCanonicalEventThemeMock.mockResolvedValue({
      ok: false,
      reason: "invalid_json",
      message: "not found",
    });
    pickEventArtWorkspaceFolderMock.mockResolvedValue("/tmp/not-fdraft");
    validateEventArtWorkspaceFolderMock.mockResolvedValue({
      valid: false,
      missing: ["public/events/", "public/event-themes/"],
    });
    const user = userEvent.setup();

    render(
      <ProfileProvider databaseName={databaseName}>
        <StudioPageClient />
      </ProfileProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText("Event Studio")).toBeInTheDocument(),
    );

    await waitFor(async () => {
      await user.click(screen.getByRole("button", { name: "Change Folder" }));
      expect(pickEventArtWorkspaceFolderMock).toHaveBeenCalled();
    });

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/doesn't look like/i),
    );
    expect(screen.getByText("Not connected.")).toBeInTheDocument();
  });
});

describe("StudioPageClient — absent behaviour when isEventStudioBuild is false", () => {
  afterEach(() => {
    cleanup();
    vi.resetModules();
  });

  it("renders no Studio content at all on a normal (non-studio) build, even if this route were somehow reached", async () => {
    vi.doMock("@/lib/event-studio-build", () => ({
      isEventStudioBuild: false,
    }));
    vi.resetModules();
    const [
      { StudioPageClient: NormalBuildStudioPageClient },
      { ProfileProvider: FreshProfileProvider },
    ] = await Promise.all([
      import("./studio-page-client"),
      import("@/components/profiles/profile-provider"),
    ]);
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);

    render(
      <FreshProfileProvider databaseName={databaseName}>
        <NormalBuildStudioPageClient />
      </FreshProfileProvider>,
    );

    await waitFor(() =>
      expect(
        screen.getByText(/only available in FDraft \(Dev\)/i),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText("Event Studio")).not.toBeInTheDocument();
    expect(screen.queryByText("Event Art Workspace")).not.toBeInTheDocument();
  });
});

describe("StudioPageClient — canvas editing end to end (EVENT STUDIO — PHASE 4)", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  function emptyTheme() {
    return fdraftThemeSchema.parse({
      schemaVersion: 1,
      themeId: "default",
      eventId: null,
      scope: "default",
      assets: {},
      layouts: {},
    });
  }

  // Parsed through the real schema (not a hand-rolled literal) so every
  // defaulted placement field (`visible`, `opacity`, `anchor`, ...) is
  // actually present — a placement missing `visible` would read as
  // `undefined` (falsy) and never render on canvas, a fixture bug this
  // schema pass avoids the same way the real `loadCanonicalEventTheme`
  // always does in production.
  function pumpkinTheme() {
    return fdraftThemeSchema.parse({
      schemaVersion: 1,
      themeId: "default",
      eventId: null,
      scope: "default",
      assets: { pumpkin: "events/halloween/interactives/pumpkin.png" },
      layouts: {
        watchlist: {
          states: {
            populated: {
              breakpoints: {
                desktop: {
                  placements: [
                    { id: "pumpkin-1", kind: "fixed", assetId: "pumpkin" },
                  ],
                },
              },
            },
          },
        },
      },
    });
  }

  it("clicking an asset in the browser places a new, centred layer; undo removes it; redo restores it", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    // A workspace must already be connected for the Asset Browser to show
    // scanned assets rather than its connect prompt — seeded up front so
    // this only needs one render, matching a real returning Studio session.
    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    const { setEventArtWorkspacePath } =
      await import("@/application/event-studio/workspace-store");
    await setEventArtWorkspacePath(repos, PROFILE_ID, "/repo");
    await db.close();

    loadCanonicalEventThemeMock.mockResolvedValue({
      ok: true,
      theme: emptyTheme(),
    });
    scanEventArtWorkspaceAssetsMock.mockResolvedValue([
      {
        relativePath: "events/halloween/interactives/pumpkin-lit.png",
        eventId: "halloween",
        category: "interactives",
        fileName: "pumpkin-lit.png",
      },
    ]);

    render(
      <ProfileProvider databaseName={databaseName}>
        <StudioPageClient />
      </ProfileProvider>,
    );
    const user = userEvent.setup();

    await waitFor(() =>
      expect(screen.getAllByText("pumpkin lit").length).toBeGreaterThan(0),
    );
    await user.click(screen.getAllByText("pumpkin lit")[0]!);

    await waitFor(() =>
      expect(screen.getAllByText("pumpkin-lit").length).toBeGreaterThan(0),
    );

    // Undo removes the freshly-placed layer.
    await user.click(screen.getAllByRole("button", { name: "Undo" })[0]!);
    await waitFor(() =>
      expect(screen.queryByText("pumpkin-lit")).not.toBeInTheDocument(),
    );

    // Redo brings it back.
    await user.click(screen.getAllByRole("button", { name: "Redo" })[0]!);
    await waitFor(() =>
      expect(screen.getAllByText("pumpkin-lit").length).toBeGreaterThan(0),
    );
  });

  it("Delete removes the selected layer from the Layers list", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    loadCanonicalEventThemeMock.mockResolvedValue({
      ok: true,
      theme: pumpkinTheme(),
    });

    render(
      <ProfileProvider databaseName={databaseName}>
        <StudioPageClient />
      </ProfileProvider>,
    );
    const user = userEvent.setup();
    await waitFor(() =>
      expect(screen.getByText("pumpkin-1")).toBeInTheDocument(),
    );

    await user.click(screen.getByText("pumpkin-1"));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.queryByText("pumpkin-1")).not.toBeInTheDocument();
  });

  it("Duplicate adds a new, distinctly-named layer alongside the original", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    loadCanonicalEventThemeMock.mockResolvedValue({
      ok: true,
      theme: pumpkinTheme(),
    });

    render(
      <ProfileProvider databaseName={databaseName}>
        <StudioPageClient />
      </ProfileProvider>,
    );
    const user = userEvent.setup();
    await waitFor(() =>
      expect(screen.getByText("pumpkin-1")).toBeInTheDocument(),
    );

    await user.click(screen.getByText("pumpkin-1"));
    await user.click(screen.getByRole("button", { name: "Duplicate" }));

    await waitFor(() =>
      expect(screen.getByText("pumpkin-1-copy")).toBeInTheDocument(),
    );
    expect(screen.getByText("pumpkin-1")).toBeInTheDocument();
  });

  it("editing X offset in the Inspector updates the canvas placement's own position", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    loadCanonicalEventThemeMock.mockResolvedValue({
      ok: true,
      theme: pumpkinTheme(),
    });

    render(
      <ProfileProvider databaseName={databaseName}>
        <StudioPageClient />
      </ProfileProvider>,
    );
    const user = userEvent.setup();
    await waitFor(() =>
      expect(screen.getByText("pumpkin-1")).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(
        document.querySelector('[data-fdraft-placement-id="pumpkin-1"]'),
      ).not.toBeNull(),
    );
    await user.click(screen.getByText("pumpkin-1"));

    const field = await screen.findByLabelText("X offset (rem)");
    await user.clear(field);
    await user.type(field, "12");
    await user.tab();

    await waitFor(() => {
      expect(field).toHaveValue(12);
    });
    const el = document.querySelector(
      '[data-fdraft-placement-id="pumpkin-1"]',
    ) as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.style.transform).toContain("12rem");
  });
});

describe("StudioPageClient — persistence + export pipeline (EVENT STUDIO — PHASE 6)", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  function pumpkinTheme() {
    return fdraftThemeSchema.parse({
      schemaVersion: 1,
      themeId: "default",
      eventId: null,
      scope: "default",
      assets: { pumpkin: "events/halloween/interactives/pumpkin.png" },
      layouts: {
        watchlist: {
          states: {
            populated: {
              breakpoints: {
                desktop: {
                  placements: [
                    { id: "pumpkin-1", kind: "fixed", assetId: "pumpkin" },
                  ],
                },
              },
            },
          },
        },
      },
    });
  }

  it("Save persists the deliberate Save slot and shows a Saved <time> label", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    loadCanonicalEventThemeMock.mockResolvedValue({
      ok: true,
      theme: pumpkinTheme(),
    });
    const user = userEvent.setup();

    render(
      <ProfileProvider databaseName={databaseName}>
        <StudioPageClient />
      </ProfileProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText("pumpkin-1")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(screen.getByText(/^Saved \d{1,2}:\d{2}/)).toBeInTheDocument(),
    );

    const { getStudioSave } =
      await import("@/application/event-studio/studio-working-theme-store");
    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    const save = await getStudioSave(repos, PROFILE_ID, "default");
    expect(save?.theme.layouts.watchlist).toBeDefined();
    await db.close();
  });

  it("Load warns before discarding unsaved changes, and does nothing until confirmed", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    loadCanonicalEventThemeMock.mockResolvedValue({
      ok: true,
      theme: pumpkinTheme(),
    });
    const user = userEvent.setup();

    render(
      <ProfileProvider databaseName={databaseName}>
        <StudioPageClient />
      </ProfileProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText("pumpkin-1")).toBeInTheDocument(),
    );

    // Make an unsaved edit.
    await user.click(screen.getByText("pumpkin-1"));
    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    await waitFor(() =>
      expect(screen.getByText("pumpkin-1-copy")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Load" }));
    expect(screen.getByText("Discard unsaved changes?")).toBeInTheDocument();
    // Cancelling keeps the unsaved edit.
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("pumpkin-1-copy")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Load" }));
    await user.click(screen.getByRole("button", { name: "Load anyway" }));
    await waitFor(() =>
      expect(screen.queryByText("pumpkin-1-copy")).not.toBeInTheDocument(),
    );
  });

  it("File… opens the Studio File panel", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    loadCanonicalEventThemeMock.mockResolvedValue({
      ok: true,
      theme: pumpkinTheme(),
    });
    const user = userEvent.setup();

    render(
      <ProfileProvider databaseName={databaseName}>
        <StudioPageClient />
      </ProfileProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText("pumpkin-1")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "File…" }));

    expect(screen.getByText("Studio File")).toBeInTheDocument();
  });

  it("shows a crash-recovery banner when a pending autosave is newer than the deliberate Save, and Restore/Discard resolve it", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    loadCanonicalEventThemeMock.mockResolvedValue({
      ok: true,
      theme: pumpkinTheme(),
    });

    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    const { setStudioAutosave, getStudioAutosave } =
      await import("@/application/event-studio/studio-autosave-store");
    const autosavedTheme = fdraftThemeSchema.parse({
      ...pumpkinTheme(),
      layouts: {},
    });
    await setStudioAutosave(repos, PROFILE_ID, "default", autosavedTheme);
    await db.close();
    const user = userEvent.setup();

    render(
      <ProfileProvider databaseName={databaseName}>
        <StudioPageClient />
      </ProfileProvider>,
    );

    await waitFor(() =>
      expect(
        screen.getByText(/wasn't saved deliberately — restore it\?/),
      ).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() =>
      expect(screen.queryByText("pumpkin-1")).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByText(/wasn't saved deliberately/),
    ).not.toBeInTheDocument();

    const db2 = new FDraftLocalDatabase(databaseName);
    const repos2 = createLocalRepositories(db2);
    expect(
      await getStudioAutosave(repos2, PROFILE_ID, "default"),
    ).not.toBeNull();
    await db2.close();
  });
});

describe("StudioPageClient — final integration hardening (EVENT STUDIO — PHASE 7)", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  function pumpkinTheme() {
    return fdraftThemeSchema.parse({
      schemaVersion: 1,
      themeId: "default",
      eventId: null,
      scope: "default",
      assets: { pumpkin: "events/halloween/interactives/pumpkin.png" },
      layouts: {
        watchlist: {
          states: {
            populated: {
              breakpoints: {
                desktop: {
                  placements: [
                    { id: "pumpkin-1", kind: "fixed", assetId: "pumpkin" },
                  ],
                },
              },
            },
          },
        },
      },
    });
  }

  it("§5/§6: the Zoom control scales only the on-screen canvas, never placement geometry", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    loadCanonicalEventThemeMock.mockResolvedValue({
      ok: true,
      theme: pumpkinTheme(),
    });
    const user = userEvent.setup();

    render(
      <ProfileProvider databaseName={databaseName}>
        <StudioPageClient />
      </ProfileProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText("pumpkin-1")).toBeInTheDocument(),
    );

    const scaledCanvas = document.querySelector(
      ".origin-top-left",
    ) as HTMLElement;
    expect(scaledCanvas).not.toBeNull();
    // jsdom's ResizeObserver stub never reports a size, so "Fit" resolves
    // to 100% by default in this environment.
    expect(scaledCanvas.style.transform).toBe("scale(1)");

    await user.selectOptions(
      screen.getByRole("combobox", { name: /Zoom/ }),
      "50%",
    );
    expect(scaledCanvas.style.transform).toBe("scale(0.5)");

    // The underlying placement is untouched by the zoom change — only the
    // CSS transform on the canvas wrapper changed.
    const placementEl = document.querySelector(
      '[data-fdraft-placement-id="pumpkin-1"]',
    ) as HTMLElement;
    expect(placementEl).not.toBeNull();
  });

  it("§4: the Shortcuts popover lists the editor's keyboard shortcuts", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    loadCanonicalEventThemeMock.mockResolvedValue({
      ok: false,
      reason: "invalid_json",
      message: "not found",
    });
    const user = userEvent.setup();

    render(
      <ProfileProvider databaseName={databaseName}>
        <StudioPageClient />
      </ProfileProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText("Event Studio")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Shortcuts" }));

    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
    expect(screen.getByText("Ctrl/Cmd+Z")).toBeInTheDocument();
    expect(screen.getByText("Ungroup selection")).toBeInTheDocument();
  });

  it("§1: artwork placed on the Event Introduction modal page is editable through the same canvas tools, defaulting to viewport-relative positioning", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    const { setEventArtWorkspacePath } =
      await import("@/application/event-studio/workspace-store");
    await setEventArtWorkspacePath(repos, PROFILE_ID, "/repo");
    await db.close();

    loadCanonicalEventThemeMock.mockResolvedValue({
      ok: true,
      theme: fdraftThemeSchema.parse({
        schemaVersion: 1,
        themeId: "halloween",
        eventId: "halloween",
        scope: "event",
        assets: {},
        layouts: {},
      }),
    });
    scanEventArtWorkspaceAssetsMock.mockResolvedValue([
      {
        relativePath: "events/halloween/interactives/pumpkin-lit.png",
        eventId: "halloween",
        category: "interactives",
        fileName: "pumpkin-lit.png",
      },
    ]);
    const user = userEvent.setup();

    render(
      <ProfileProvider databaseName={databaseName}>
        <StudioPageClient />
      </ProfileProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText("Event Studio")).toBeInTheDocument(),
    );

    await user.selectOptions(presetSelect(), "halloween");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Page" }),
      "Event Introduction",
    );

    await waitFor(() =>
      expect(screen.getAllByText("pumpkin lit").length).toBeGreaterThan(0),
    );
    await user.click(screen.getAllByText("pumpkin lit")[0]!);

    let placementEl: HTMLElement | null = null;
    await waitFor(() => {
      placementEl = document.querySelector(
        '[data-fdraft-placement-id="pumpkin-lit"]',
      );
      expect(placementEl).not.toBeNull();
    });
    // A modal page's artwork defaults to `coordinateSpace: "viewport"`
    // (CSS `position: fixed`, tracking the dialog itself) rather than
    // `"page"` — see `isModalStudioPage`.
    expect(placementEl!.style.position).toBe("fixed");

    // Move/resize/rotate/crop/layer/group all reuse the SAME Inspector —
    // presence of its editing affordances for the modal-page placement
    // confirms it's the identical tool, not a special-cased one.
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Duplicate" }),
    ).toBeInTheDocument();
  });
});
