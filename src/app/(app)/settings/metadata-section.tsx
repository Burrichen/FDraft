"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  downloadMissingMetadata,
  getMetadataStatusSummary,
  refreshOldMetadata,
  retryMetadataForFilms,
  type MetadataDownloadOutcome,
  type MetadataDownloadProgress,
  type MetadataStatusSummary,
} from "@/application/metadata/local-metadata-service";
import { countUnresolvedFilms } from "@/application/metadata/unresolved-films";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Progress,
  ProgressTrack,
  ProgressIndicator,
} from "@/components/ui/progress";
import { useAsyncData } from "@/hooks/use-async-data";

type OperationKind = "download" | "refresh" | "retry";

/**
 * A single, complete-run summary — see docs/product-spec.md's
 * metadata-matching bugfix, "METADATA DOWNLOAD UX": "Metadata update
 * complete / Matched: 1,188 / Already cached: 6 / Unresolved: 7 / Failed:
 * 3". "Already cached" isn't part of the outcome itself (see
 * `MetadataDownloadOutcome`'s doc comment) — it's read from the status
 * summary that was current right before this run started.
 */
export function describeOutcome(outcome: MetadataDownloadOutcome): {
  tone: "success" | "warning" | "error";
  message: string;
} {
  if (outcome.providerNotConfigured) {
    return {
      tone: "warning",
      message:
        "Metadata service unavailable — no metadata provider is configured for this installation. Add a TMDB_API_KEY (see .env.example) to enable enrichment.",
    };
  }
  if (outcome.likelyOffline) {
    return {
      tone: "error",
      message:
        "Waiting for internet connection — check your connection and try again.",
    };
  }
  if (outcome.attempted === 0) {
    return { tone: "success", message: "Nothing to fetch." };
  }
  const parts = [`${outcome.matched} matched`];
  const unresolved = outcome.ambiguous + outcome.notFound;
  if (unresolved > 0) parts.push(`${unresolved} unresolved`);
  if (outcome.failed > 0)
    parts.push(
      `${outcome.failed} failed${outcome.rateLimited > 0 ? " (rate limited)" : ""}`,
    );
  return {
    tone: outcome.failed > 0 || unresolved > 0 ? "warning" : "success",
    message: parts.join(", ") + ".",
  };
}

function StatBlock({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-foreground text-xl font-semibold tabular-nums">
        {value.toLocaleString()}
      </dd>
    </div>
  );
}

/**
 * "METADATA" — see docs/product-spec.md, "METADATA REFRESH": cached/missing/
 * old counts, plus explicit, user-initiated actions. Nothing here ever
 * runs on its own — no startup refresh, no background polling (see "Do
 * not aggressively refresh every film on application startup").
 *
 * Shows live progress while a download/refresh/retry is in flight (see
 * `MetadataDownloadProgress` — "METADATA DOWNLOAD UX": "show progress
 * rather than immediately dumping a wall of 'No match'"), then a
 * completion summary with a "Retry Unresolved" action when anything
 * didn't resolve.
 */
interface MetadataSectionData {
  summary: MetadataStatusSummary;
  needsReview: number;
}

export function MetadataSection() {
  const { activeProfile, repositories } = useProfileContext();
  const { data, isLoading, reloadSilently } =
    useAsyncData<MetadataSectionData | null>(async () => {
      if (!activeProfile) return null;
      const [summary, unresolvedCounts] = await Promise.all([
        getMetadataStatusSummary(repositories, activeProfile.id),
        countUnresolvedFilms(repositories),
      ]);
      return {
        summary,
        needsReview: unresolvedCounts.unresolved + unresolvedCounts.failed,
      };
    }, [activeProfile?.id, repositories]);
  const summary = data?.summary ?? null;
  const needsReview = data?.needsReview ?? 0;

  const [runningOperation, setRunningOperation] =
    useState<OperationKind | null>(null);
  const [progress, setProgress] = useState<MetadataDownloadProgress | null>(
    null,
  );
  const [lastOutcome, setLastOutcome] =
    useState<MetadataDownloadOutcome | null>(null);

  async function runOperation(
    kind: OperationKind,
    run: (
      onProgress: (p: MetadataDownloadProgress) => void,
    ) => Promise<MetadataDownloadOutcome>,
  ) {
    setRunningOperation(kind);
    setProgress(null);
    try {
      const outcome = await run((p) => setProgress(p));
      setLastOutcome(outcome);
      const { tone, message } = describeOutcome(outcome);
      toast[tone](message);
      await reloadSilently();
    } finally {
      setRunningOperation(null);
      setProgress(null);
    }
  }

  async function handleDownloadMissing() {
    if (!activeProfile) return;
    await runOperation("download", (onProgress) =>
      downloadMissingMetadata(repositories, activeProfile.id, { onProgress }),
    );
  }

  async function handleRefreshOld() {
    if (!activeProfile) return;
    await runOperation("refresh", (onProgress) =>
      refreshOldMetadata(repositories, activeProfile.id, { onProgress }),
    );
  }

  async function handleRetryUnresolved() {
    if (!activeProfile || !lastOutcome) return;
    await runOperation("retry", (onProgress) =>
      retryMetadataForFilms(repositories, lastOutcome.retryableFilmIds, {
        onProgress,
      }),
    );
  }

  const isBusy = runningOperation !== null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Metadata</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading || !summary ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : (
          <>
            <dl className="grid grid-cols-3 gap-4">
              <StatBlock label="Films cached" value={summary.filmsCached} />
              <StatBlock
                label="Missing metadata"
                value={summary.missingMetadata}
              />
              <StatBlock label="Old metadata" value={summary.oldMetadata} />
              {needsReview > 0 ? (
                <div>
                  <dt className="text-xs font-medium">
                    <Link
                      href="/settings/unresolved-metadata"
                      className="text-watchlist-orange hover:text-watchlist-orange/80 focus-visible:outline-ring inline-flex items-center gap-0.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      Needs review
                      <ChevronRight aria-hidden="true" className="size-3" />
                    </Link>
                  </dt>
                  <dd className="text-foreground text-xl font-semibold tabular-nums">
                    {needsReview.toLocaleString()}
                  </dd>
                </div>
              ) : (
                <StatBlock label="Needs review" value={0} />
              )}
            </dl>
            {summary.missingMetadata > 0 &&
            typeof navigator !== "undefined" &&
            !navigator.onLine ? (
              <p className="text-watchlist-orange text-sm">
                {summary.missingMetadata} film
                {summary.missingMetadata === 1 ? "" : "s"} need metadata.
                Connect to the internet when convenient and choose
                &quot;Download Missing Metadata&quot;.
              </p>
            ) : null}

            {progress ? (
              <div
                className="border-border bg-muted/40 space-y-2 rounded-lg border p-3"
                role="status"
                aria-live="polite"
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="text-foreground font-medium">
                    {runningOperation === "retry"
                      ? "Retrying unresolved films…"
                      : "Downloading metadata…"}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {progress.completed.toLocaleString()} /{" "}
                    {progress.total.toLocaleString()}
                  </span>
                </div>
                <Progress
                  value={Math.round(
                    (progress.completed / progress.total) * 100,
                  )}
                >
                  <ProgressTrack>
                    <ProgressIndicator />
                  </ProgressTrack>
                </Progress>
                <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums">
                  <span>Matched: {progress.matched.toLocaleString()}</span>
                  <span>
                    Unresolved: {progress.unresolved.toLocaleString()}
                  </span>
                  <span>Failed: {progress.failed.toLocaleString()}</span>
                </div>
              </div>
            ) : null}

            {!progress &&
            lastOutcome &&
            lastOutcome.attempted +
              (lastOutcome.providerNotConfigured ? 1 : 0) >
              0 ? (
              <Alert
                variant={
                  lastOutcome.failed > 0 ||
                  lastOutcome.ambiguous + lastOutcome.notFound > 0
                    ? "destructive"
                    : "default"
                }
              >
                <AlertDescription className="space-y-2">
                  <p className="text-foreground font-medium">
                    Metadata update complete
                  </p>
                  <dl className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <dt className="text-muted-foreground text-xs">Matched</dt>
                      <dd className="tabular-nums">
                        {lastOutcome.matched.toLocaleString()}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground text-xs">
                        Unresolved
                      </dt>
                      <dd className="tabular-nums">
                        {(
                          lastOutcome.ambiguous + lastOutcome.notFound
                        ).toLocaleString()}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground text-xs">Failed</dt>
                      <dd className="tabular-nums">
                        {lastOutcome.failed.toLocaleString()}
                      </dd>
                    </div>
                  </dl>
                  {lastOutcome.providerNotConfigured ? (
                    <p className="text-sm">
                      No metadata provider is configured for this installation.
                      Add a TMDB_API_KEY (see .env.example) to enable
                      enrichment.
                    </p>
                  ) : null}
                  {lastOutcome.retryableFilmIds.length > 0 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleRetryUnresolved}
                      disabled={isBusy}
                    >
                      {runningOperation === "retry"
                        ? "Retrying…"
                        : `Retry Unresolved (${lastOutcome.retryableFilmIds.length})`}
                    </Button>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDownloadMissing}
                disabled={isBusy || summary.missingMetadata === 0}
              >
                {runningOperation === "download"
                  ? "Downloading…"
                  : "Download Missing Metadata"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRefreshOld}
                disabled={isBusy || summary.oldMetadata === 0}
              >
                {runningOperation === "refresh"
                  ? "Refreshing…"
                  : "Refresh Old Metadata"}
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              Enrichment (posters, runtime, genres, and more) requires an
              internet connection — everything else in FDraft, including
              challenges and stats, works entirely from what&apos;s already
              cached here.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
