import { afterEach, describe, expect, it, vi } from "vitest";

describe("isEventStudioBuild — the central Event Studio capability flag (EVENT STUDIO — PHASE 2 §1)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("is false when NEXT_PUBLIC_EVENT_STUDIO is unset (every normal FDraft/Beta build)", async () => {
    vi.stubEnv("NEXT_PUBLIC_EVENT_STUDIO", undefined as unknown as string);
    vi.resetModules();
    const { isEventStudioBuild } = await import("./event-studio-build");
    expect(isEventStudioBuild).toBe(false);
  });

  it('is true only when NEXT_PUBLIC_EVENT_STUDIO is exactly "1" (the FDraft (Dev) build)', async () => {
    vi.stubEnv("NEXT_PUBLIC_EVENT_STUDIO", "1");
    vi.resetModules();
    const { isEventStudioBuild } = await import("./event-studio-build");
    expect(isEventStudioBuild).toBe(true);
  });

  it("is false for any other value (never a loose truthy check)", async () => {
    vi.stubEnv("NEXT_PUBLIC_EVENT_STUDIO", "true");
    vi.resetModules();
    const { isEventStudioBuild } = await import("./event-studio-build");
    expect(isEventStudioBuild).toBe(false);
  });
});
