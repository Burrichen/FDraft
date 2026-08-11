import { describe, expect, it, vi } from "vitest";
import {
  fetchFilmMetadataViaApi,
  MetadataNetworkError,
} from "./remote-metadata-client";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("fetchFilmMetadataViaApi", () => {
  it("throws MetadataNetworkError when fetch itself fails (offline)", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(
      fetchFilmMetadataViaApi(
        { title: "Inception", releaseYear: 2010 },
        { fetchImpl },
      ),
    ).rejects.toThrow(MetadataNetworkError);
  });

  it("throws MetadataNetworkError when the response body isn't valid JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);
    await expect(
      fetchFilmMetadataViaApi(
        { title: "Inception", releaseYear: 2010 },
        { fetchImpl },
      ),
    ).rejects.toThrow(MetadataNetworkError);
  });

  it("throws MetadataNetworkError for a JSON body with no recognizable status", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ unexpected: "shape" }, 200));
    await expect(
      fetchFilmMetadataViaApi(
        { title: "Inception", releaseYear: 2010 },
        { fetchImpl },
      ),
    ).rejects.toThrow(MetadataNetworkError);
  });

  it.each([
    [
      "matched",
      { status: "matched", providerId: "tmdb", result: { posterUrl: "x" } },
      200,
    ],
    ["not-found", { status: "not-found", providerId: "tmdb" }, 200],
    [
      "ambiguous",
      {
        status: "ambiguous",
        providerId: "tmdb",
        candidates: [{ title: "Doubt", releaseYear: 2008, confidence: 0.7 }],
      },
      200,
    ],
    ["not-configured", { status: "not-configured" }, 200],
    [
      "rate-limited",
      { status: "rate-limited", providerId: "tmdb", retryAfterMs: 2000 },
      429,
    ],
    [
      "provider-error",
      { status: "provider-error", providerId: "tmdb", message: "down" },
      502,
    ],
    [
      "invalid-import-data",
      { status: "invalid-import-data", message: "bad" },
      400,
    ],
  ] as const)(
    "parses a %s response regardless of HTTP status",
    async (_label, body, httpStatus) => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(jsonResponse(body, httpStatus));
      const result = await fetchFilmMetadataViaApi(
        { title: "Inception", releaseYear: 2010 },
        { fetchImpl },
      );
      expect(result).toEqual(body);
    },
  );
});
