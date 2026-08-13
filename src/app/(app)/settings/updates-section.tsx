"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { isDesktopRuntime } from "@/infrastructure/tauri/desktop-runtime";
import { useUpdateContext } from "@/components/updates/update-provider";

/**
 * The Settings page's "UPDATES" section (see docs/product-spec.md,
 * "UPDATE SETTING") — renders nothing on the web build, since there is no
 * updater to configure there. The auto-check toggle and "Current version"
 * are installation-level, not profile-level (see
 * `update-preference-store.ts`'s doc comment), so this section is the same
 * regardless of which local profile is active.
 */
export function UpdatesSection() {
  const {
    state,
    currentVersion,
    autoCheckEnabled,
    setAutoCheckEnabled,
    checkNow,
  } = useUpdateContext();

  if (!isDesktopRuntime()) {
    return null;
  }

  async function handleCheckNow() {
    await checkNow();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Updates</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Label
            htmlFor="auto-check-updates"
            className="text-foreground text-sm"
          >
            Automatically check for updates
          </Label>
          <input
            id="auto-check-updates"
            type="checkbox"
            checked={autoCheckEnabled}
            onChange={(event) => setAutoCheckEnabled(event.target.checked)}
            className="border-border accent-primary focus-visible:outline-ring size-4 rounded border focus-visible:outline-2 focus-visible:outline-offset-2"
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground text-sm">Current version</span>
          <span className="text-foreground text-sm tabular-nums">
            {currentVersion ?? "—"}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleCheckNow()}
            disabled={state.phase === "checking"}
          >
            {state.phase === "checking" ? "Checking…" : "Check for Updates"}
          </Button>
          {state.phase === "idle" ? (
            <span className="text-muted-foreground text-sm">
              You&apos;re on the latest version.
            </span>
          ) : null}
          {state.phase === "error" ? (
            <span className="text-destructive text-sm">
              Couldn&apos;t check for updates — {state.message}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
