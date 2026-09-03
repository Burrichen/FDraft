import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("GET /api/theme-preview/watch", () => {
  let scratchDir: string;
  let themePath: string;

  beforeEach(() => {
    scratchDir = mkdtempSync(join(tmpdir(), "fdraft-theme-preview-watch-"));
    themePath = join(scratchDir, "sample.fdtheme");
    writeFileSync(themePath, new Uint8Array([1]));
    vi.stubEnv("NODE_ENV", "development");
  });

  afterEach(() => {
    rmSync(scratchDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it("is disabled outside development", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await GET(
      new NextRequest(
        `http://localhost/api/theme-preview/watch?path=${themePath}`,
      ),
    );
    expect(response.status).toBe(404);
  });

  it("returns a real, changing mtime a caller can poll", async () => {
    const first = await GET(
      new NextRequest(
        `http://localhost/api/theme-preview/watch?path=${themePath}`,
      ),
    );
    const firstBody = await first.json();
    expect(firstBody.status).toBe("ok");
    expect(typeof firstBody.mtimeMs).toBe("number");

    await new Promise((r) => setTimeout(r, 10));
    writeFileSync(themePath, new Uint8Array([2]));

    const second = await GET(
      new NextRequest(
        `http://localhost/api/theme-preview/watch?path=${themePath}`,
      ),
    );
    const secondBody = await second.json();
    expect(secondBody.mtimeMs).toBeGreaterThanOrEqual(firstBody.mtimeMs);
  });
});
