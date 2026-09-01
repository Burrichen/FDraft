"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { useAsyncData } from "@/hooks/use-async-data";
import {
  addStudioRevision,
  getStudioRevisions,
} from "@/application/event-studio/studio-revisions-store";
import { downloadThemeFile } from "@/application/event-studio/theme-download";
import { loadCanonicalEventTheme } from "@/application/event-themes/load-canonical-event-theme";
import {
  buildThemeExportFilename,
  extractPageScopedTheme,
} from "@/domain/event-studio/theme-export-scope";
import {
  resetBreakpointToCanonical,
  resetEntireThemeToCanonical,
  resetPageToCanonical,
} from "@/domain/event-studio/theme-reset-scope";
import { mergePageScopedImport } from "@/domain/event-studio/theme-import-merge";
import {
  validateThemeForExport,
  type ThemeValidationResult,
} from "@/domain/event-studio/theme-export-validation";
import {
  formatAssetValidationLine,
  missingRequiredAssets,
  validateThemeAssetsAgainstWorkspace,
  type AssetValidationEntry,
} from "@/domain/event-studio/theme-asset-validation";
import {
  checkEventArtWorkspaceAssetPaths,
  readCanonicalThemeFile,
  writeCanonicalThemeFile,
} from "@/infrastructure/tauri/event-art-workspace";
import {
  parseFDraftThemeText,
  type FDraftThemeBreakpointId,
  type FDraftThemeFile,
} from "@/domain/event-themes/fdraft-theme-schema";
import type { StudioPageId } from "@/domain/event-studio/studio-pages";
import type { Repositories } from "@/repositories";

export interface StudioFilePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileId: string | null;
  repositories: Repositories;
  presetId: string;
  presetLabel: string;
  pageId: StudioPageId;
  pageLabel: string;
  stateId: string;
  breakpointId: FDraftThemeBreakpointId;
  breakpointLabel: string;
  theme: FDraftThemeFile | null;
  workspacePath: string | null;
  /** Every action here commits into the SAME undoable history every other edit uses — see `studio-page-client.tsx`'s own `undoableTheme.commit`. */
  onCommitTheme: (theme: FDraftThemeFile) => void;
}

/**
 * The "Studio File" panel (see docs/updates, "EVENT STUDIO — PHASE 6") —
 * Revisions, the three explicit Reset levels (§5, "rather than one
 * ambiguous destructive button"), Import (§6), and Export (§7/§8/§12/§13)
 * all live here rather than further crowding the already-dense main
 * toolbar (Save/Load stay there — see `studio-page-client.tsx` — since
 * those are quick, frequent actions; everything here is a deliberate,
 * occasional one).
 */
export function StudioFilePanel({
  open,
  onOpenChange,
  profileId,
  repositories,
  presetId,
  presetLabel,
  pageId,
  pageLabel,
  stateId,
  breakpointId,
  breakpointLabel,
  theme,
  workspacePath,
  onCommitTheme,
}: StudioFilePanelProps) {
  const revisionsQuery = useAsyncData(async () => {
    if (!profileId) return [];
    return getStudioRevisions(repositories, profileId, presetId);
  }, [profileId, repositories, presetId, open]);

  const [confirmResetEvent, setConfirmResetEvent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  async function fetchCanonicalTheme(): Promise<FDraftThemeFile | null> {
    const result = await loadCanonicalEventTheme(presetId);
    return result.ok ? result.theme : null;
  }

  async function handleResetPage() {
    if (!theme) return;
    setResetError(null);
    const canonical = await fetchCanonicalTheme();
    if (!canonical) {
      setResetError("No canonical bundled theme found for this preset.");
      return;
    }
    onCommitTheme(resetPageToCanonical(theme, canonical, pageId));
  }

  async function handleResetBreakpoint() {
    if (!theme) return;
    setResetError(null);
    const canonical = await fetchCanonicalTheme();
    if (!canonical) {
      setResetError("No canonical bundled theme found for this preset.");
      return;
    }
    onCommitTheme(
      resetBreakpointToCanonical(
        theme,
        canonical,
        pageId,
        stateId,
        breakpointId,
      ),
    );
  }

  async function handleResetEntireEvent() {
    setConfirmResetEvent(false);
    setResetError(null);
    const canonical = await fetchCanonicalTheme();
    if (!canonical) {
      setResetError("No canonical bundled theme found for this preset.");
      return;
    }
    onCommitTheme(resetEntireThemeToCanonical(canonical));
  }

  async function handleRestoreRevision(revisionTheme: FDraftThemeFile) {
    onCommitTheme(revisionTheme);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Studio File</SheetTitle>
          <SheetDescription>
            {presetLabel} — {pageLabel}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-4 pb-4">
          <RevisionsSection
            revisions={revisionsQuery.data ?? []}
            loading={revisionsQuery.isLoading}
            disabled={!theme}
            onRestore={(revision) => void handleRestoreRevision(revision.theme)}
          />

          <Separator />

          <section className="space-y-2">
            <h3 className="text-foreground text-sm font-semibold">Reset</h3>
            <p className="text-muted-foreground text-xs">
              Restores canonical bundled data at the scope you choose. Nothing
              outside that scope is touched.
            </p>
            <div className="flex flex-col gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!theme}
                onClick={() => void handleResetPage()}
              >
                Reset Current Page ({pageLabel})
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!theme}
                onClick={() => void handleResetBreakpoint()}
              >
                Reset Current Breakpoint ({breakpointLabel})
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={!theme}
                onClick={() => setConfirmResetEvent(true)}
              >
                Reset Entire Event/Preset…
              </Button>
            </div>
            {resetError ? (
              <p className="text-destructive text-xs" role="alert">
                {resetError}
              </p>
            ) : null}
          </section>

          <Separator />

          <ImportSection
            theme={theme}
            pageId={pageId}
            pageLabel={pageLabel}
            onCommitTheme={onCommitTheme}
          />

          <Separator />

          <ExportSection
            profileId={profileId}
            repositories={repositories}
            presetId={presetId}
            presetLabel={presetLabel}
            pageId={pageId}
            pageLabel={pageLabel}
            theme={theme}
            workspacePath={workspacePath}
            onExportedToRepo={() => revisionsQuery.reload()}
          />
        </div>
      </SheetContent>

      <AlertDialog open={confirmResetEvent} onOpenChange={setConfirmResetEvent}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset the entire Event/Preset?</AlertDialogTitle>
            <AlertDialogDescription>
              Every page, state, and breakpoint you&apos;ve edited for{" "}
              {presetLabel} will be replaced with the canonical bundled version.
              You can still Undo right after if this was a mistake.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleResetEntireEvent()}>
              Reset everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}

interface StudioRevisionLike {
  id: string;
  label: string;
  theme: FDraftThemeFile;
  createdAt: string;
}

function RevisionsSection({
  revisions,
  loading,
  disabled,
  onRestore,
}: {
  revisions: StudioRevisionLike[];
  loading: boolean;
  disabled: boolean;
  onRestore: (revision: StudioRevisionLike) => void;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-foreground text-sm font-semibold">Revisions</h3>
      <p className="text-muted-foreground text-xs">
        A short history of Saves for this preset — not Git, just the last few
        checkpoints.
      </p>
      {loading ? (
        <p className="text-muted-foreground text-xs">Loading…</p>
      ) : revisions.length === 0 ? (
        <p className="text-muted-foreground text-xs">No revisions yet.</p>
      ) : (
        <ul className="space-y-1">
          {revisions.map((revision) => (
            <li
              key={revision.id}
              className="border-border flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-xs"
            >
              <span className="text-foreground">{revision.label}</span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={disabled}
                onClick={() => onRestore(revision)}
              >
                Restore
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ImportSection({
  theme,
  pageId,
  pageLabel,
  onCommitTheme,
}: {
  theme: FDraftThemeFile | null;
  pageId: StudioPageId;
  pageLabel: string;
  onCommitTheme: (theme: FDraftThemeFile) => void;
}) {
  const [imported, setImported] = useState<FDraftThemeFile | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [confirmPageMerge, setConfirmPageMerge] = useState(false);
  const [pageMergeUnavailable, setPageMergeUnavailable] = useState(false);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImportError(null);
    setImported(null);
    setPageMergeUnavailable(false);
    const text = await file.text();
    const result = parseFDraftThemeText(text);
    if (!result.ok) {
      setImportError(result.message);
      return;
    }
    setImported(result.theme);
  }

  function applyReplace() {
    if (!imported) return;
    setConfirmReplace(false);
    onCommitTheme(imported);
    setImported(null);
  }

  function applyPageMerge() {
    if (!imported || !theme) return;
    setConfirmPageMerge(false);
    const merged = mergePageScopedImport(theme, imported, pageId);
    if (!merged) {
      setPageMergeUnavailable(true);
      return;
    }
    onCommitTheme(merged);
    setImported(null);
  }

  return (
    <section className="space-y-2">
      <h3 className="text-foreground text-sm font-semibold">Import</h3>
      <p className="text-muted-foreground text-xs">
        A validated <code>.fdraft-theme</code> file — the exact same schema
        production uses. Nothing here is trusted as executable content.
      </p>
      <input
        type="file"
        accept=".fdraft-theme"
        aria-label="Import .fdraft-theme file"
        onChange={(event) => void handleFileChange(event)}
        className="text-muted-foreground text-xs"
      />
      {importError ? (
        <p className="text-destructive text-xs" role="alert">
          {importError}
        </p>
      ) : null}
      {imported ? (
        <div className="border-border space-y-2 rounded border p-2">
          <p className="text-foreground text-xs">
            <strong>{imported.themeId}</strong> — schema v
            {imported.schemaVersion}, {Object.keys(imported.layouts).length}{" "}
            page(s), {Object.keys(imported.assets).length} asset(s) registered.
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => setConfirmPageMerge(true)}
              disabled={!theme}
            >
              Import into current page ({pageLabel}) only
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="xs"
              onClick={() => setConfirmReplace(true)}
            >
              Replace entire preset
            </Button>
          </div>
          {pageMergeUnavailable ? (
            <p className="text-muted-foreground text-xs" role="alert">
              This file has no layout for the current page — nothing to import
              at that scope.
            </p>
          ) : null}
        </div>
      ) : null}

      <AlertDialog open={confirmReplace} onOpenChange={setConfirmReplace}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace the entire preset?</AlertDialogTitle>
            <AlertDialogDescription>
              This replaces every page/state/breakpoint currently in the editor
              with the imported file&apos;s content. Your current unsaved
              changes will be lost unless you Undo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={applyReplace}>
              Replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmPageMerge} onOpenChange={setConfirmPageMerge}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Import into &ldquo;{pageLabel}&rdquo; only?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This replaces just the current page&apos;s layout with the
              imported file&apos;s version of that page. Every other page stays
              exactly as it is.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={applyPageMerge}>
              Import page
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

interface ExportPreview {
  scope: "page" | "event";
  filename: string;
  theme: FDraftThemeFile;
  validation: ThemeValidationResult;
  assetEntries: AssetValidationEntry[];
  checkingAssets: boolean;
}

function ExportSection({
  profileId,
  repositories,
  presetId,
  presetLabel,
  pageId,
  pageLabel,
  theme,
  workspacePath,
  onExportedToRepo,
}: {
  profileId: string | null;
  repositories: Repositories;
  presetId: string;
  presetLabel: string;
  pageId: StudioPageId;
  pageLabel: string;
  theme: FDraftThemeFile | null;
  workspacePath: string | null;
  onExportedToRepo: () => void;
}) {
  const [preview, setPreview] = useState<ExportPreview | null>(null);
  const [repoExport, setRepoExport] = useState<
    | { kind: "idle" }
    | { kind: "invalid"; validation: ThemeValidationResult }
    | { kind: "missing-assets"; missing: AssetValidationEntry[] }
    | { kind: "confirm"; existingContent: string | null }
    | { kind: "exporting" }
    | { kind: "done" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function preparePreview(scope: "page" | "event") {
    if (!theme) return;
    const scopedTheme =
      scope === "page" ? extractPageScopedTheme(theme, pageId) : theme;
    const filename = buildThemeExportFilename(
      presetLabel,
      scope === "page" ? pageLabel : undefined,
    );
    const validation = validateThemeForExport(scopedTheme);
    setPreview({
      scope,
      filename,
      theme: scopedTheme,
      validation,
      assetEntries: [],
      checkingAssets: Boolean(workspacePath),
    });
    if (workspacePath) {
      const assetEntries = await validateThemeAssetsAgainstWorkspace(
        scopedTheme,
        workspacePath,
        checkEventArtWorkspaceAssetPaths,
      );
      setPreview((current) =>
        current && current.scope === scope
          ? { ...current, assetEntries, checkingAssets: false }
          : current,
      );
    }
  }

  function downloadPreview() {
    if (!preview) return;
    downloadThemeFile(preview.theme, preview.filename);
    setPreview(null);
  }

  async function beginRepoExport() {
    if (!theme || !workspacePath) return;
    const validation = validateThemeForExport(theme);
    if (!validation.ok) {
      setRepoExport({ kind: "invalid", validation });
      return;
    }
    const assetEntries = await validateThemeAssetsAgainstWorkspace(
      theme,
      workspacePath,
      checkEventArtWorkspaceAssetPaths,
    );
    const missing = missingRequiredAssets(assetEntries);
    if (missing.length > 0) {
      setRepoExport({ kind: "missing-assets", missing });
      return;
    }
    const existingContent = await readCanonicalThemeFile(
      workspacePath,
      theme.themeId,
    );
    setRepoExport({ kind: "confirm", existingContent });
  }

  async function proceedDespiteMissingAssets() {
    if (!theme || !workspacePath) return;
    const existingContent = await readCanonicalThemeFile(
      workspacePath,
      theme.themeId,
    );
    setRepoExport({ kind: "confirm", existingContent });
  }

  async function performRepoExport() {
    if (!theme || !workspacePath || repoExport.kind !== "confirm") return;
    setRepoExport({ kind: "exporting" });
    if (repoExport.existingContent && profileId) {
      const parsedExisting = parseFDraftThemeText(repoExport.existingContent);
      if (parsedExisting.ok) {
        await addStudioRevision(
          repositories,
          profileId,
          presetId,
          parsedExisting.theme,
          "Backup before repo export",
        );
        onExportedToRepo();
      }
    }
    const result = await writeCanonicalThemeFile(
      workspacePath,
      theme.themeId,
      JSON.stringify(theme, null, 2),
    );
    setRepoExport(
      result.ok ? { kind: "done" } : { kind: "error", message: result.error },
    );
  }

  return (
    <section className="space-y-2">
      <h3 className="text-foreground text-sm font-semibold">Export</h3>
      <div className="flex flex-wrap gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!theme}
          onClick={() => void preparePreview("page")}
        >
          Export Current Page…
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!theme}
          onClick={() => void preparePreview("event")}
        >
          Export Entire Event/Preset…
        </Button>
      </div>

      {preview ? (
        <ExportPreviewCard
          preview={preview}
          onDownload={downloadPreview}
          onCancel={() => setPreview(null)}
        />
      ) : null}

      {workspacePath ? (
        <div className="border-border space-y-2 border-t pt-2">
          <p className="text-muted-foreground text-xs">
            A connected Event Art Workspace lets you write straight to the
            canonical theme file.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!theme}
            onClick={() => void beginRepoExport()}
          >
            Export to FDraft Repo
          </Button>
          {repoExport.kind === "invalid" ? (
            <p className="text-destructive text-xs" role="alert">
              Not ready to export — {repoExport.validation.issues[0]?.message}
            </p>
          ) : null}
          {repoExport.kind === "missing-assets" ? (
            <div className="space-y-1">
              <p className="text-destructive text-xs" role="alert">
                Missing required assets:
              </p>
              <ul className="text-xs">
                {repoExport.missing.map((entry) => (
                  <li key={entry.assetId}>
                    {formatAssetValidationLine(entry)}
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => void proceedDespiteMissingAssets()}
              >
                Export anyway despite missing assets
              </Button>
            </div>
          ) : null}
          {repoExport.kind === "done" ? (
            <p className="text-foreground text-xs">
              <span aria-hidden="true">✓</span> Exported to the repo.
            </p>
          ) : null}
          {repoExport.kind === "error" ? (
            <p className="text-destructive text-xs" role="alert">
              {repoExport.message}
            </p>
          ) : null}
        </div>
      ) : null}

      <AlertDialog
        open={repoExport.kind === "confirm"}
        onOpenChange={(next) => {
          if (!next) setRepoExport({ kind: "idle" });
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {repoExport.kind === "confirm" && repoExport.existingContent
                ? "Overwrite the existing canonical theme?"
                : "Write the canonical theme?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {repoExport.kind === "confirm" && repoExport.existingContent
                ? "A backup revision of the current file is created first. This does not commit or push anything to Git."
                : "This writes public/event-themes/ directly in your connected workspace. This does not commit or push anything to Git."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void performRepoExport()}>
              Export
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function ExportPreviewCard({
  preview,
  onDownload,
  onCancel,
}: {
  preview: ExportPreview;
  onDownload: () => void;
  onCancel: () => void;
}) {
  const missing = missingRequiredAssets(preview.assetEntries);
  return (
    <div className="border-border space-y-2 rounded border p-2">
      <p className="text-foreground text-xs font-medium">{preview.filename}</p>
      {preview.validation.ok ? (
        <Alert>
          <AlertTitle className="text-xs">
            <span aria-hidden="true">✓</span> Ready to export
          </AlertTitle>
        </Alert>
      ) : (
        <Alert variant="destructive">
          <AlertTitle className="text-xs">Not ready to export</AlertTitle>
          <AlertDescription>
            <ul className="text-xs">
              {preview.validation.issues.map((issue) => (
                <li key={issue.path}>
                  {issue.path}: {issue.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {preview.checkingAssets ? (
        <p className="text-muted-foreground text-xs">Checking assets…</p>
      ) : preview.assetEntries.length > 0 ? (
        <ul className="text-xs">
          {preview.assetEntries.map((entry) => (
            <li key={entry.assetId}>{formatAssetValidationLine(entry)}</li>
          ))}
        </ul>
      ) : null}
      {missing.length > 0 ? (
        <p className="text-muted-foreground text-xs">
          Some referenced assets aren&apos;t in the connected workspace — the
          file will still export for sharing/archiving.
        </p>
      ) : null}
      <div className="flex gap-1.5">
        <Button
          type="button"
          size="xs"
          disabled={!preview.validation.ok}
          onClick={onDownload}
        >
          Download .fdraft-theme
        </Button>
        <Button type="button" variant="ghost" size="xs" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
