import { readFileSync } from "node:fs";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  compileTheme,
  createId,
  createProject,
  type Condition,
  type StudioProjectDocument,
} from "@fdraft/theme-sdk";
import { packFdtheme, unpackFdtheme } from "@fdraft/theme-sdk/packaging";
import {
  ThemeRenderer,
  type AssetResolver,
  type HostSettings,
} from "@fdraft/theme-renderer";
import {
  fdraftComponentAdapterRegistry,
  fdraftComponentCopyContractRegistry,
} from "@/components/events/theme-runtime/component-adapters";
import { FDraftThemeRenderContextProvider } from "@/infrastructure/theme-runtime/render-context";
import { ProfileProvider } from "@/components/profiles/profile-provider";
import { EventDiscoveryProvider } from "@/components/events/event-discovery-provider";
import { WatchUndoProvider } from "@/components/watch-undo/watch-undo-provider";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { checkThemeCompatibility } from "./compatibility";
import { loadFdthemeArchive } from "./theme-loader";

/**
 * Proves the real, previously-undocumented finding from Prompt 13 —
 * Studio's "FDraft Default Event" template places 14 distinct component
 * keys, but FDraft only had real adapters for 6 of them — is now
 * genuinely closed, and that `behaviour`/`effects` (already fully
 * implemented in the shared, already-released `theme-sdk`/`theme-renderer`
 * — see FDraft-Studio's own docs/IMPLEMENTATION_STATUS.md row 14) now
 * actually work end to end through FDraft's real adapters and render
 * context, not merely pass the compatibility check.
 */

const TEMPLATE_COMPONENT_KEYS = [
  "page-title",
  "event-information",
  "event-countdown",
  "generate-draft-action",
  "profile-badge",
  "event-navigation",
  "film-grid",
  "draft-progress",
  "draft-controls",
  "results-completion-content",
  "points-counter",
  "complete-watch-action",
  "challenge-card",
  "event-points-counter",
];

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

const mockResolver: AssetResolver = {
  resolveAsset: (id) => `mock://asset/${id}`,
};

function renderThemed(
  document: Parameters<typeof ThemeRenderer>[0]["document"],
  pageId: string,
  databaseName: string,
  opts?: {
    hostSettings?: HostSettings;
    renderState?: Parameters<typeof ThemeRenderer>[0]["renderState"];
  },
) {
  return render(
    <ProfileProvider databaseName={databaseName}>
      <EventDiscoveryProvider>
        <WatchUndoProvider>
          <FDraftThemeRenderContextProvider
            value={{
              eventId: "test-event",
              films: [],
              pointsBalance: 10,
              lifetimePointsBalance: 20,
              progressPercent: 0,
              watchedCount: 0,
              targetCount: 0,
              countdownTargetAtMs: null,
              eventAvailable: true,
              eventActive: true,
              optedIn: true,
              draftGenerated: true,
              eventCompleted: false,
              eventPhase: "active",
            }}
          >
            <ThemeRenderer
              document={document}
              assetResolver={mockResolver}
              componentAdapters={fdraftComponentAdapterRegistry}
              copyContracts={fdraftComponentCopyContractRegistry}
              target={{ kind: "page", pageId }}
              hostSettings={opts?.hostSettings}
              renderState={opts?.renderState}
            />
          </FDraftThemeRenderContextProvider>
        </WatchUndoProvider>
      </EventDiscoveryProvider>
    </ProfileProvider>,
  );
}

describe("Studio's default event template is truthfully supported by FDraft", () => {
  afterEach(cleanup);

  it("checkThemeCompatibility accepts a theme requiring every one of the 14 default-template component keys, plus behaviour and effects", () => {
    const result = checkThemeCompatibility({
      minRendererVersion: "0.1.0",
      requiredComponentKeys: TEMPLATE_COMPONENT_KEYS,
      capabilities: ["behaviour", "effects", "responsive", "masters", "popups"],
    });
    expect(result).toEqual({ compatible: true, reasons: [] });
  });

  it("still correctly rejects a genuinely unsupported capability (animations) — this phase does not advertise it", () => {
    const result = checkThemeCompatibility({
      minRendererVersion: "0.1.0",
      requiredComponentKeys: [],
      capabilities: ["animations"],
    });
    expect(result.compatible).toBe(false);
    expect(result.reasons.some((r) => r.includes("animations"))).toBe(true);
  });
});

describe("Behaviour Mode genuinely evaluates through FDraft's real renderState wiring", () => {
  afterEach(cleanup);

  function buildBehaviourProject(): StudioProjectDocument {
    const project = createProject({
      id: createId(),
      name: "Behaviour Test",
      description: "",
    });
    const layerId = createId();
    const lowRule = createId();
    const highRule = createId();
    const shownWhenHigh: Condition = {
      type: "compare",
      variable: { kind: "progressPercent" },
      operator: "gte",
      value: 50,
    };
    project.pages.push({
      id: createId(),
      name: "Home",
      slug: "home",
      layers: [
        {
          id: layerId,
          type: "shape",
          name: "Candy Bowl Stand-In",
          shape: "rect",
          transform: {
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            rotationDeg: 0,
            scaleX: 1,
            scaleY: 1,
          },
          opacity: 1,
          visible: true,
          locked: false,
          zIndex: 0,
          responsive: [],
          interactionStates: [],
        },
      ],
      animations: [],
    });
    project.behaviourRules = [
      {
        id: lowRule,
        name: "Hide by default",
        enabled: true,
        priority: 0,
        trigger: { type: "whileTrue" },
        condition: { type: "always" },
        actions: [{ type: "hide", layerId }],
      },
      {
        id: highRule,
        name: "Show once progress reaches 50%",
        enabled: true,
        priority: 1,
        trigger: { type: "whileTrue" },
        condition: shownWhenHigh,
        actions: [{ type: "show", layerId }],
      },
    ];
    return project;
  }

  it("a real Behaviour rule correctly hides a layer when its condition is false", async () => {
    const project = buildBehaviourProject();
    const bundle = compileTheme(project, {}, { minRendererVersion: "0.1.0" });
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);

    const { container } = renderThemed(
      bundle.document,
      bundle.document.pages[0]!.id,
      databaseName,
      {
        renderState: { activeImageStates: {}, event: { progressPercent: 30 } },
      },
    );
    const layer = container.querySelector(
      `[data-fdraft-layer-id="${project.pages[0]!.layers[0]!.id}"]`,
    );
    expect(layer).not.toBeNull();
    expect((layer as HTMLElement).style.display).toBe("none");
  });

  it("the SAME real Behaviour rule correctly shows the layer once its condition becomes true, priority breaking the tie", async () => {
    const project = buildBehaviourProject();
    const bundle = compileTheme(project, {}, { minRendererVersion: "0.1.0" });
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);

    const { container } = renderThemed(
      bundle.document,
      bundle.document.pages[0]!.id,
      databaseName,
      {
        renderState: { activeImageStates: {}, event: { progressPercent: 60 } },
      },
    );
    const layer = container.querySelector(
      `[data-fdraft-layer-id="${project.pages[0]!.layers[0]!.id}"]`,
    );
    expect(layer).not.toBeNull();
    expect((layer as HTMLElement).style.display).not.toBe("none");
  });
});

describe("Effects render safely across performance tiers through FDraft's real hostSettings wiring", () => {
  afterEach(cleanup);

  function buildEffectProject(): StudioProjectDocument {
    const project = createProject({
      id: createId(),
      name: "Effects Test",
      description: "",
    });
    project.pages.push({
      id: createId(),
      name: "Home",
      slug: "home",
      layers: [
        {
          id: createId(),
          type: "effect",
          name: "Rain",
          effect: {
            id: createId(),
            name: "Rain",
            kind: "rain",
            intensity: 0.5,
            speed: 1,
            opacity: 1,
            seed: 1,
          },
          transform: {
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            rotationDeg: 0,
            scaleX: 1,
            scaleY: 1,
          },
          opacity: 1,
          visible: true,
          locked: false,
          zIndex: 0,
          responsive: [],
          interactionStates: [],
        },
      ],
      animations: [],
    });
    return project;
  }

  it.each([
    { performanceTier: "high", reducedMotion: false },
    { performanceTier: "medium", reducedMotion: false },
    { performanceTier: "low", reducedMotion: false },
    { performanceTier: "high", reducedMotion: true },
  ] satisfies HostSettings[])(
    "renders a real effect layer without a render failure at %o",
    async (hostSettings) => {
      const project = buildEffectProject();
      const bundle = compileTheme(project, {}, { minRendererVersion: "0.1.0" });
      const databaseName = crypto.randomUUID();
      await seedProfile(databaseName);

      const { container } = renderThemed(
        bundle.document,
        bundle.document.pages[0]!.id,
        databaseName,
        {
          hostSettings,
        },
      );
      expect(
        container.querySelector('[data-fdraft-error="theme-render-failed"]'),
      ).toBeNull();
      expect(
        container.querySelector('[data-fdraft-error="layer-render-failed"]'),
      ).toBeNull();
    },
  );
});

describe("existing Christmas rendering is unaffected by this phase's changes", () => {
  afterEach(cleanup);

  it("the real, already-published Christmas theme pack still renders correctly through FDraft's real adapters", async () => {
    const bytes = readFileSync("src/theme-packs/christmas/theme.fdtheme");
    const result = await loadFdthemeArchive(new Uint8Array(bytes));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    const { container, getByText } = renderThemed(
      result.document,
      result.document.pages[0]!.id,
      databaseName,
    );
    expect(getByText("A Cozy Christmas")).toBeInTheDocument();
    expect(
      container.querySelector('[data-fdraft-error="theme-render-failed"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-fdraft-error="layer-render-failed"]'),
    ).toBeNull();
  });

  it("the real Christmas theme.fdtheme still repacks byte-identical (determinism unaffected)", async () => {
    const bytes = readFileSync("src/theme-packs/christmas/theme.fdtheme");
    const { document, assets } = await unpackFdtheme(new Uint8Array(bytes));
    const repacked = await packFdtheme({ document, assets });
    expect(Buffer.from(repacked).toString("hex")).toBe(
      Buffer.from(bytes).toString("hex"),
    );
  });
});
