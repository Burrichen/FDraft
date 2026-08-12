import { NextResponse, type NextRequest } from "next/server";
import { getConfiguredFilmMetadataProvider } from "@/domain/import/providers/configured-provider";
import { FilmMetadataProviderError } from "@/domain/import/film-metadata-provider";

/**
 * A thin, stateless proxy to the configured `FilmMetadataProvider`'s
 * `search()` capability — see docs/product-spec.md, "UNRESOLVED METADATA
 * RESOLUTION", "PROVIDER MATCH SUGGESTIONS" / "MANUAL SEARCH". Sibling to
 * `src/app/api/metadata/route.ts` (automatic single-best-match lookup)
 * but deliberately never collapses to a matched/ambiguous/not-found
 * verdict — it always returns the best few candidates worth showing a
 * human to choose from, ranked but not auto-selected. Holds no database
 * connection, no persisted state — same rationale as the sibling route
 * (keeps the provider API key server-side).
 *
 * Response shape:
 *   200 { status: "ok", providerId, candidates }
 *   200 { status: "not-configured" }              (no TMDB_API_KEY set)
 *   200 { status: "not-supported", providerId }    (a configured provider with no search() capability)
 *   400 { status: "invalid-import-data", message }
 *   429 { status: "rate-limited", providerId, retryAfterMs? }
 *   502 { status: "provider-error", providerId, message }
 */
export async function POST(request: NextRequest) {
  let input: { title?: unknown; releaseYear?: unknown };
  try {
    input = await request.json();
  } catch {
    return NextResponse.json(
      { status: "invalid-import-data", message: "Invalid request body" },
      { status: 400 },
    );
  }

  if (!input.title || typeof input.title !== "string") {
    return NextResponse.json(
      { status: "invalid-import-data", message: "A search title is required" },
      { status: 400 },
    );
  }
  const releaseYear =
    typeof input.releaseYear === "number" ? input.releaseYear : null;

  const provider = getConfiguredFilmMetadataProvider();
  if (provider.id === "none") {
    return NextResponse.json({ status: "not-configured" });
  }
  if (!provider.search) {
    return NextResponse.json({
      status: "not-supported",
      providerId: provider.id,
    });
  }

  try {
    const candidates = await provider.search(input.title, releaseYear);
    return NextResponse.json({
      status: "ok",
      providerId: provider.id,
      candidates,
    });
  } catch (error) {
    if (error instanceof FilmMetadataProviderError) {
      if (error.status === "rate-limited") {
        return NextResponse.json(
          {
            status: "rate-limited",
            providerId: provider.id,
            retryAfterMs: error.retryAfterMs,
          },
          { status: 429 },
        );
      }
      if (error.status === "invalid-import-data") {
        return NextResponse.json(
          { status: "invalid-import-data", message: error.message },
          { status: 400 },
        );
      }
      return NextResponse.json(
        {
          status: "provider-error",
          providerId: provider.id,
          message: error.message,
        },
        { status: 502 },
      );
    }
    return NextResponse.json(
      {
        status: "provider-error",
        providerId: provider.id,
        message:
          error instanceof Error ? error.message : "Metadata search failed",
      },
      { status: 502 },
    );
  }
}
