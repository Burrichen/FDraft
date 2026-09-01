"use client";

import { FileUp } from "lucide-react";
import { useRef, useState } from "react";
import {
  commitBackupImport,
  previewBackupFile,
  type BackupSummary,
} from "@/application/backup/import-backup";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useProfileContext } from "@/components/profiles/profile-provider";
import type { BackupV1 } from "@/domain/backup/backup-schema";
import { defaultIdGenerator } from "@/domain/shared/id";
import { SystemClock } from "@/domain/time/clock";
import { SCHEMA_VERSION } from "@/infrastructure/local-db/schema";

type Stage =
  | { kind: "idle" }
  | { kind: "error"; message: string }
  | { kind: "ready"; backup: BackupV1; summary: BackupSummary }
  | { kind: "importing" }
  | { kind: "done"; profileId: string };

/**
 * "Copy Test Data From FDraft" (see docs/updates, "EVENT STUDIO — PHASE
 * 2" §4) — FDraft (Dev) mounts its own separate database (see `(app)/
 * layout.tsx`'s `STUDIO_DATABASE_NAME`), so it starts genuinely empty;
 * this is the safe, explicit way to bring in real data for testing.
 *
 * Deliberately reuses the EXACT SAME mechanism `ImportBackupFlow`
 * (Settings' normal backup import) already uses — a plain
 * `<input type="file">` read via the File API, then
 * `previewBackupFile`/`commitBackupImport` — rather than any direct
 * database-to-database coupling between the two apps' separate Dexie
 * instances (there is no code path anywhere that opens BOTH databases at
 * once). This ALWAYS imports as a brand-new profile — never
 * "replace" — so it is a genuine COPY: normal FDraft's real database is
 * never opened, read, or touched by this component at all; the developer
 * exports a backup from normal FDraft first (its own existing Settings ->
 * Data & Backups -> Export), then imports that file here. Requires an
 * explicit confirmation step before committing, even though this mode is
 * non-destructive, since it still creates new local data.
 */
export function CopyTestDataSection() {
  const { repositories, refreshProfiles } = useProfileContext();
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

  async function handleConfirmCopy(backup: BackupV1) {
    setStage({ kind: "importing" });
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
      setStage({ kind: "done", profileId: result.profileId });
    } catch (cause) {
      setStage({
        kind: "error",
        message: cause instanceof Error ? cause.message : "Import failed.",
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Copy Test Data From FDraft (Dev-only)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          FDraft (Dev) uses its own separate, empty data — it never touches your
          real FDraft data automatically. To bring in real data for testing:
          open normal FDraft → Settings → Data &amp; Backups → Export FDraft
          Backup, then import that file here. This always creates a brand-new
          profile — never replaces anything, and never reads from normal
          FDraft&apos;s data directly.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".fdraft,.json,application/json"
          className="hidden"
          onChange={(event) => void handleFileChosen(event)}
        />

        {stage.kind === "idle" || stage.kind === "error" ? (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileUp aria-hidden="true" />
              Import Test Data (.fdraft backup)
            </Button>
            {stage.kind === "error" ? (
              <Alert variant="destructive">
                <AlertDescription>{stage.message}</AlertDescription>
              </Alert>
            ) : null}
          </>
        ) : null}

        {stage.kind === "ready" ? (
          <div className="space-y-3">
            <p className="text-sm">
              Found a backup for profile{" "}
              <strong>{stage.summary.displayName}</strong> —{" "}
              {stage.summary.watchlistCount} watchlist entries,{" "}
              {stage.summary.watchedFilmsCount} watched films,{" "}
              {stage.summary.draftsCount} drafts.
            </p>
            <div className="flex gap-2">
              <AlertDialog>
                <AlertDialogTrigger render={<Button type="button" />}>
                  Copy as New Profile
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Copy this test data in?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This creates a brand-new profile in FDraft (Dev)
                      containing a copy of this backup&apos;s data. Your real
                      FDraft install is never modified.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => void handleConfirmCopy(stage.backup)}
                    >
                      Copy Test Data
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button type="button" variant="ghost" onClick={reset}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {stage.kind === "importing" ? (
          <p className="text-muted-foreground text-sm">Copying…</p>
        ) : null}

        {stage.kind === "done" ? (
          <div className="space-y-2">
            <Alert>
              <AlertDescription>
                Test data copied into a new profile.
              </AlertDescription>
            </Alert>
            <Button type="button" variant="outline" size="sm" onClick={reset}>
              Import Another Backup
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
