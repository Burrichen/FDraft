import { afterEach, describe, expect, it, vi } from "vitest";
import { getConfiguredFilmMetadataProvider } from "./configured-provider";

describe("getConfiguredFilmMetadataProvider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("falls back to the null provider when TMDB_API_KEY is not set", () => {
    vi.stubEnv("TMDB_API_KEY", "");
    const provider = getConfiguredFilmMetadataProvider();
    expect(provider.id).toBe("none");
  });

  it("uses the TMDB provider when TMDB_API_KEY is set", () => {
    vi.stubEnv("TMDB_API_KEY", "a-real-looking-key");
    const provider = getConfiguredFilmMetadataProvider();
    expect(provider.id).toBe("tmdb");
  });
});
