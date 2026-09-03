import { packFdtheme } from "@fdraft/theme-sdk/packaging";
import {
  compileTheme,
  createId,
  createProject,
  type StudioProjectDocument,
} from "@fdraft/theme-sdk";
import { describe, expect, it } from "vitest";
import {
  createValidatedPackageAssetResolver,
  loadFdthemeArchive,
} from "./theme-loader";

/**
 * Real `.fdtheme` archive bytes built through the actual, released
 * `@fdraft/theme-sdk` compile/pack pipeline — never a hand-rolled
 * fixture. Matches this codebase's own established "never hand-roll raw
 * fixtures a real schema/compiler already knows how to produce" rule.
 */
async function realFdthemeBytes(options?: {
  minRendererVersion?: string;
  requiredComponentKeys?: string[];
}): Promise<Uint8Array> {
  const project: StudioProjectDocument = createProject({
    id: createId(),
    name: "Test Theme",
    description: "",
  });
  if (options?.requiredComponentKeys) {
    project.componentRequirements = options.requiredComponentKeys.map(
      (componentKey) => ({
        id: createId(),
        componentKey,
        required: true,
        allowedProperties: [],
      }),
    );
  }
  const bundle = compileTheme(
    project,
    {},
    {
      minRendererVersion: options?.minRendererVersion ?? "0.1.0",
    },
  );
  return packFdtheme(bundle);
}

describe("loadFdthemeArchive", () => {
  it("loads a real, valid, compatible theme package successfully", async () => {
    const bytes = await realFdthemeBytes();
    const result = await loadFdthemeArchive(bytes);
    expect(result.ok).toBe(true);
  });

  it("rejects a corrupt/non-archive byte sequence with a safe user message and a detailed dev message", async () => {
    const result = await loadFdthemeArchive(new Uint8Array([1, 2, 3, 4, 5]));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.userMessage).toBe("This theme could not be loaded.");
    expect(result.error.userMessage).not.toMatch(/\/|\\/); // never a path
    expect(result.error.devMessage.length).toBeGreaterThan(0);
  });

  it("rejects a theme declaring a newer minRendererVersion than is installed", async () => {
    const bytes = await realFdthemeBytes({ minRendererVersion: "99.0.0" });
    const result = await loadFdthemeArchive(bytes);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("INCOMPATIBLE_THEME");
    expect(result.error.devMessage).toMatch(/99\.0\.0/);
  });

  it("rejects a theme requiring a component key FDraft doesn't support", async () => {
    const bytes = await realFdthemeBytes({
      requiredComponentKeys: ["some-unsupported-key"],
    });
    const result = await loadFdthemeArchive(bytes);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("INCOMPATIBLE_THEME");
    expect(result.error.devMessage).toMatch(/some-unsupported-key/);
  });

  it("accepts a theme requiring only component keys FDraft actually supports", async () => {
    const bytes = await realFdthemeBytes({
      requiredComponentKeys: ["page-title", "points-counter"],
    });
    const result = await loadFdthemeArchive(bytes);
    expect(result.ok).toBe(true);
  });
});

describe("createValidatedPackageAssetResolver", () => {
  it("resolves undefined for an asset id the theme never declared, rather than guessing or throwing", async () => {
    const bytes = await realFdthemeBytes();
    const result = await loadFdthemeArchive(bytes);
    if (!result.ok) throw new Error("expected ok load");
    const resolver = createValidatedPackageAssetResolver(
      result.document,
      result.assets,
    );
    expect(resolver.resolveAsset("00000000-0000-0000-0000-000000000000")).toBe(
      undefined,
    );
  });
});
