"use client";

import { useState } from "react";
import {
  refreshJanuaryManifest,
  type JanuaryManifestSource,
} from "@/application/events/january-manifest-service";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LocalStorageEventManifestCacheStore } from "@/infrastructure/events/event-manifest-cache-store";

const SOURCE_LABEL: Record<JanuaryManifestSource, string> = {
  remote: "Fetched the latest list from GitHub.",
  cache: "Using the cached list — still fresh.",
  "bundled-default": "No network/cache available — using the bundled default.",
};

/**
 * A dev/testing affordance for the January event's remotely-configurable
 * curated whitelist (see docs/updates, "MANIFEST REFRESH": "allow explicit
 * refresh in Settings for development/testing"). The automatic refresh
 * already happens once per app session (see `app-shell.tsx`); this button
 * exists to force it again without restarting the app — useful for
 * confirming a manifest publish actually reached this installation.
 */
export function JanuaryManifestSection() {
  const { repositories } = useProfileContext();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastResult, setLastResult] = useState<{
    source: JanuaryManifestSource;
    filmCount: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRefresh() {
    setIsRefreshing(true);
    setError(null);
    try {
      const result = await refreshJanuaryManifest(
        {
          cacheStore: new LocalStorageEventManifestCacheStore(),
          films: repositories.films,
        },
        { forceRefresh: true },
      );
      setLastResult({
        source: result.source,
        filmCount: result.manifest.films.length,
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not refresh event data.",
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Event data</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          F* You, It&apos;s January!&apos;s curated film list updates
          automatically in the background. Use this to force a refresh right
          now — mainly useful for testing.
        </p>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleRefresh()}
            disabled={isRefreshing}
          >
            {isRefreshing ? "Refreshing…" : "Refresh event data"}
          </Button>
          {lastResult ? (
            <span className="text-muted-foreground text-sm">
              {SOURCE_LABEL[lastResult.source]} ({lastResult.filmCount} curated
              film{lastResult.filmCount === 1 ? "" : "s"})
            </span>
          ) : null}
          {error ? (
            <span className="text-destructive text-sm">{error}</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
