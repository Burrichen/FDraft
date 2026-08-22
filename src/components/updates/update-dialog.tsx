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
import { parseReleaseNotes } from "@/domain/updates/release-notes";
import { useUpdateContext } from "./update-provider";

/**
 * The one place the update flow's phases (see `update-provider.tsx`'s
 * `UpdateState`) become UI — mounted once in `AppShell` so it can appear
 * over any page. Only ever open for `available`/`downloading`/
 * `ready-to-restart`; `idle`/`checking`/`error` render nothing, since a
 * failed or in-progress *check* is not something to interrupt the user
 * for (see docs/product-spec.md, "CHECK FREQUENCY" and "UPDATE
 * PHILOSOPHY": "no update -> nothing intrusive happens").
 *
 * Sized wider than a plain confirmation `AlertDialog` (`sm:max-w-lg`
 * rather than the shared component's default `max-w-sm`) — this is the
 * one alert dialog in the app whose content is routinely a multi-line
 * changelog, not a one-sentence question (see docs/updates, v1.1.0,
 * "UPDATE POPUP FIXES": "modal is cramped").
 *
 * `available`'s title/notes come from `parseReleaseNotes` on the GitHub
 * release's own body text — the update's version isn't necessarily one
 * this (older) binary's own bundled `domain/updates/patch-notes.ts` has
 * ever heard of, so that's the only metadata source that can describe a
 * not-yet-installed version (see docs/updates, v1.0.3 "Now Updating").
 * `parseReleaseNotes` itself now also filters out the old generic
 * installer boilerplate a past release-workflow bug used to bake into
 * every release's notes (see that function's doc comment) — this
 * component only ever has to handle "title/notes present" vs "absent",
 * never "present but wrong", which is what makes the plain `? ... : ...`
 * fallbacks below sufficient for graceful degradation.
 *
 * `state.skippedReleases` (same phase) additionally lists any release in
 * between the installed version and this one — a one-click update always
 * installs the latest version directly regardless, but without this,
 * updating from e.g. v1.0.1 straight to v1.0.3 would never surface what
 * v1.0.2 itself changed (see "MULTI-VERSION UPDATE JUMPS").
 *
 * Footer layout: "Update Later"/"Update Now" are the two real choices,
 * kept together with "Update Now" visually primary; "Don't show me
 * again" is a deliberately quieter, separate line below rather than a
 * third button crowded into the same row — it only makes sense for
 * `source: "startup"` (offering to silence automatic popups mid a
 * MANUALLY-requested check the user just asked for would be a non
 * sequitur), so it's omitted entirely for a manual check.
 */
export function UpdateDialog() {
  const {
    state,
    installUpdate,
    dismiss,
    disableStartupPrompts,
    restartNow,
    restartLater,
  } = useUpdateContext();

  const open =
    state.phase === "available" ||
    state.phase === "downloading" ||
    state.phase === "ready-to-restart";

  const parsed =
    state.phase === "available"
      ? parseReleaseNotes(state.info.releaseNotes)
      : null;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
    >
      <AlertDialogContent className="sm:max-w-lg">
        {state.phase === "available" ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-lg">
                New Update Available: {state.info.version}
                {parsed?.title ? ` — ${parsed.title}` : ""}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {parsed?.notes
                  ? "Here's what's new:"
                  : "A new version of FDraft is ready to install."}
              </AlertDialogDescription>
            </AlertDialogHeader>

            {parsed?.notes || state.skippedReleases.length > 0 ? (
              <div className="border-border max-h-80 space-y-4 overflow-y-auto rounded-lg border p-4 text-sm">
                {parsed?.notes ? (
                  <p className="text-foreground whitespace-pre-line">
                    {parsed.notes}
                  </p>
                ) : null}
                {state.skippedReleases.length > 0 ? (
                  <div
                    className={
                      parsed?.notes
                        ? "border-border space-y-4 border-t pt-4"
                        : "space-y-4"
                    }
                  >
                    <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                      Also includes changes from
                    </p>
                    {state.skippedReleases.map((release) => (
                      <div key={release.version} className="space-y-1">
                        <p className="text-foreground font-medium">
                          v{release.version}
                          {release.title ? ` — ${release.title}` : ""}
                        </p>
                        {release.notes ? (
                          <p className="text-muted-foreground whitespace-pre-line">
                            {release.notes}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <AlertDialogFooter>
              <AlertDialogCancel>Update Later</AlertDialogCancel>
              <Button type="button" onClick={() => void installUpdate()}>
                Update Now
              </Button>
            </AlertDialogFooter>
            {state.source === "startup" ? (
              <div className="mt-3 flex justify-center sm:justify-end">
                <button
                  type="button"
                  onClick={disableStartupPrompts}
                  className="text-muted-foreground hover:text-foreground focus-visible:outline-ring text-xs underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  Don&apos;t tell me when to upgrade!
                </button>
              </div>
            ) : null}
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
