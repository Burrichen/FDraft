import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPublishedReleases } from "./github-releases-client";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

function mockFetch(response: Partial<Response> & { ok: boolean }) {
  global.fetch = vi.fn().mockResolvedValue(response) as never;
}

describe("fetchPublishedReleases", () => {
  it("maps releases, stripping a leading 'v' from the tag", async () => {
    mockFetch({
      ok: true,
      json: async () => [
        { tag_name: "v1.0.2", body: "Notes", draft: false, prerelease: false },
      ],
    } as never);

    expect(await fetchPublishedReleases()).toEqual([
      { version: "1.0.2", body: "Notes" },
    ]);
  });

  it("excludes drafts and prereleases", async () => {
    mockFetch({
      ok: true,
      json: async () => [
        { tag_name: "v1.0.3", body: "a", draft: true, prerelease: false },
        { tag_name: "v1.0.4-beta", body: "b", draft: false, prerelease: true },
        { tag_name: "v1.0.2", body: "c", draft: false, prerelease: false },
      ],
    } as never);

    expect(await fetchPublishedReleases()).toEqual([
      { version: "1.0.2", body: "c" },
    ]);
  });

  it("treats a missing body as null", async () => {
    mockFetch({
      ok: true,
      json: async () => [
        { tag_name: "v1.0.2", body: null, draft: false, prerelease: false },
      ],
    } as never);

    expect(await fetchPublishedReleases()).toEqual([
      { version: "1.0.2", body: null },
    ]);
  });

  it("returns an empty list on a non-OK response", async () => {
    mockFetch({ ok: false } as never);
    expect(await fetchPublishedReleases()).toEqual([]);
  });

  it("returns an empty list when the response isn't a JSON array", async () => {
    mockFetch({ ok: true, json: async () => ({ message: "oops" }) } as never);
    expect(await fetchPublishedReleases()).toEqual([]);
  });

  it("returns an empty list rather than throwing on a network error", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("offline")) as never;
    expect(await fetchPublishedReleases()).toEqual([]);
  });
});
