import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  compileTheme,
  createId,
  createProject,
  type StudioProjectDocument,
} from "@fdraft/theme-sdk";
import { packFdtheme } from "@fdraft/theme-sdk/packaging";
import { ThemePreviewClient } from "./theme-preview-client";

/**
 * Real `.fdtheme` archive bytes built through the actual SDK compile/pack
 * pipeline — see `theme-loader.test.ts`'s own established convention,
 * never a hand-rolled fixture.
 */
async function realFdthemeBytes(options?: {
  title?: string;
  requiredComponentKeys?: string[];
}): Promise<Uint8Array> {
  const project: StudioProjectDocument = createProject({
    id: createId(),
    name: options?.title ?? "Test Theme",
    description: "",
  });
  project.pages.push({
    id: createId(),
    name: "Home",
    slug: "home",
    layers: [],
    animations: [],
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
  const bundle = compileTheme(project, {}, { minRendererVersion: "0.1.0" });
  return packFdtheme(bundle);
}

function mockFetchSequence(
  responses: Array<{ ok: boolean; bytes?: Uint8Array; status?: number }>,
) {
  let call = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/api/theme-preview/watch")) {
        return new Response(JSON.stringify({ mtimeMs: Date.now() }), {
          status: 200,
        });
      }
      const response = responses[Math.min(call, responses.length - 1)]!;
      call += 1;
      if (!response.ok) {
        return new Response(JSON.stringify({ message: "not found" }), {
          status: response.status ?? 404,
        });
      }
      return new Response(Buffer.from(response.bytes ?? new Uint8Array()), {
        status: 200,
      });
    }),
  );
}

describe("ThemePreviewClient", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps the last successfully loaded theme visible when a later reload fails, per the documented last-known-good fallback", async () => {
    const good = await realFdthemeBytes({ title: "Good Theme" });
    mockFetchSequence([
      { ok: true, bytes: good },
      { ok: false, status: 500 },
    ]);
    const user = userEvent.setup();
    render(<ThemePreviewClient />);

    const input = screen.getByPlaceholderText(
      "/absolute/path/to/theme.fdtheme",
    );
    await user.type(input, "/tmp/good.fdtheme");
    await user.click(screen.getByText("Load"));

    // Wait for the real themed stage to actually mount.
    await waitFor(() => {
      expect(document.querySelector('[data-fdraft-stage="true"]')).toBeTruthy();
    });

    // A DIFFERENT path (e.g. the same theme author saving under a new
    // name, or the watch-poll noticing an edit) that fails to load —
    // exercises the exact same `loadFrom` failure path a real broken
    // edit-and-save would.
    await user.clear(input);
    await user.type(input, "/tmp/bad.fdtheme");
    await user.click(screen.getByText("Load"));

    await waitFor(() => {
      expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument();
    });
    // The previously-rendered themed stage must STILL be present — never
    // wiped by the failed reload.
    expect(document.querySelector('[data-fdraft-stage="true"]')).toBeTruthy();
    expect(
      screen.getByText(/showing the last successfully loaded version/i),
    ).toBeInTheDocument();
  });

  it("offers a page/popup selector once a multi-page theme is loaded, defaulting to the first page", async () => {
    const project: StudioProjectDocument = createProject({
      id: createId(),
      name: "Multi Page",
      description: "",
    });
    project.pages.push(
      {
        id: createId(),
        name: "Home",
        slug: "home",
        layers: [],
        animations: [],
      },
      {
        id: createId(),
        name: "Second Page",
        slug: "second-page",
        layers: [],
        animations: [],
      },
    );
    const bundle = compileTheme(project, {}, { minRendererVersion: "0.1.0" });
    const bytes = await packFdtheme(bundle);
    mockFetchSequence([{ ok: true, bytes }]);

    const user = userEvent.setup();
    render(<ThemePreviewClient />);
    await user.type(
      screen.getByPlaceholderText("/absolute/path/to/theme.fdtheme"),
      "/tmp/multi.fdtheme",
    );
    await user.click(screen.getByText("Load"));

    const select = await screen.findByLabelText(/page\/popup/i, {
      selector: "select",
    });
    expect(select).toBeInTheDocument();
    expect(screen.getByText(/Page — Home/i)).toBeInTheDocument();
    expect(screen.getByText(/Page — Second Page/i)).toBeInTheDocument();
  });
});
