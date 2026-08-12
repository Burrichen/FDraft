"use client";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Progress,
  ProgressIndicator,
  ProgressTrack,
} from "@/components/ui/progress";
import { useUpdateContext } from "./update-provider";

/**
 * The one place the update flow's phases (see `update-provider.tsx`'s
 * `UpdateState`) become UI — mounted once in `AppShell` so it can appear
 * over any page. Only ever open for `available`/`downloading`/
 * `ready-to-restart`; `idle`/`checking`/`error` render nothing, since a
 * failed or in-progress *check* is not something to interrupt the user
 * for (see docs/product-spec.md, "CHECK FREQUENCY" and "UPDATE
 * PHILOSOPHY": "no update -> nothing intrusive happens").
 */
export function UpdateDialog() {
  const { state, installUpdate, dismiss, restartNow, restartLater } =
    useUpdateContext();

  const open =
    state.phase === "available" ||
    state.phase === "downloading" ||
    state.phase === "ready-to-restart";

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
    >
      <AlertDialogContent>
        {state.phase === "available" ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>New FDraft Update Available</AlertDialogTitle>
              <AlertDialogDescription>
                Version {state.info.version}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {state.info.releaseNotes ? (
              <p className="text-muted-foreground max-h-40 overflow-y-auto text-sm whitespace-pre-line">
                {state.info.releaseNotes}
              </p>
            ) : null}
            <AlertDialogFooter>
              <AlertDialogCancel>Later</AlertDialogCancel>
              <Button type="button" onClick={() => void installUpdate()}>
                Update FDraft
              </Button>
            </AlertDialogFooter>
          </>
        ) : null}

        {state.phase === "downloading" ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Downloading update…</AlertDialogTitle>
              <AlertDialogDescription>
                Please don&apos;t close FDraft while this finishes.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2">
              {state.progress?.phase === "progress" &&
              state.progress.percent !== null ? (
                <>
                  <Progress value={state.progress.percent}>
                    <ProgressTrack>
                      <ProgressIndicator />
                    </ProgressTrack>
                  </Progress>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    {state.progress.percent}%
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground text-sm">Please wait…</p>
              )}
            </div>
          </>
        ) : null}

        {state.phase === "ready-to-restart" ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>FDraft has been updated.</AlertDialogTitle>
              <AlertDialogDescription>
                Restart to finish installing the update.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={restartLater}>
                Restart Later
              </AlertDialogCancel>
              <Button type="button" onClick={() => void restartNow()}>
                Restart FDraft
              </Button>
            </AlertDialogFooter>
          </>
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  );
}
