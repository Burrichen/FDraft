"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  Film,
  HelpCircle,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { retryMetadataForFilms } from "@/application/metadata/local-metadata-service";
import { searchFilmMetadataCandidatesViaApi } from "@/application/metadata/search-metadata-client";
import {
  listUnresolvedFilms,
  manuallyMatchFilm,
  ProviderIdentifierConflictError,
  type UnresolvedFilmView,
} from "@/application/metadata/unresolved-films";
import { describeOutcome } from "@/app/(app)/settings/metadata-section";
import { AsyncDataError } from "@/components/async-data-error";
import { EmptyState } from "@/components/empty-state";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FilmMetadataCandidateDetail } from "@/domain/import/film-metadata-provider";
import { cn, formatReadableCalendarDate } from "@/lib/utils";
import { useAsyncData } from "@/hooks/use-async-data";

/**
 * Tagged with the `filmId` the search was run for, so a slow response from
 * a search the user has since navigated away from (collapsed film A,
 * expanded film B) can be told apart from the current film's own state —
 * see docs/product-spec.md, "COMPLETE PRODUCT AUDIT". Rendering additionally
 * checks `expandedFilmId === state.filmId` before ever showing a state.
 */
type CandidateSearchState = { filmId: string } & (
  | { status: "loading" }
  | { status: "ok"; candidates: FilmMetadataCandidateDetail[] }
  | { status: "not-configured" }
  | { status: "not-supported" }
  | { status: "error"; message: string }
);

/**
 * The Unresolved Metadata screen (see docs/product-spec.md, "UNRESOLVED
 * METADATA RESOLUTION"). Two sections, never merged: "Unresolved" (the
 * provider searched but couldn't confidently pick one film — user-fixable
 * via candidate search) and "Failed" (a technical error — the only useful
 * action is retrying the same automatic lookup, never picking a film by
 * hand for what might not even be a real identification problem).
 */
export function UnresolvedMetadataView() {
  const { activeProfile, repositories } = useProfileContext();
  const {
    data: films,
    isLoading,
    error,
    reload,
    reloadSilently,
  } = useAsyncData<UnresolvedFilmView[] | null>(async () => {
    if (!activeProfile) return null;
    return listUnresolvedFilms(repositories, activeProfile.id);
  }, [activeProfile?.id, repositories]);

  const [expandedFilmId, setExpandedFilmId] = useState<string | null>(null);
  const [searchState, setSearchState] = useState<CandidateSearchState | null>(
    null,
  );
  const [searchTitle, setSearchTitle] = useState("");
  const [searchYear, setSearchYear] = useState("");
  const [busyFilmId, setBusyFilmId] = useState<string | null>(null);

  // Guards against an out-of-order response: expand film A (slow search in
  // flight) -> collapse -> expand film B (fast response renders) -> A's
  // stale response arrives late and must NOT overwrite B's panel. Bumped on
  // every `runSearch` call; a response is only applied if it's still the
  // most recent one issued.
  const searchRequestIdRef = useRef(0);

  async function runSearch(
    filmId: string,
    title: string,
    releaseYear: number | null,
  ) {
    const requestId = ++searchRequestIdRef.current;
    setSearchState({ filmId, status: "loading" });
    const apply = (state: CandidateSearchState) => {
      if (searchRequestIdRef.current === requestId) {
        setSearchState(state);
      }
    };
    try {
      const result = await searchFilmMetadataCandidatesViaApi({
        title,
        releaseYear,
      });
      if (result.status === "ok") {
        apply({ filmId, status: "ok", candidates: result.candidates });
      } else if (result.status === "not-configured") {
        apply({ filmId, status: "not-configured" });
      } else if (result.status === "not-supported") {
        apply({ filmId, status: "not-supported" });
      } else if (result.status === "rate-limited") {
        apply({
          filmId,
          status: "error",
          message: "The metadata provider rate-limited this search.",
        });
      } else {
        apply({
          filmId,
          status: "error",
          message: "message" in result ? result.message : "Search failed.",
        });
      }
    } catch {
      apply({
        filmId,
        status: "error",
        message: "Could not reach the metadata provider.",
      });
    }
  }

  function handleExpand(film: UnresolvedFilmView) {
    if (expandedFilmId === film.filmId) {
      setExpandedFilmId(null);
      return;
    }
    setExpandedFilmId(film.filmId);
    setSearchTitle(film.title);
    setSearchYear(film.releaseYear ? String(film.releaseYear) : "");
    void runSearch(film.filmId, film.title, film.releaseYear);
  }

  async function handleManualSearchSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (!expandedFilmId) return;
    const year = searchYear.trim() ? Number(searchYear.trim()) : null;
    await runSearch(
      expandedFilmId,
      searchTitle.trim(),
      year !== null && Number.isFinite(year) ? year : null,
    );
  }

  async function handleUseThisFilm(
    film: UnresolvedFilmView,
    candidate: FilmMetadataCandidateDetail,
  ) {
    setBusyFilmId(film.filmId);
    try {
      await manuallyMatchFilm(repositories, {
        filmId: film.filmId,
        provider: candidate.providerId,
        title: film.title,
        result: candidate.result,
      });
      toast.success(`Matched "${film.title}" to ${candidate.title}.`);
      setExpandedFilmId(null);
      await reloadSilently();
    } catch (error) {
      if (error instanceof ProviderIdentifierConflictError) {
        toast.error(
          `"${candidate.title}" is already matched to a different film in your watchlist — pick another candidate.`,
        );
      } else {
        toast.error(
          `Could not match "${film.title}" to ${candidate.title}. Please try again.`,
        );
      }
    } finally {
      setBusyFilmId(null);
    }
  }

  async function handleRetryFailed(film: UnresolvedFilmView) {
    if (!activeProfile) return;
    setBusyFilmId(film.filmId);
    try {
      const outcome = await retryMetadataForFilms(repositories, [film.filmId]);
      const { tone, message } = describeOutcome(outcome);
      toast[tone](`"${film.title}": ${message}`);
      await reloadSilently();
    } catch {
      toast.error(`Could not retry "${film.title}". Please try again.`);
    } finally {
      setBusyFilmId(null);
    }
  }

  if (!activeProfile) {
    return null;
  }
  if (error) {
    return <AsyncDataError error={error} onRetry={reload} />;
  }
  if (isLoading && !films) {
    return null;
  }
  if (!films) {
    return null;
  }

  const unresolvedFilms = films.filter((film) => film.status === "unresolved");
  const failedFilms = films.filter((film) => film.status === "failed");

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <Link
          href="/settings"
          className="text-muted-foreground hover:text-foreground focus-visible:outline-ring inline-flex items-center gap-1 pl-3.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <ArrowLeft aria-hidden="true" className="size-3.5" />
          Settings
        </Link>
        <h1 className="page-heading mt-2">Unresolved metadata</h1>
        <p className="page-subtitle max-w-2xl">
          Films the metadata provider couldn&apos;t confidently identify, or
          that failed for a technical reason. Nothing here is deleted or broken
          — an unresolved film stays perfectly usable, just with reduced
          metadata.
        </p>
      </div>

      {films.length === 0 ? (
        <EmptyState
          icon={Film}
          title="Nothing needs review"
          description="Every film either has metadata or hasn't been searched yet."
        />
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-foreground flex items-center gap-2 text-lg font-bold">
              <HelpCircle
                aria-hidden="true"
                className="text-watchlist-orange size-5"
              />
              Unresolved ({unresolvedFilms.length})
            </h2>
            {unresolvedFilms.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No films need manual matching right now.
              </p>
            ) : (
              <ul className="space-y-3">
                {unresolvedFilms.map((film) => {
                  const isExpanded = expandedFilmId === film.filmId;
                  const panelId = `unresolved-panel-${film.filmId}`;
                  return (
                    <li
                      key={film.filmId}
                      className="border-border bg-card rounded-lg border"
                    >
                      <div className="flex w-full flex-wrap items-start justify-between gap-2 p-4">
                        <button
                          type="button"
                          onClick={() => handleExpand(film)}
                          aria-expanded={isExpanded}
                          aria-controls={panelId}
                          className="focus-visible:outline-ring flex flex-1 items-start gap-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                          <ChevronDown
                            aria-hidden="true"
                            className={cn(
                              "text-muted-foreground mt-1 size-4 shrink-0 transition-transform",
                              isExpanded ? "rotate-180" : "",
                            )}
                          />
                          <div>
                            <p className="text-foreground font-semibold">
                              {film.title}
                            </p>
                            <p className="text-muted-foreground text-xs">
                              {film.releaseYear
                                ? `Imported year: ${film.releaseYear}`
                                : "No imported year"}
                              {film.dateAdded
                                ? ` · Added ${formatReadableCalendarDate(film.dateAdded)}`
                                : ""}
                            </p>
                            <p className="text-muted-foreground mt-1 text-sm">
                              {film.message}
                            </p>
                          </div>
                        </button>
                        {film.letterboxdUri ? (
                          <a
                            href={film.letterboxdUri}
                            target="_blank"
                            rel="noreferrer"
                            className="text-watchlist-blue focus-visible:outline-ring shrink-0 text-xs underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2"
                          >
                            Letterboxd
                          </a>
                        ) : null}
                      </div>

                      {isExpanded ? (
                        <div id={panelId} className="space-y-4 border-t p-4">
                          <form
                            onSubmit={handleManualSearchSubmit}
                            className="flex flex-wrap items-end gap-2"
                          >
                            <div className="min-w-40 flex-1 space-y-1">
                              <Label htmlFor="unresolved-search-title">
                                Search metadata
                              </Label>
                              <Input
                                id="unresolved-search-title"
                                value={searchTitle}
                                onChange={(event) =>
                                  setSearchTitle(event.target.value)
                                }
                              />
                            </div>
                            <div className="w-24 space-y-1">
                              <Label htmlFor="unresolved-search-year">
                                Year
                              </Label>
                              <Input
                                id="unresolved-search-year"
                                inputMode="numeric"
                                value={searchYear}
                                onChange={(event) =>
                                  setSearchYear(event.target.value)
                                }
                              />
                            </div>
                            <Button
                              type="submit"
                              variant="outline"
                              size="sm"
                              disabled={
                                searchState?.filmId === film.filmId &&
                                searchState.status === "loading"
                              }
                            >
                              Search
                            </Button>
                          </form>

                          <div
                            className="space-y-2"
                            role="status"
                            aria-live="polite"
                          >
                            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                              Possible matches
                            </p>
                            {searchState?.filmId !==
                            film.filmId ? null : searchState.status ===
                              "loading" ? (
                              <p className="text-muted-foreground text-sm">
                                Searching…
                              </p>
                            ) : searchState.status === "not-configured" ? (
                              <p className="text-muted-foreground text-sm">
                                No metadata provider is configured for this
                                installation.
                              </p>
                            ) : searchState.status === "not-supported" ? (
                              <p className="text-muted-foreground text-sm">
                                The configured metadata provider doesn&apos;t
                                support manual search.
                              </p>
                            ) : searchState.status === "error" ? (
                              <p className="text-destructive text-sm">
                                {searchState.message}
                              </p>
                            ) : searchState.status === "ok" &&
                              searchState.candidates.length > 0 ? (
                              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                {searchState.candidates.map((candidate) => (
                                  <li
                                    key={candidate.externalId}
                                    className="border-border bg-background flex gap-3 rounded-lg border p-3"
                                  >
                                    <div className="bg-muted aspect-2/3 w-16 shrink-0 overflow-hidden rounded">
                                      {candidate.result.posterUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element -- posters are external, remote URLs from third-party providers
                                        <img
                                          src={candidate.result.posterUrl}
                                          alt=""
                                          className="h-full w-full object-cover"
                                        />
                                      ) : (
                                        <div className="text-muted-foreground flex h-full w-full items-center justify-center">
                                          <Film
                                            aria-hidden="true"
                                            className="size-6"
                                          />
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex min-w-0 flex-1 flex-col justify-between">
                                      <div>
                                        <p className="text-foreground truncate text-sm font-semibold">
                                          {candidate.title}
                                        </p>
                                        <p className="text-muted-foreground text-xs">
                                          {[
                                            candidate.releaseYear,
                                            candidate.result.directors?.[0],
                                            candidate.result.runtimeMinutes
                                              ? `${candidate.result.runtimeMinutes} min`
                                              : null,
                                          ]
                                            .filter(Boolean)
                                            .join(" · ")}
                                        </p>
                                      </div>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="mt-2 w-fit"
                                        disabled={busyFilmId === film.filmId}
                                        onClick={() =>
                                          handleUseThisFilm(film, candidate)
                                        }
                                      >
                                        Use This Film
                                      </Button>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-muted-foreground text-sm">
                                No sensible candidates found. Try adjusting the
                                search above.
                              </p>
                            )}
                          </div>

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setExpandedFilmId(null)}
                          >
                            Leave Unresolved
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-foreground flex items-center gap-2 text-lg font-bold">
              <AlertTriangle
                aria-hidden="true"
                className="text-destructive size-5"
              />
              Failed ({failedFilms.length})
            </h2>
            {failedFilms.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No technical failures right now.
              </p>
            ) : (
              <ul className="space-y-2">
                {failedFilms.map((film) => (
                  <li
                    key={film.filmId}
                    className="border-border bg-card flex flex-wrap items-center justify-between gap-2 rounded-lg border p-4"
                  >
                    <div>
                      <p className="text-foreground font-semibold">
                        {film.title}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        {film.message}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busyFilmId === film.filmId}
                      onClick={() => handleRetryFailed(film)}
                    >
                      {busyFilmId === film.filmId ? "Retrying…" : "Retry"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
