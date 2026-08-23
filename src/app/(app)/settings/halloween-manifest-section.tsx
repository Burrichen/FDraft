"use client";

import { useState } from "react";
import {
  refreshHalloweenManifest,
  type HalloweenManifestSource,
} from "@/application/events/halloween-manifest-service";
import { parseHalloweenManifest } from "@/domain/events/halloween-manifest-schema";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LocalStorageEventManifestCacheStore } from "@/infrastructure/events/event-manifest-cache-store";

const SOURCE_LABEL: Record<HalloweenManifestSource, string> = {
  remote: "Fetched the latest list from GitHub.",
  cache: "Using the cached list — still fresh.",
  "bundled-default": "No network/cache available — using the bundled default.",
};

/**
 * A dev/testing affordance for Halloween's remotely-configurable Horror/
 * Kitsch lists — a direct sibling of `JanuaryManifestSection`. The
 * automatic refresh already happens once per app session (see
 * `app-shell.tsx`); this button forces it again without restarting the
 * app.
 */
export function HalloweenManifestSection() {
  const { repositories } = useProfileContext();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastResult, setLastResult] = useState<{
    source: HalloweenManifestSource;
    horrorCount: number;
    kitschCount: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRefresh() {
    setIsRefreshing(true);
    setError(null);
    try {
      const result = await refreshHalloweenManifest(
        {
          cacheStore: new LocalStorageEventManifestCacheStore(
            parseHalloweenManifest,
          ),
          films: repositories.films,
          unresolvedMetadata: repositories.unresolvedMetadata,
        },
        { forceRefresh: true },
      );
      setLastResult({
        source: result.source,
        horrorCount: result.manifest.horror.length,
        kitschCount: result.manifest.kitsch.length,
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not refresh event data.",
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Halloween event data</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          Halloween&apos;s curated Horror and Kitsch film lists update
          automatically in the background. Use this to force a refresh right now
          — mainly useful for testing.
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
              {SOURCE_LABEL[lastResult.source]} ({lastResult.horrorCount} horror
              / {lastResult.kitschCount} kitsch)
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
