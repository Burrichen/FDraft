"use client";

import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { importLocalWatchlistCsv } from "@/application/import/local-import-service";
import { readImportFile } from "@/application/import/read-import-file";
import { useProfileContext } from "@/components/profiles/profile-provider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Stage =
  | { kind: "idle" }
  | { kind: "error"; message: string }
  | { kind: "ready"; file: File }
  | { kind: "importing" }
  | { kind: "done"; filmsRemoved: number; filmsImported: number };

/**
 * "Re-import Letterboxd Watchlist" (see docs/updates, v1.1.2) — lets the
 * active profile replace their current watchlist MEMBERSHIP with a newer
 * Letterboxd export, for when films were added/removed on Letterboxd
 * itself since the last import. Reuses the exact same file-reading
 * (`readImportFile`) and import pipeline (`importLocalWatchlistCsv`,
 * `mode: "replace"`) the normal Watchlist import page uses — no separate
 * CSV parsing/matching logic. Only watchlist membership is touched: watched
 * history, ratings, draft history, and profile settings are never read or
 * written by the replace pass (see `importLocalWatchlistCsv`'s doc
 * comment), and nothing is written at all unless the user explicitly
 * confirms the destructive `AlertDialog` — cancelling or closing it leaves
 * the current watchlist completely untouched.
 */
export function ReimportWatchlistSection() {
  const { activeProfile, repositories } = useProfileContext();
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStage({ kind: "idle" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setStage({ kind: "ready", file });
  }

  async function handleConfirmReplace(file: File) {
    if (!activeProfile) return;
    setStage({ kind: "importing" });
    try {
      const read = await readImportFile(file);
      if (!read.ok) {
        setStage({ kind: "error", message: read.error });
        return;
      }
      const outcome = await importLocalWatchlistCsv(repositories, {
        profileId: activeProfile.id,
        rawFilename: file.name,
        source: read.source,
        mode: "replace",
        ...read.files,
      });
      if (!outcome.ok) {
        setStage({ kind: "error", message: outcome.error });
        return;
      }
      setStage({
        kind: "done",
        filmsRemoved: outcome.filmsRemoved,
        filmsImported: outcome.filmsImported,
      });
      toast.success("Watchlist replaced.");
    } catch (cause) {
      setStage({
        kind: "error",
        message: cause instanceof Error ? cause.message : "Import failed.",
      });
    }
  }

  if (!activeProfile) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Re-import Letterboxd Watchlist
        </CardTitle>
        <CardDescription>
          Bring in a newer Letterboxd export and make it your active watchlist —
          for when you&apos;ve added or removed films on Letterboxd since your
          last import.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {stage.kind === "done" ? (
          <Alert className="border-watchlist-green/40">
            <CheckCircle2
              aria-hidden="true"
              className="text-watchlist-green size-4"
            />
            <AlertDescription>
              Replaced &quot;{activeProfile.displayName}&quot;&apos;s watchlist
              — {stage.filmsImported} film
              {stage.filmsImported === 1 ? "" : "s"} added/updated,{" "}
              {stage.filmsRemoved} removed. Your watched history, ratings,
              drafts, and settings are unchanged.
            </AlertDescription>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={reset}
            >
              Import another file
            </Button>
          </Alert>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={stage.kind === "importing"}
                onClick={() => fileInputRef.current?.click()}
              >
                <RefreshCw aria-hidden="true" />
                Choose Letterboxd Export
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.zip"
                className="hidden"
                onChange={handleFileChosen}
              />
            </div>

            {stage.kind === "error" ? (
              <Alert variant="destructive" role="alert">
                <AlertTriangle aria-hidden="true" className="size-4" />
                <AlertDescription>{stage.message}</AlertDescription>
              </Alert>
            ) : null}

            {stage.kind === "ready" || stage.kind === "importing" ? (
              <div className="border-border bg-muted/40 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                <span className="text-foreground break-all">
                  {stage.kind === "ready" ? stage.file.name : "Importing…"}
                </span>
                <AlertDialog>
                  <AlertDialogTrigger
                    render={
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={stage.kind === "importing"}
                      />
                    }
                  >
                    Replace Watchlist
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Replace your current watchlist?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This will replace your currently imported watchlist with
                        the contents of this file — any active watchlist entry
                        not in this export will be removed. Your watched
                        history, ratings, draft history, and profile settings
                        are never affected. If this import fails or you cancel,
                        your current watchlist stays exactly as it is.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() =>
                          stage.kind === "ready" &&
                          void handleConfirmReplace(stage.file)
                        }
                      >
                        Replace permanently
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ) : null}

            <p className="text-muted-foreground text-xs">
              Everything is processed locally on this device — your file is
              never uploaded anywhere.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
