import { describe, expect, it, vi } from "vitest";
import {
  FilmMetadataAmbiguousError,
  FilmMetadataProviderError,
} from "@/domain/import/film-metadata-provider";
import { createTmdbProvider } from "./tmdb-provider";

function jsonResponse(
  body: unknown,
  options: { ok?: boolean; status?: number; retryAfter?: string } = {},
): Response {
  const { ok = true, status = 200, retryAfter } = options;
  return {
    ok,
    status,
    headers: {
      get: (name: string) =>
        name === "Retry-After" ? (retryAfter ?? null) : null,
    },
    json: async () => body,
  } as unknown as Response;
}

function movieDetails(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 27205,
    imdb_id: "tt1375666",
    runtime: 148,
    poster_path: "/poster.jpg",
    genres: [
      { id: 1, name: "Action" },
      { id: 2, name: "Sci-Fi" },
    ],
    production_countries: [
      { iso_3166_1: "US", name: "United States of America" },
    ],
    spoken_languages: [{ iso_639_1: "en", english_name: "English" }],
    belongs_to_collection: null,
    vote_average: 8.4,
    popularity: 123.4,
    credits: {
      crew: [
        { job: "Director", name: "Christopher Nolan" },
        { job: "Producer", name: "Emma Thomas" },
      ],
    },
    ...overrides,
  };
}

describe("createTmdbProvider", () => {
  it("returns null when the search finds no candidates at all, without throwing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ results: [] }));
    const provider = createTmdbProvider({ apiKey: "test-key", fetchImpl });

    const result = await provider.lookup({
      title: "A Film That Does Not Exist",
      releaseYear: 2099,
    });

    expect(result).toBeNull();
  });

  it("does not send a year/primary_release_year search parameter — the actual root cause of the 'always no match' bug", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ results: [] }));
    const provider = createTmdbProvider({ apiKey: "test-key", fetchImpl });

    await provider.lookup({ title: "Anything", releaseYear: 2010 });

    const searchUrl = fetchImpl.mock.calls[0][0] as string;
    expect(searchUrl).not.toContain("year=");
  });

  it("maps a full exact match to a FilmMetadataResult", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              id: 27205,
              title: "Inception",
              original_title: "Inception",
              release_date: "2010-07-16",
              popularity: 80,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse(movieDetails()));

    const provider = createTmdbProvider({ apiKey: "test-key", fetchImpl });
    const result = await provider.lookup({
      title: "Inception",
      releaseYear: 2010,
    });

    expect(result).toEqual({
      posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
      runtimeMinutes: 148,
      genres: ["Action", "Sci-Fi"],
      directors: ["Christopher Nolan"],
      countries: ["United States of America"],
      languages: ["English"],
      collectionId: null,
      collectionName: null,
      collectionOrder: null,
      averageRating: 4.2,
      popularity: 123.4,
      watchCount: null,
      fansCount: null,
      listAppearances: null,
      externalIds: { tmdb: "27205", imdb: "tt1375666" },
      raw: expect.any(Object),
    });
  });

  it("never lets a malformed (wrong-typed) TMDB response corrupt a numeric field — see docs/product-spec.md, 'COMPLETE PRODUCT AUDIT'", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              id: 27205,
              title: "Inception",
              original_title: "Inception",
              release_date: "2010-07-16",
              popularity: 80,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          movieDetails({
            // A malformed 200 OK body — a string where TMDB's own schema
            // promises a number. Trusting this by TYPE alone (rather than
            // validating it) would persist the string as-is, later
            // corrupting Stats' numeric aggregates via string
            // concatenation (`0 + "142"` -> `"0142"`) instead of ever
            // surfacing as an error.
            runtime: "142",
            popularity: "123.4",
            vote_average: "8.4",
            genres: "not-an-array",
            production_countries: null,
            spoken_languages: undefined,
            credits: { crew: "not-an-array" },
          }),
        ),
      );

    const provider = createTmdbProvider({ apiKey: "test-key", fetchImpl });
    const result = await provider.lookup({
      title: "Inception",
      releaseYear: 2010,
    });

    expect(result).toMatchObject({
      runtimeMinutes: null,
      popularity: null,
      averageRating: null,
      genres: null,
      countries: null,
      languages: null,
      directors: null,
    });
  });

  it("matches a title differing only by punctuation", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              id: 1,
              title: "Spider-Man: Into the Spider-Verse",
              release_date: "2018-12-14",
              popularity: 90,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse(movieDetails({ id: 1 })));

    const provider = createTmdbProvider({ apiKey: "test-key", fetchImpl });
    const result = await provider.lookup({
      title: "Spider Man Into the Spider Verse",
      releaseYear: 2018,
    });

    expect(result).not.toBeNull();
  });

  it("matches an accented title against an unaccented import", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              id: 194,
              title: "Amélie",
              release_date: "2001-04-25",
              popularity: 40,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse(movieDetails({ id: 194 })));

    const provider = createTmdbProvider({ apiKey: "test-key", fetchImpl });
    const result = await provider.lookup({
      title: "Amelie",
      releaseYear: 2001,
    });

    expect(result).not.toBeNull();
  });

  it("matches a title with a typographic apostrophe against a plain one", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              id: 646_385,
              title: "Don’t Look Up",
              release_date: "2021-12-05",
              popularity: 30,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse(movieDetails({ id: 646_385 })));

    const provider = createTmdbProvider({ apiKey: "test-key", fetchImpl });
    const result = await provider.lookup({
      title: "Don't Look Up",
      releaseYear: 2021,
    });

    expect(result).not.toBeNull();
  });

  it("matches when the provider's release year is one year off the imported year", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              id: 496_243,
              title: "Parasite",
              release_date: "2019-05-30",
              popularity: 60,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse(movieDetails({ id: 496_243 })));

    const provider = createTmdbProvider({ apiKey: "test-key", fetchImpl });
    const result = await provider.lookup({
      title: "Parasite",
      releaseYear: 2020,
    });

    expect(result).not.toBeNull();
  });

  it("rejects a same-titled candidate whose year is clearly wrong, returning null rather than the wrong film", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        results: [
          {
            id: 10_207,
            title: "It",
            release_date: "1990-11-18",
            popularity: 20,
          },
        ],
      }),
    );

    const provider = createTmdbProvider({ apiKey: "test-key", fetchImpl });
    const result = await provider.lookup({ title: "It", releaseYear: 2017 });

    expect(result).toBeNull();
    // Only the search call — a rejected candidate must never trigger a details fetch.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws FilmMetadataAmbiguousError, not a guess, when multiple candidates are equally plausible", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        results: [
          { id: 1, title: "Doubt", release_date: "2008-12-12", popularity: 10 },
          { id: 2, title: "Doubt", release_date: "2008-12-12", popularity: 10 },
        ],
      }),
    );
    const provider = createTmdbProvider({ apiKey: "test-key", fetchImpl });

    await expect(
      provider.lookup({ title: "Doubt", releaseYear: 2008 }),
    ).rejects.toThrow(FilmMetadataAmbiguousError);
    // Never fetches details for either candidate when it can't confidently pick one.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("never invents Letterboxd-specific community metrics TMDB doesn't have", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          results: [{ id: 1, title: "Obscure Film", popularity: 1 }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          movieDetails({
            id: 1,
            imdb_id: null,
            runtime: null,
            poster_path: null,
            genres: [],
            production_countries: [],
            spoken_languages: [],
            vote_average: 0,
            popularity: 0,
            credits: { crew: [] },
          }),
        ),
      );

    const provider = createTmdbProvider({ apiKey: "test-key", fetchImpl });
    const result = await provider.lookup({
      title: "Obscure Film",
      releaseYear: null,
    });

    expect(result?.watchCount).toBeNull();
    expect(result?.fansCount).toBeNull();
    expect(result?.listAppearances).toBeNull();
    // vote_average of 0 means "no votes yet", not a real zero rating.
    expect(result?.averageRating).toBeNull();
    expect(result?.genres).toBeNull();
    expect(result?.directors).toBeNull();
  });

  it("maps a franchise film's collection id and name", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              id: 2,
              title: "Sequel",
              release_date: "2020-01-01",
              popularity: 5,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          movieDetails({
            id: 2,
            runtime: 120,
            poster_path: null,
            genres: [],
            production_countries: [],
            spoken_languages: [],
            belongs_to_collection: { id: 99, name: "Example Collection" },
            vote_average: 7,
            popularity: 10,
            credits: { crew: [] },
          }),
        ),
      );
    const provider = createTmdbProvider({ apiKey: "test-key", fetchImpl });
    const result = await provider.lookup({
      title: "Sequel",
      releaseYear: 2020,
    });

    expect(result?.collectionId).toBe("99");
    expect(result?.collectionName).toBe("Example Collection");
  });

  it("throws FilmMetadataProviderError('provider-error') on a permanent transport/API failure, without retrying", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({}, { ok: false, status: 401 }));
    const provider = createTmdbProvider({
      apiKey: "bad-key",
      fetchImpl,
      sleepImpl: async () => {},
    });

    const error = await provider
      .lookup({ title: "Inception", releaseYear: 2010 })
      .catch((e) => e);
    expect(error).toBeInstanceOf(FilmMetadataProviderError);
    expect((error as FilmMetadataProviderError).status).toBe("provider-error");
    expect((error as FilmMetadataProviderError).httpStatus).toBe(401);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a rate-limited (429) request before giving up, respecting Retry-After", async () => {
    const sleepImpl = vi.fn().mockResolvedValue(undefined);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({}, { ok: false, status: 429, retryAfter: "2" }),
      )
      .mockResolvedValueOnce(
        jsonResponse({}, { ok: false, status: 429, retryAfter: "2" }),
      )
      .mockResolvedValueOnce(
        jsonResponse({}, { ok: false, status: 429, retryAfter: "2" }),
      );
    const provider = createTmdbProvider({
      apiKey: "test-key",
      fetchImpl,
      sleepImpl,
    });

    const error = await provider
      .lookup({ title: "Inception", releaseYear: 2010 })
      .catch((e) => e);

    expect(error).toBeInstanceOf(FilmMetadataProviderError);
    expect((error as FilmMetadataProviderError).status).toBe("rate-limited");
    expect(fetchImpl).toHaveBeenCalledTimes(3); // MAX_FETCH_ATTEMPTS
    expect(sleepImpl).toHaveBeenCalledWith(2000); // Retry-After: 2 seconds
  });

  it("caps an untrustworthy Retry-After header rather than sleeping for however long it says — see docs/product-spec.md, 'COMPLETE PRODUCT AUDIT'", async () => {
    const sleepImpl = vi.fn().mockResolvedValue(undefined);
    const fetchImpl = vi.fn().mockResolvedValue(
      // A malicious or misconfigured `Retry-After: 86400` (24 real hours)
      // must never be allowed to stall the whole download queue.
      jsonResponse({}, { ok: false, status: 429, retryAfter: "86400" }),
    );
    const provider = createTmdbProvider({
      apiKey: "test-key",
      fetchImpl,
      sleepImpl,
    });

    const error = await provider
      .lookup({ title: "Inception", releaseYear: 2010 })
      .catch((e) => e);

    expect(error).toBeInstanceOf(FilmMetadataProviderError);
    expect((error as FilmMetadataProviderError).retryAfterMs).toBe(30_000);
    for (const call of sleepImpl.mock.calls) {
      expect(call[0]).toBeLessThanOrEqual(30_000);
    }
  });

  it("gives up with a provider-error (not an unhandled rejection or an infinite hang) when every attempt times out", async () => {
    const sleepImpl = vi.fn().mockResolvedValue(undefined);
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(
        new DOMException("The operation timed out", "TimeoutError"),
      );
    const provider = createTmdbProvider({
      apiKey: "test-key",
      fetchImpl,
      sleepImpl,
    });

    const error = await provider
      .lookup({ title: "Inception", releaseYear: 2010 })
      .catch((e) => e);

    expect(error).toBeInstanceOf(FilmMetadataProviderError);
    expect((error as FilmMetadataProviderError).status).toBe("provider-error");
    expect(fetchImpl).toHaveBeenCalledTimes(3); // MAX_FETCH_ATTEMPTS
  });

  it("passes a timeout signal on every request so a hung TMDB response can't park a download-queue worker forever", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ results: [] }));
    const provider = createTmdbProvider({ apiKey: "test-key", fetchImpl });

    await provider.search!("Inception", 2010);

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("succeeds on a retry after a transient rate limit clears", async () => {
    const sleepImpl = vi.fn().mockResolvedValue(undefined);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 429 }))
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              id: 1,
              title: "Inception",
              release_date: "2010-07-16",
              popularity: 80,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse(movieDetails({ id: 1 })));
    const provider = createTmdbProvider({
      apiKey: "test-key",
      fetchImpl,
      sleepImpl,
    });

    const result = await provider.lookup({
      title: "Inception",
      releaseYear: 2010,
    });

    expect(result).not.toBeNull();
    expect(sleepImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a transient 5xx provider error once before giving up", async () => {
    const sleepImpl = vi.fn().mockResolvedValue(undefined);
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({}, { ok: false, status: 503 }));
    const provider = createTmdbProvider({
      apiKey: "test-key",
      fetchImpl,
      sleepImpl,
    });

    const error = await provider
      .lookup({ title: "Inception", releaseYear: 2010 })
      .catch((e) => e);

    expect(error).toBeInstanceOf(FilmMetadataProviderError);
    expect((error as FilmMetadataProviderError).status).toBe("provider-error");
    expect((error as FilmMetadataProviderError).httpStatus).toBe(503);
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(1);
  });

  it("rejects a blank title as invalid import data rather than searching for it", async () => {
    const fetchImpl = vi.fn();
    const provider = createTmdbProvider({ apiKey: "test-key", fetchImpl });

    const error = await provider
      .lookup({ title: "   ", releaseYear: 2010 })
      .catch((e) => e);

    expect(error).toBeInstanceOf(FilmMetadataProviderError);
    expect((error as FilmMetadataProviderError).status).toBe(
      "invalid-import-data",
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("declares only the capabilities it can actually supply", () => {
    const provider = createTmdbProvider({ apiKey: "test-key" });
    expect(provider.supportedCapabilities).not.toContain("watch_count");
    expect(provider.supportedCapabilities).not.toContain("fans_count");
    expect(provider.supportedCapabilities).not.toContain("list_appearances");
    expect(provider.supportedCapabilities).toContain("runtime");
  });
});
