import { NextResponse, type NextRequest } from "next/server";
import { getConfiguredFilmMetadataProvider } from "@/domain/import/providers/configured-provider";
import {
  FilmMetadataAmbiguousError,
  FilmMetadataProviderError,
  type FilmMetadataLookupInput,
} from "@/domain/import/film-metadata-provider";

/**
 * A thin, stateless proxy to whatever `FilmMetadataProvider` is configured
 * (TMDB today — see `configured-provider.ts`), and nothing else (see
 * docs/product-spec.md, "METADATA BEHAVIOUR", Prompt 9.5B: "Film metadata
 * enrichment is allowed to require internet access"). This is the ONLY
 * server-side code left in the app once the Supabase cutover completes —
 * it holds no database connection, no session, no persisted state at all.
 * Its entire reason to exist is keeping `TMDB_API_KEY` out of the browser
 * bundle; a client calling TMDB directly would have to ship the key to
 * every visitor, which this route avoids without needing Supabase, a
 * database, or Docker (see docs/product-spec.md, "DOCKER").
 *
 * The browser-side caller is `src/application/metadata/
 * remote-metadata-client.ts`, which the local metadata queue
 * (`local-metadata-service.ts`) uses to fill in `FilmMetadataRecord`s in
 * IndexedDB. Nothing about a challenge's normal execution ever reaches this
 * route — only the explicit "Download Missing Metadata"/"Refresh Old
 * Metadata" actions do.
 *
 * Response shape (see docs/product-spec.md's metadata-matching bugfix
 * entry, "MATCH CONFIDENCE" — collapsing every outcome into a single "No
 * match" was the UX half of that bug): every response carries a `status`
 * discriminant so the caller can show something more useful than one
 * generic failure message.
 *   200 { status: "matched", providerId, result }
 *   200 { status: "not-found", providerId }
 *   200 { status: "ambiguous", providerId, candidates }
 *   200 { status: "not-configured" }              (no TMDB_API_KEY set)
 *   400 { status: "invalid-import-data", message }
 *   429 { status: "rate-limited", providerId, retryAfterMs? }
 *   502 { status: "provider-error", providerId, message, httpStatus? }
 */
export async function POST(request: NextRequest) {
  let input: FilmMetadataLookupInput;
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
      { status: "invalid-import-data", message: "A film title is required" },
      { status: 400 },
    );
  }

  const provider = getConfiguredFilmMetadataProvider();
  if (provider.id === "none") {
    // No point calling `.lookup()` — the null provider always returns
    // null, which would misleadingly look identical to "the provider
    // searched and genuinely found nothing" instead of "there is no
    // provider to ask at all" (see docs/product-spec.md's "not-configured"
    // status, added specifically because that distinction used to be
    // invisible to the user).
    return NextResponse.json({ status: "not-configured" });
  }

  try {
    const result = await provider.lookup(input);
    return NextResponse.json({
      status: result ? "matched" : "not-found",
      providerId: provider.id,
      result,
    });
  } catch (error) {
    if (error instanceof FilmMetadataAmbiguousError) {
      return NextResponse.json({
        status: "ambiguous",
        providerId: provider.id,
        candidates: error.candidates,
      });
    }
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
          httpStatus: error.httpStatus,
        },
        { status: 502 },
      );
    }
    // An unexpected, un-typed failure is still "metadata unavailable right
    // now", never a reason to 500 the whole app (see docs/product-spec.md,
    // "NETWORK FAILURE").
    return NextResponse.json(
      {
        status: "provider-error",
        providerId: provider.id,
        message:
          error instanceof Error ? error.message : "Metadata lookup failed",
      },
      { status: 502 },
    );
  }
}
