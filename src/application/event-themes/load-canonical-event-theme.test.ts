import { describe, expect, it, vi } from "vitest";
import { loadCanonicalEventTheme } from "./load-canonical-event-theme";

function fakeFetch(response: { ok: boolean; status?: number; text: string }) {
  return vi.fn(async () => ({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 404),
    text: async () => response.text,
  })) as unknown as typeof fetch;
}

describe("loadCanonicalEventTheme — offline/Tauri-safe static loading (EVENT STUDIO — PHASE 1 §12/§17)", () => {
  it("fetches the exact expected same-origin path and parses a valid theme", async () => {
    const fetchImpl = fakeFetch({
      ok: true,
      text: JSON.stringify({
        schemaVersion: 1,
        themeId: "halloween",
        eventId: "halloween",
        scope: "event",
        assets: {},
        layouts: {},
      }),
    });

    const result = await loadCanonicalEventTheme("halloween", { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      "/event-themes/halloween.fdraft-theme",
    );
    expect(result.ok).toBe(true);
  });

  it("returns a clear failure (never throws) for a missing bundled theme (e.g. an event with no theme yet)", async () => {
    const fetchImpl = fakeFetch({ ok: false, status: 404, text: "" });
    const result = await loadCanonicalEventTheme("no-such-event", {
      fetchImpl,
    });
    expect(result.ok).toBe(false);
  });

  it("returns a clear failure rather than throwing when fetch itself rejects (e.g. genuinely offline with no cache)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network unavailable");
    }) as unknown as typeof fetch;
    const result = await loadCanonicalEventTheme("halloween", { fetchImpl });
    expect(result.ok).toBe(false);
  });

  it("returns a clear failure for a bundled file that fails schema validation", async () => {
    const fetchImpl = fakeFetch({
      ok: true,
      text: JSON.stringify({ schemaVersion: 1, themeId: "bad" }),
    });
    const result = await loadCanonicalEventTheme("bad", { fetchImpl });
    expect(result.ok).toBe(false);
  });
});
