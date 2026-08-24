"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { isDesktopRuntime } from "@/infrastructure/tauri/desktop-runtime";
import { useUpdateContext } from "@/components/updates/update-provider";
import { PatchNotesSheet } from "./patch-notes-sheet";

/**
 * The Settings page's "UPDATES" section (see docs/product-spec.md,
 * "UPDATE SETTING"; docs/updates, "PATCH NOTES IN SETTINGS"). The
 * auto-check toggle, "Current version", and "Check for Updates" are
 * desktop-only — there is no updater to configure on the web build — but
 * "Patch notes" is plain static content and stays visible on both, so web
 * users can see what changed too.
 */
export function UpdatesSection() {
  const {
    state,
    currentVersion,
    autoCheckEnabled,
    setAutoCheckEnabled,
    startupPromptsEnabled,
    setStartupPromptsEnabled,
    checkNow,
  } = useUpdateContext();

  const desktop = isDesktopRuntime();

  async function handleCheckNow() {
    await checkNow();
  }

  return (
    <Card>
      <CardContent className="space-y-4">
        {desktop ? (
          <>
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
              <Label
                htmlFor="startup-update-prompts"
                className="text-foreground text-sm"
              >
                Show a popup when a new update is found automatically
              </Label>
              <input
                id="startup-update-prompts"
                type="checkbox"
                checked={startupPromptsEnabled}
                onChange={(event) =>
                  setStartupPromptsEnabled(event.target.checked)
                }
                className="border-border accent-primary focus-visible:outline-ring size-4 rounded border focus-visible:outline-2 focus-visible:outline-offset-2"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground text-sm">
                Current version
              </span>
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
          </>
        ) : null}

        <div className="flex items-center gap-3">
          <PatchNotesSheet />
        </div>
      </CardContent>
    </Card>
  );
}
