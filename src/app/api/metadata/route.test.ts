import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import {
  FilmMetadataAmbiguousError,
  FilmMetadataProviderError,
  type FilmMetadataProvider,
} from "@/domain/import/film-metadata-provider";
import { getConfiguredFilmMetadataProvider } from "@/domain/import/providers/configured-provider";
import { POST } from "./route";

vi.mock("@/domain/import/providers/configured-provider", () => ({
  getConfiguredFilmMetadataProvider: vi.fn(),
}));

function fakeProvider(
  lookup: FilmMetadataProvider["lookup"],
  id = "tmdb",
): FilmMetadataProvider {
  return { id, supportedCapabilities: [], lookup };
}

function postRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/metadata", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/metadata", () => {
  it("reports not-configured, without ever calling lookup, when no provider is configured", async () => {
    const lookup = vi.fn();
    vi.mocked(getConfiguredFilmMetadataProvider).mockReturnValue(
      fakeProvider(lookup, "none"),
    );

    const response = await POST(
      postRequest({ title: "Inception", releaseYear: 2010 }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "not-configured" });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("reports matched with the result and provider id on success", async () => {
    const result = { posterUrl: "https://example.com/p.jpg" };
    vi.mocked(getConfiguredFilmMetadataProvider).mockReturnValue(
      fakeProvider(async () => result),
    );

    const response = await POST(
      postRequest({ title: "Inception", releaseYear: 2010 }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "matched",
      providerId: "tmdb",
      result,
    });
  });

  it("reports not-found when the provider returns null", async () => {
    vi.mocked(getConfiguredFilmMetadataProvider).mockReturnValue(
      fakeProvider(async () => null),
    );

    const response = await POST(
      postRequest({ title: "Some Obscure Film", releaseYear: 2010 }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "not-found",
      providerId: "tmdb",
      result: null,
    });
  });

  it("reports ambiguous with the candidate list when the provider can't confidently pick one", async () => {
    const candidates = [
      { title: "Doubt", releaseYear: 2008, confidence: 0.7 },
      { title: "Doubt", releaseYear: 2008, confidence: 0.7 },
    ];
    vi.mocked(getConfiguredFilmMetadataProvider).mockReturnValue(
      fakeProvider(async () => {
        throw new FilmMetadataAmbiguousError(candidates);
      }),
    );

    const response = await POST(
      postRequest({ title: "Doubt", releaseYear: 2008 }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ambiguous",
      providerId: "tmdb",
      candidates,
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

    const response = await POST(
      postRequest({ title: "Inception", releaseYear: 2010 }),
    );

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

    const response = await POST(
      postRequest({ title: "Inception", releaseYear: 2010 }),
    );

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.status).toBe("provider-error");
    expect(body.message).toContain("503");
    expect(body.httpStatus).toBe(503);
  });

  it("passes the upstream HTTP status through on a 401 (invalid API key) so callers can give it a distinct, actionable message — see docs/product-spec.md, 'COMPLETE PRODUCT AUDIT'", async () => {
    vi.mocked(getConfiguredFilmMetadataProvider).mockReturnValue(
      fakeProvider(async () => {
        throw new FilmMetadataProviderError(
          "TMDB request failed with status 401",
          "provider-error",
          401,
        );
      }),
    );

    const response = await POST(
      postRequest({ title: "Inception", releaseYear: 2010 }),
    );

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.status).toBe("provider-error");
    expect(body.httpStatus).toBe(401);
  });

  it("reports invalid-import-data with HTTP 400 when the request body has no title", async () => {
    const lookup = vi.fn();
    vi.mocked(getConfiguredFilmMetadataProvider).mockReturnValue(
      fakeProvider(lookup),
    );

    const response = await POST(postRequest({ releaseYear: 2010 }));

    expect(response.status).toBe(400);
    expect((await response.json()).status).toBe("invalid-import-data");
    expect(lookup).not.toHaveBeenCalled();
  });

  it("reports invalid-import-data with HTTP 400 for a malformed request body", async () => {
    const request = new NextRequest("http://localhost/api/metadata", {
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

    const response = await POST(
      postRequest({ title: "Inception", releaseYear: 2010 }),
    );

    expect(response.status).toBe(502);
    expect((await response.json()).status).toBe("provider-error");
  });
});
