"use client";

import { formatDistanceToNow } from "date-fns";
import { Download, FileJson } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  buildProfileBackup,
  getLastBackupExportedAt,
  recordBackupExported,
  serializeBackupCompact,
  serializeBackupReadable,
  suggestBackupFilename,
} from "@/application/backup/export-backup";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { useAsyncData } from "@/hooks/use-async-data";
import { downloadTextFile } from "@/lib/download-file";
import { ImportBackupFlow } from "./import-backup-flow";

/** Backups older than this trigger the quiet "it's been a while" note — see docs/product-spec.md, "OPTIONAL AUTO-BACKUP REMINDER": "Keep this simple. Do not nag the user constantly." One line of text on a page the user opens deliberately, never a popup or a repeated toast. */
const BACKUP_REMINDER_THRESHOLD_DAYS = 30;

function describeLastBackup(lastBackupAt: string | null): string {
  if (!lastBackupAt) return "Never";
  return formatDistanceToNow(new Date(lastBackupAt), { addSuffix: true });
}

interface BackupStatus {
  lastBackupAt: string | null;
  /** Computed once, at fetch time (an effect, not render) — components must stay pure, so "how long ago" is resolved here rather than by calling `Date.now()` during render. */
  showReminder: boolean;
}

/**
 * "DATA & BACKUPS" — see docs/product-spec.md, "EXPORT UX" (Prompt 9.5C).
 * The complete replacement for cloud-account portability: a full local
 * profile in, a single downloadable file out, entirely offline. Export
 * only ever reads (`buildProfileBackup`) and writes to the browser's own
 * download mechanism (`downloadTextFile`) — no network request is made by
 * anything in this component.
 */
export function DataBackupSection() {
  const { activeProfile, repositories } = useProfileContext();
  const [isExporting, setIsExporting] = useState(false);

  const {
    data: backupStatus,
    error: backupStatusError,
    reload,
  } = useAsyncData<BackupStatus>(async () => {
    if (!activeProfile) return { lastBackupAt: null, showReminder: false };
    const lastBackupAt = await getLastBackupExportedAt(
      repositories,
      activeProfile.id,
    );
    const daysSince = lastBackupAt
      ? (Date.now() - new Date(lastBackupAt).getTime()) / (1000 * 60 * 60 * 24)
      : null;
    return {
      lastBackupAt,
      showReminder:
        daysSince === null || daysSince > BACKUP_REMINDER_THRESHOLD_DAYS,
    };
  }, [activeProfile?.id, repositories]);

  async function handleExport(variant: "backup" | "readable") {
    if (!activeProfile) return;
    setIsExporting(true);
    try {
      const backup = await buildProfileBackup(repositories, activeProfile.id);
      if (variant === "backup") {
        downloadTextFile(
          suggestBackupFilename(activeProfile),
          serializeBackupCompact(backup),
        );
      } else {
        downloadTextFile(
          suggestBackupFilename(activeProfile, undefined, "json"),
          serializeBackupReadable(backup),
          "application/json",
        );
      }
      await recordBackupExported(repositories, activeProfile.id);
      reload();
      toast.success(
        variant === "backup" ? "Backup exported." : "Readable JSON exported.",
      );
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not export a backup.",
      );
    } finally {
      setIsExporting(false);
    }
  }

  if (!activeProfile) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardDescription>
          FDraft stores your data on this device. Export a backup if you want to
          move your profile to another device, or to protect it from browser or
          site-data deletion.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-muted-foreground text-xs">Profile</dt>
            <dd className="text-foreground">{activeProfile.displayName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Last backup</dt>
            <dd className="text-foreground">
              {backupStatusError ? (
                <span className="text-destructive inline-flex items-center gap-1.5">
                  Couldn&apos;t check
                  <button
                    type="button"
                    onClick={reload}
                    className="focus-visible:outline-ring underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    Retry
                  </button>
                </span>
              ) : (
                describeLastBackup(backupStatus?.lastBackupAt ?? null)
              )}
            </dd>
          </div>
        </dl>

        {backupStatus?.showReminder ? (
          <p className="text-watchlist-orange text-xs">
            It&apos;s been a while since your last backup. Exporting one takes a
            few seconds and keeps your watchlist, drafts, and history safe if
            this device is lost or reset.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={isExporting}
            onClick={() => handleExport("backup")}
          >
            <Download aria-hidden="true" />
            {isExporting ? "Exporting…" : "Export FDraft Backup"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={isExporting}
            onClick={() => handleExport("readable")}
          >
            <FileJson aria-hidden="true" />
            Export Readable JSON
          </Button>
        </div>

        <div className="border-t pt-4">
          <ImportBackupFlow onImported={reload} />
        </div>

        <p className="text-muted-foreground text-xs">
          Your FDraft backup is created on this device. It is not uploaded
          anywhere by FDraft, and backup generation works fully offline.
        </p>
      </CardContent>
    </Card>
  );
}
