"use client";

import { format } from "date-fns";
import { AlertTriangle, CheckCircle2, FileUp } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { SCHEMA_VERSION } from "@/infrastructure/local-db/schema";
import {
  commitBackupImport,
  previewBackupFile,
  type BackupImportMode,
  type BackupSummary,
} from "@/application/backup/import-backup";
import { defaultIdGenerator } from "@/domain/shared/id";
import { SystemClock } from "@/domain/time/clock";
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
import type { BackupV1 } from "@/domain/backup/backup-schema";
import { downloadTextFile } from "./download-file";
import {
  serializeBackupCompact,
  suggestBackupFilename,
} from "@/application/backup/export-backup";

type Stage =
  | { kind: "idle" }
  | { kind: "error"; message: string }
  | { kind: "ready"; backup: BackupV1; summary: BackupSummary }
  | { kind: "importing"; mode: BackupImportMode }
  | { kind: "done"; mode: BackupImportMode; profileId: string };

/**
 * The full "choose a file -> summary -> pick a mode -> confirm -> result"
 * flow from docs/product-spec.md, "IMPORT UX"/"IMPORT MODES" (Prompt
 * 9.5C). Entirely local: the chosen file is read with the File API and
 * never leaves the browser (see `previewBackupFile`/`commitBackupImport`,
 * which only ever touch `Repositories`, never `fetch`).
 */
export function ImportBackupFlow({ onImported }: { onImported: () => void }) {
  const { activeProfile, repositories, switchToProfile, refreshProfiles } =
    useProfileContext();
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStage({ kind: "idle" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const result = previewBackupFile(text);
    if (!result.ok) {
      setStage({ kind: "error", message: result.message });
      return;
    }
    setStage({ kind: "ready", backup: result.backup, summary: result.summary });
  }

  async function handleImportAsNew(backup: BackupV1) {
    setStage({ kind: "importing", mode: "new_profile" });
    try {
      const result = await commitBackupImport(
        repositories,
        { backup, mode: "new_profile" },
        {
          idGenerator: defaultIdGenerator,
          clock: new SystemClock(),
          currentSchemaVersion: SCHEMA_VERSION,
        },
      );
      await refreshProfiles();
      setStage({
        kind: "done",
        mode: "new_profile",
        profileId: result.profileId,
      });
      onImported();
    } catch (cause) {
      setStage({
        kind: "error",
        message: cause instanceof Error ? cause.message : "Import failed.",
      });
    }
  }

  async function handleReplaceActive(backup: BackupV1) {
    if (!activeProfile) return;
    setStage({ kind: "importing", mode: "replace_profile" });
    try {
      const result = await commitBackupImport(
        repositories,
        { backup, mode: "replace_profile", targetProfileId: activeProfile.id },
        {
          idGenerator: defaultIdGenerator,
          clock: new SystemClock(),
          currentSchemaVersion: SCHEMA_VERSION,
        },
      );
      if (result.safetyBackup) {
        downloadTextFile(
          suggestBackupFilename({
            displayName: `Safety-${activeProfile.displayName}`,
          }),
          serializeBackupCompact(result.safetyBackup),
        );
        toast.success(
          "Saved a safety backup of your previous data before replacing it.",
        );
      }
      await switchToProfile(result.profileId);
      setStage({
        kind: "done",
        mode: "replace_profile",
        profileId: result.profileId,
      });
      onImported();
    } catch (cause) {
      setStage({
        kind: "error",
        message: cause instanceof Error ? cause.message : "Import failed.",
      });
    }
  }

  if (stage.kind === "done") {
    return (
      <Alert className="border-watchlist-green/40">
        <CheckCircle2
          aria-hidden="true"
          className="text-watchlist-green size-4"
        />
        <AlertDescription>
          {stage.mode === "new_profile"
            ? "Imported as a new profile. Switch to it from the Profiles list above."
            : "Replaced your active profile with this backup."}
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
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={stage.kind === "importing"}
          onClick={() => fileInputRef.current?.click()}
        >
          <FileUp aria-hidden="true" />
          Import FDraft Backup
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".fdraft,.json,application/json"
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
        <div className="border-border bg-muted/40 space-y-3 rounded-lg border p-3 text-sm">
          <p className="text-foreground font-medium">FDraft Backup Found</p>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs">Profile</dt>
              <dd className="text-foreground">
                {stage.kind === "ready" ? stage.summary.displayName : "…"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Exported</dt>
              <dd className="text-foreground">
                {stage.kind === "ready"
                  ? format(new Date(stage.summary.exportedAt), "d MMMM yyyy")
                  : "…"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Watchlist</dt>
              <dd className="text-foreground tabular-nums">
                {stage.kind === "ready"
                  ? stage.summary.watchlistCount.toLocaleString()
                  : "…"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Watched films</dt>
              <dd className="text-foreground tabular-nums">
                {stage.kind === "ready"
                  ? stage.summary.watchedFilmsCount.toLocaleString()
                  : "…"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Drafts</dt>
              <dd className="text-foreground tabular-nums">
                {stage.kind === "ready"
                  ? stage.summary.draftsCount.toLocaleString()
                  : "…"}
              </dd>
            </div>
          </dl>

          <p className="text-foreground text-sm font-medium">
            How should this backup be imported?
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              size="sm"
              disabled={stage.kind === "importing"}
              onClick={() =>
                stage.kind === "ready" && handleImportAsNew(stage.backup)
              }
            >
              {stage.kind === "importing" && stage.mode === "new_profile"
                ? "Importing…"
                : "Import as New Profile (Recommended)"}
            </Button>

            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={stage.kind === "importing" || !activeProfile}
                  />
                }
              >
                Replace Existing Profile
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Replace &quot;{activeProfile?.displayName}&quot; with this
                    backup?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently overwrites your currently active
                    profile&apos;s watchlist, drafts, history, and settings with
                    the contents of this backup. A safety backup of your current
                    data will be downloaded automatically before anything is
                    replaced. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() =>
                      stage.kind === "ready" &&
                      handleReplaceActive(stage.backup)
                    }
                  >
                    Replace permanently
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      ) : null}

      <p className="text-muted-foreground text-xs">
        Imported backups are processed locally on this device — nothing is
        uploaded anywhere.
      </p>
    </div>
  );
}
