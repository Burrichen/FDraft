import {
  nullFilmMetadataProvider,
  type FilmMetadataProvider,
} from "@/domain/import/film-metadata-provider";
import { createTmdbProvider } from "./tmdb-provider";

/**
 * The provider actually used by the import pipeline, chosen from
 * environment configuration. With no TMDB_API_KEY set (e.g. this
 * repository's default local setup), imports still complete successfully —
 * every film is created with no enrichment, which is the honest outcome
 * when no authorized provider is configured (see docs/product-spec.md,
 * "Data Provider Rule").
 */
export function getConfiguredFilmMetadataProvider(): FilmMetadataProvider {
  const apiKey = process.env.TMDB_API_KEY;
  if (apiKey) {
    return createTmdbProvider({ apiKey });
  }
  return nullFilmMetadataProvider;
}
