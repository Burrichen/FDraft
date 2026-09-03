import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("GET /api/theme-preview", () => {
  let scratchDir: string;
  let themePath: string;

  beforeEach(() => {
    scratchDir = mkdtempSync(join(tmpdir(), "fdraft-theme-preview-route-"));
    themePath = join(scratchDir, "sample.fdtheme");
    writeFileSync(themePath, new Uint8Array([9, 8, 7, 6]));
    vi.stubEnv("NODE_ENV", "development");
  });

  afterEach(() => {
    rmSync(scratchDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it("returns 404 disabled when not in development, even with a valid path", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await GET(
      new NextRequest(`http://localhost/api/theme-preview?path=${themePath}`),
    );
    expect(response.status).toBe(404);
    expect((await response.json()).status).toBe("disabled");
  });

  it("returns 400 when no path is given", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/theme-preview"),
    );
    expect(response.status).toBe(400);
  });

  it("returns 400 for a relative path", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/theme-preview?path=./sample.fdtheme",
      ),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).status).toBe("invalid-path");
  });

  it("returns the real file bytes for a valid absolute .fdtheme path", async () => {
    const response = await GET(
      new NextRequest(`http://localhost/api/theme-preview?path=${themePath}`),
    );
    expect(response.status).toBe(200);
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(bytes)).toEqual([9, 8, 7, 6]);
  });

  it("returns 404 for a path that doesn't exist", async () => {
    const response = await GET(
      new NextRequest(
        `http://localhost/api/theme-preview?path=${join(scratchDir, "missing.fdtheme")}`,
      ),
    );
    expect(response.status).toBe(404);
  });
});
