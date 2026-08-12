import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import {
  FilmMetadataProviderError,
  type FilmMetadataCandidateDetail,
  type FilmMetadataProvider,
} from "@/domain/import/film-metadata-provider";
import { getConfiguredFilmMetadataProvider } from "@/domain/import/providers/configured-provider";
import { POST } from "./route";

vi.mock("@/domain/import/providers/configured-provider", () => ({
  getConfiguredFilmMetadataProvider: vi.fn(),
}));

function fakeProvider(
  search: FilmMetadataProvider["search"],
  id = "tmdb",
): FilmMetadataProvider {
  return {
    id,
    supportedCapabilities: [],
    async lookup() {
      return null;
    },
    search,
  };
}

function postRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/metadata/search", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const SAMPLE_CANDIDATE: FilmMetadataCandidateDetail = {
  providerId: "tmdb",
  externalId: "8846",
  title: "Jacob's Ladder",
  releaseYear: 1990,
  confidence: 0.9,
  result: { runtimeMinutes: 113, directors: ["Adrian Lyne"] },
};

describe("POST /api/metadata/search", () => {
  it("reports not-configured, without ever calling search, when no provider is configured", async () => {
    const search = vi.fn();
    vi.mocked(getConfiguredFilmMetadataProvider).mockReturnValue(
      fakeProvider(search, "none"),
    );

    const response = await POST(postRequest({ title: "Jacob's Ladder" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "not-configured" });
    expect(search).not.toHaveBeenCalled();
  });

  it("reports not-supported when the configured provider has no search capability", async () => {
    const provider: FilmMetadataProvider = {
      id: "tmdb",
      supportedCapabilities: [],
      async lookup() {
        return null;
      },
      // no `search` at all
    };
    vi.mocked(getConfiguredFilmMetadataProvider).mockReturnValue(provider);

    const response = await POST(postRequest({ title: "Jacob's Ladder" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "not-supported",
      providerId: "tmdb",
    });
  });

  it("reports ok with the ranked candidate list on success", async () => {
    vi.mocked(getConfiguredFilmMetadataProvider).mockReturnValue(
      fakeProvider(async () => [SAMPLE_CANDIDATE]),
    );

    const response = await POST(
      postRequest({ title: "Jacob's Ladder", releaseYear: 1990 }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      providerId: "tmdb",
      candidates: [SAMPLE_CANDIDATE],
    });
  });

  it("reports ok with an empty array — never an error — when there are no sensible candidates", async () => {
    vi.mocked(getConfiguredFilmMetadataProvider).mockReturnValue(
      fakeProvider(async () => []),
    );

    const response = await POST(postRequest({ title: "Nothing Like This" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      providerId: "tmdb",
      candidates: [],
    });
  });

  it("reports rate-limited with HTTP 429 and the retry hint", async () => {
    vi.mocked(getConfiguredFilmMetadataProvider).mockReturnValue(
      fakeProvider(async () => {
        throw new FilmMetadataProviderError(
          "rate limited",
          "rate-limited",
          429,
          2000,
        );
      }),
    );

    const response = await POST(postRequest({ title: "Jacob's Ladder" }));

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      status: "rate-limited",
      providerId: "tmdb",
      retryAfterMs: 2000,
    });
  });

  it("reports provider-error with HTTP 502 for a provider outage", async () => {
    vi.mocked(getConfiguredFilmMetadataProvider).mockReturnValue(
      fakeProvider(async () => {
        throw new FilmMetadataProviderError(
          "TMDB request failed with status 503",
          "provider-error",
          503,
        );
      }),
    );

    const response = await POST(postRequest({ title: "Jacob's Ladder" }));

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.status).toBe("provider-error");
    expect(body.message).toContain("503");
  });

  it("reports invalid-import-data with HTTP 400 when the request body has no title", async () => {
    const search = vi.fn();
    vi.mocked(getConfiguredFilmMetadataProvider).mockReturnValue(
      fakeProvider(search),
    );

    const response = await POST(postRequest({ releaseYear: 1990 }));

    expect(response.status).toBe(400);
    expect((await response.json()).status).toBe("invalid-import-data");
    expect(search).not.toHaveBeenCalled();
  });

  it("reports invalid-import-data with HTTP 400 for a malformed request body", async () => {
    const request = new NextRequest("http://localhost/api/metadata/search", {
      method: "POST",
      body: "{not valid json",
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect((await response.json()).status).toBe("invalid-import-data");
  });

  it("never 500s — an unexpected thrown error still comes back as a structured provider-error", async () => {
    vi.mocked(getConfiguredFilmMetadataProvider).mockReturnValue(
      fakeProvider(async () => {
        throw new Error("something unexpected");
      }),
    );

    const response = await POST(postRequest({ title: "Jacob's Ladder" }));

    expect(response.status).toBe(502);
    expect((await response.json()).status).toBe("provider-error");
  });
});
