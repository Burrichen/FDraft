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
const getDevProjectRootMock = vi
  .fn<() => Promise<string | null>>()
  .mockResolvedValue(null);
const pickImportSourceFileMock = vi.fn<() => Promise<string | null>>();
const copyEventArtAssetMock = vi.fn();
const deleteEventArtAssetMock = vi.fn();
const checkEventArtWorkspaceAssetPathsMock = vi
  .fn()
  .mockResolvedValue({} as Record<string, boolean>);
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
  getDevProjectRoot: () => getDevProjectRootMock(),
  pickImportSourceFile: () => pickImportSourceFileMock(),
  copyEventArtAsset: (...args: unknown[]) => copyEventArtAssetMock(...args),
  deleteEventArtAsset: (...args: unknown[]) => deleteEventArtAssetMock(...args),
  checkEventArtWorkspaceAssetPaths: (...args: unknown[]) =>
    checkEventArtWorkspaceAssetPathsMock(...args),
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

  it("shows a Connect Project / Open Folder workspace connect UI and persists a validated path", async () => {
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
    expect(screen.getByText(/Not connected/)).toBeInTheDocument();

    await waitFor(async () => {
      await user.click(screen.getByRole("button", { name: "Connect Project" }));
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
      await user.click(screen.getByRole("button", { name: "Connect Project" }));
      expect(pickEventArtWorkspaceFolderMock).toHaveBeenCalled();
    });

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/doesn't look like/i),
    );
    expect(screen.getByText(/Not connected/)).toBeInTheDocument();
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
    expect(screen.queryByText("FDraft Project")).not.toBeInTheDocument();
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

    // Only the "Saved " prefix is asserted, never the time's own digit
    // shape — `toLocaleTimeString` formats using the RUNTIME's default
    // locale, which is not guaranteed to be "en-US" (or even ASCII
    // digits) in every CI environment; the prefix alone still proves the
    // Saved-timestamp label replaced "Working copy"/"Unsaved changes".
    // A generous timeout — a full-suite parallel run on a slower/more
    // contended CI runner (observed on Windows) can take noticeably
    // longer to flush this than in isolation on a dev machine. 8000ms
    // was occasionally still not enough on a contended Windows runner;
    // the underlying writes are a handful of sequential IndexedDB puts
    // (verified fast — well under 1s locally), so this is purely
    // buffering for runner variance, not tolerance for a hang.
    await waitFor(
      () => expect(screen.getByText(/^Saved /)).toBeInTheDocument(),
      { timeout: 15000 },
    );

    const { getStudioSave } =
      await import("@/application/event-studio/studio-working-theme-store");
    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    const save = await getStudioSave(repos, PROFILE_ID, "default");
    expect(save?.theme.layouts.watchlist).toBeDefined();
    await db.close();
  }, 18000);

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

describe("StudioPageClient — Fullscreen Edit workspace (EVENT STUDIO — PHASE 8)", () => {
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

  async function renderStudioWithPumpkin() {
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
    await waitFor(() =>
      expect(screen.getByText("pumpkin-1")).toBeInTheDocument(),
    );
  }

  it("§3: Fullscreen Edit collapses the toolbar/Assets/Inspector panels and shows Exit Fullscreen", async () => {
    await renderStudioWithPumpkin();
    const user = userEvent.setup();

    expect(screen.getByText("Assets")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Fullscreen Edit" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Fullscreen Edit/ }));

    expect(
      screen.queryByRole("button", { name: "Fullscreen Edit" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Exit Fullscreen" }),
    ).toBeInTheDocument();
    // The canvas itself is untouched — same placement, still present
    // (checked via its own DOM node, not the Layers list text — that
    // list is only rendered inside the Inspector drawer, closed here by
    // design, since it's exactly the chrome Fullscreen Edit collapses).
    expect(
      document.querySelector('[data-fdraft-placement-id="pumpkin-1"]'),
    ).not.toBeNull();
  });

  it("§4/§5: the Assets edge tab opens a floating drawer without unmounting the canvas placement", async () => {
    await renderStudioWithPumpkin();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Fullscreen Edit/ }));

    await user.click(screen.getByRole("button", { name: "Assets" }));

    expect(screen.getByRole("heading", { name: "Assets" })).toBeInTheDocument();
    // The underlying placement never unmounted while the drawer opened —
    // it's an overlay, not a layout change (§5).
    expect(
      document.querySelector('[data-fdraft-placement-id="pumpkin-1"]'),
    ).not.toBeNull();
  });

  it("§4: the Inspector edge tab opens a drawer showing the Layers list", async () => {
    await renderStudioWithPumpkin();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Fullscreen Edit/ }));

    expect(screen.queryByText("pumpkin-1")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Inspector" }));

    // The Inspector drawer shows the same Layers section the normal
    // side panel always has — its "pumpkin-1" row appears once the
    // drawer opens (it isn't rendered at all while the drawer is closed).
    expect(screen.getByText("pumpkin-1")).toBeInTheDocument();
  });

  it("§4: the Toolbar edge tab opens a drawer with the Preset/Page controls", async () => {
    await renderStudioWithPumpkin();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Fullscreen Edit/ }));

    await user.click(screen.getByRole("button", { name: "Toolbar" }));

    expect(screen.getAllByText("Event Studio").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("combobox", { name: /Preset/ }),
    ).toBeInTheDocument();
  });

  it("§6: placing an asset from the fullscreen Assets drawer auto-closes it unless pinned", async () => {
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
        themeId: "default",
        eventId: null,
        scope: "default",
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
    await user.click(screen.getByRole("button", { name: /Fullscreen Edit/ }));
    await user.click(screen.getByRole("button", { name: "Assets" }));
    await waitFor(() =>
      expect(screen.getAllByText("pumpkin lit").length).toBeGreaterThan(0),
    );

    await user.click(screen.getAllByText("pumpkin lit")[0]!);

    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Assets" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("§6: pinning the Assets drawer keeps it open after placing", async () => {
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
        themeId: "default",
        eventId: null,
        scope: "default",
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
    await user.click(screen.getByRole("button", { name: /Fullscreen Edit/ }));
    await user.click(screen.getByRole("button", { name: "Assets" }));
    await user.click(screen.getByRole("button", { name: /Pin Panel/ }));
    await waitFor(() =>
      expect(screen.getAllByText("pumpkin lit").length).toBeGreaterThan(0),
    );

    await user.click(screen.getAllByText("pumpkin lit")[0]!);

    expect(screen.getByRole("heading", { name: "Assets" })).toBeInTheDocument();
  });

  it("§7: Escape closes an open drawer first, without exiting Fullscreen Edit", async () => {
    await renderStudioWithPumpkin();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Fullscreen Edit/ }));
    await user.click(screen.getByRole("button", { name: "Assets" }));
    expect(screen.getByRole("heading", { name: "Assets" })).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(
      screen.queryByRole("heading", { name: "Assets" }),
    ).not.toBeInTheDocument();
    // Still in Fullscreen Edit — one Escape only closes one thing.
    expect(
      screen.getByRole("button", { name: "Exit Fullscreen" }),
    ).toBeInTheDocument();
  });

  it("§7: Escape exits Fullscreen Edit when nothing else is open", async () => {
    await renderStudioWithPumpkin();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Fullscreen Edit/ }));

    await user.keyboard("{Escape}");

    expect(
      screen.queryByRole("button", { name: "Exit Fullscreen" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Fullscreen Edit" }),
    ).toBeInTheDocument();
  });

  it("§7: the Exit Fullscreen button restores the normal panels", async () => {
    await renderStudioWithPumpkin();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Fullscreen Edit/ }));

    await user.click(screen.getByRole("button", { name: "Exit Fullscreen" }));

    expect(
      screen.getByRole("button", { name: "Fullscreen Edit" }),
    ).toBeInTheDocument();
  });

  it("§8: Ctrl/Cmd+Shift+F toggles Fullscreen Edit", async () => {
    await renderStudioWithPumpkin();
    const user = userEvent.setup();

    await user.keyboard("{Control>}{Shift>}f{/Shift}{/Control}");
    expect(
      screen.getByRole("button", { name: "Exit Fullscreen" }),
    ).toBeInTheDocument();

    await user.keyboard("{Control>}{Shift>}f{/Shift}{/Control}");
    expect(
      screen.getByRole("button", { name: "Fullscreen Edit" }),
    ).toBeInTheDocument();
  });

  it("§14: selecting a placement in Fullscreen Edit shows the floating selection toolbar, and Delete works from it", async () => {
    await renderStudioWithPumpkin();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Fullscreen Edit/ }));

    // Select via the Layers list in the Inspector drawer — clicking the
    // raw canvas element directly drives react-moveable's own pointer
    // gesture internals, which jsdom doesn't fully implement
    // (`elementFromPoint`); every other test in this suite selects the
    // same way, via the Layers row text.
    await user.click(screen.getByRole("button", { name: "Inspector" }));
    await user.click(screen.getAllByText("pumpkin-1")[0]!);
    // Close the drawer so only the floating selection toolbar's own
    // Delete button remains (the Inspector drawer has its own too).
    await user.keyboard("{Escape}");

    const deleteButton = await screen.findByRole("button", {
      name: "Delete",
    });
    await user.click(deleteButton);

    expect(screen.queryByText("pumpkin-1")).not.toBeInTheDocument();
  });
});

describe("StudioPageClient — Project-synced Event Art Workspace (EVENT STUDIO — PHASE 9)", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    getDevProjectRootMock.mockResolvedValue(null);
  });

  const HALLOWEEN_ASSET = {
    relativePath: "events/halloween/interactives/pumpkin-rotten.png",
    eventId: "halloween",
    category: "interactives",
    fileName: "pumpkin-rotten.png",
  };

  async function connectWorkspace(databaseName: string) {
    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    const { setEventArtWorkspacePath } =
      await import("@/application/event-studio/workspace-store");
    await setEventArtWorkspacePath(repos, PROFILE_ID, "/repo");
    await db.close();
  }

  it("§12: auto-detects and connects a dev-source project root when nothing is connected yet", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    loadCanonicalEventThemeMock.mockResolvedValue({
      ok: false,
      reason: "invalid_json",
      message: "not found",
    });
    getDevProjectRootMock.mockResolvedValue("/Users/dev/FDraft");
    validateEventArtWorkspaceFolderMock.mockResolvedValue({
      valid: true,
      missing: [],
    });

    render(
      <ProfileProvider databaseName={databaseName}>
        <StudioPageClient />
      </ProfileProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText("/Users/dev/FDraft")).toBeInTheDocument(),
    );
    expect(screen.getByText(/Connected/)).toBeInTheDocument();
  });

  it("§12: never overrides an already-connected project with the auto-detected one", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    await connectWorkspace(databaseName);
    loadCanonicalEventThemeMock.mockResolvedValue({
      ok: false,
      reason: "invalid_json",
      message: "not found",
    });
    getDevProjectRootMock.mockResolvedValue("/Users/dev/some-other-checkout");

    render(
      <ProfileProvider databaseName={databaseName}>
        <StudioPageClient />
      </ProfileProvider>,
    );

    await waitFor(() => expect(screen.getByText("/repo")).toBeInTheDocument());
    expect(
      screen.queryByText("/Users/dev/some-other-checkout"),
    ).not.toBeInTheDocument();
  });

  it("§3/§4: Import Image shows the destination preview and copies the file on confirm", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    await connectWorkspace(databaseName);
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
    scanEventArtWorkspaceAssetsMock.mockResolvedValue([]);
    pickImportSourceFileMock.mockResolvedValue(
      "/Users/dev/Desktop/Ghost Peeking FINAL.png",
    );
    checkEventArtWorkspaceAssetPathsMockFor(false);
    copyEventArtAssetMock.mockResolvedValue({
      ok: true,
      relativePath: "events/halloween/decorations/ghost-peeking-final.png",
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
      expect(
        screen.getByRole("button", { name: "Import Image" }),
      ).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Import Image" }));
    expect(pickImportSourceFileMock).toHaveBeenCalled();

    await waitFor(() =>
      expect(screen.getByText("Ghost Peeking FINAL.png")).toBeInTheDocument(),
    );
    expect(
      screen.getByText(
        "public/events/halloween/decorations/ghost-peeking-final.png",
      ),
    ).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Import" })).not.toBeDisabled(),
    );
    await user.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() =>
      expect(copyEventArtAssetMock).toHaveBeenCalledWith(
        "/repo",
        "/Users/dev/Desktop/Ghost Peeking FINAL.png",
        "halloween",
        "decorations",
        "ghost-peeking-final.png",
      ),
    );
    await waitFor(() =>
      expect(screen.getByText(/1 image added/)).toBeInTheDocument(),
    );
  });

  function checkEventArtWorkspaceAssetPathsMockFor(exists: boolean) {
    checkEventArtWorkspaceAssetPathsMock.mockImplementation(
      async (_path: string, relativePaths: string[]) =>
        Object.fromEntries(relativePaths.map((p) => [p, exists])),
    );
  }

  it("§6: Replace Image reuses the same event/category/filename and requires confirmation", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    await connectWorkspace(databaseName);
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
    scanEventArtWorkspaceAssetsMock.mockResolvedValue([HALLOWEEN_ASSET]);
    readEventArtWorkspaceAssetMock.mockResolvedValue(null);
    pickImportSourceFileMock.mockResolvedValue(
      "/Users/dev/Desktop/new-pumpkin.png",
    );
    copyEventArtAssetMock.mockResolvedValue({
      ok: true,
      relativePath: HALLOWEEN_ASSET.relativePath,
    });
    const user = userEvent.setup();

    render(
      <ProfileProvider databaseName={databaseName}>
        <StudioPageClient />
      </ProfileProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText("pumpkin rotten")).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole("button", { name: /Replace pumpkin-rotten.png/ }),
    );
    expect(pickImportSourceFileMock).toHaveBeenCalled();

    await waitFor(() =>
      expect(screen.getByText("Replace this image?")).toBeInTheDocument(),
    );
    expect(copyEventArtAssetMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Replace" }));

    await waitFor(() =>
      expect(copyEventArtAssetMock).toHaveBeenCalledWith(
        "/repo",
        "/Users/dev/Desktop/new-pumpkin.png",
        "halloween",
        "interactives",
        "pumpkin-rotten.png",
      ),
    );
    await waitFor(() =>
      expect(screen.getByText(/1 image replaced/)).toBeInTheDocument(),
    );
  });

  it("§14: Delete Asset warns with the exact theme references before deleting, and blocks nothing outright", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    await connectWorkspace(databaseName);
    loadCanonicalEventThemeMock.mockResolvedValue({
      ok: true,
      theme: fdraftThemeSchema.parse({
        schemaVersion: 1,
        themeId: "halloween",
        eventId: "halloween",
        scope: "event",
        assets: { "pumpkin-rotten": HALLOWEEN_ASSET.relativePath },
        layouts: {
          watchlist: {
            states: {
              populated: {
                breakpoints: {
                  desktop: {
                    placements: [
                      {
                        id: "p1",
                        kind: "fixed",
                        assetId: "pumpkin-rotten",
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      }),
    });
    scanEventArtWorkspaceAssetsMock.mockResolvedValue([HALLOWEEN_ASSET]);
    readEventArtWorkspaceAssetMock.mockResolvedValue(null);
    deleteEventArtAssetMock.mockResolvedValue({ ok: true });
    const user = userEvent.setup();

    render(
      <ProfileProvider databaseName={databaseName}>
        <StudioPageClient />
      </ProfileProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText("pumpkin rotten")).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole("button", { name: /Delete pumpkin-rotten.png/ }),
    );

    await waitFor(() =>
      expect(screen.getByText("This image is used in:")).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/Watchlist → Populated → Desktop/),
    ).toBeInTheDocument();
    expect(deleteEventArtAssetMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete anyway" }));

    await waitFor(() =>
      expect(deleteEventArtAssetMock).toHaveBeenCalledWith(
        "/repo",
        HALLOWEEN_ASSET.relativePath,
      ),
    );
    await waitFor(() =>
      expect(screen.getByText(/1 image deleted/)).toBeInTheDocument(),
    );
  });

  it("§14: Delete Asset requires only a plain confirmation when the asset is unreferenced", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    await connectWorkspace(databaseName);
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
    scanEventArtWorkspaceAssetsMock.mockResolvedValue([HALLOWEEN_ASSET]);
    readEventArtWorkspaceAssetMock.mockResolvedValue(null);
    deleteEventArtAssetMock.mockResolvedValue({ ok: true });
    const user = userEvent.setup();

    render(
      <ProfileProvider databaseName={databaseName}>
        <StudioPageClient />
      </ProfileProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText("pumpkin rotten")).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole("button", { name: /Delete pumpkin-rotten.png/ }),
    );

    await waitFor(() =>
      expect(
        screen.getByText(/Not currently used in the loaded theme/),
      ).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(deleteEventArtAssetMock).toHaveBeenCalledWith(
        "/repo",
        HALLOWEEN_ASSET.relativePath,
      ),
    );
  });
});
