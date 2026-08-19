"use client";

import { CheckCircle2, FileText, Upload } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { getImportMetadataStatus } from "@/application/metadata/local-metadata-service";
import { importLocalWatchlistCsv } from "@/application/import/local-import-service";
import { readImportFile } from "@/application/import/read-import-file";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface ImportResult {
  filmsImported: number;
  filmsUpdated: number;
  duplicatesSkipped: number;
  alreadyWatchedSkipped: number;
  unresolvedCount: number;
  metadataCached: number;
  metadataAwaitingDownload: number;
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground text-lg font-medium tabular-nums">
        {value}
      </dd>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Fully client-side and offline (see docs/product-spec.md, "FULL OFFLINE
 * CORE FUNCTIONALITY" — Prompt 9.5B: "Letterboxd import file parsing must
 * NOT upload the user's import to a remote server. Parse imported files
 * locally."). Reads the file with the File API and never sends its bytes
 * anywhere — parsing (`extractLetterboxdExportZip`, and `parseWatchlistCsv`
 * inside `importLocalWatchlistCsv`) and every write happen against the
 * local database only.
 *
 * Metadata enrichment is deliberately NOT triggered here — see
 * `local-metadata-service.ts` and the Settings page's "METADATA" section;
 * this view only reports what's already cached vs. awaiting a later,
 * explicit download, exactly the "Imported: 1,204 films / Metadata: 1,050
 * cached, 154 awaiting download" example in docs/product-spec.md.
 *
 * The drop zone (see docs/product-spec.md's UI-polish pass, "POLISH THE
 * FILE INPUT") is a real `<input type="file">`, not a fake — it's
 * stretched invisibly over the styled zone (`peer absolute inset-0
 * opacity-0`) so a click or drag anywhere in the visible card still lands
 * on the actual accessible control: same keyboard/focus/screen-reader
 * behavior as a plain file input, a custom look on top of it. Drag-and-drop
 * (`onDrop`) sets the same `selectedFile` state a normal pick does; the
 * input's own `.files` only reflects a picked-via-dialog file, which is
 * why the import itself always reads from `selectedFile`, never
 * `FormData`.
 */
export function ImportView() {
  const { activeProfile, repositories } = useProfileContext();
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  function handleFileChosen(file: File | null) {
    setError(null);
    setSelectedFile(file);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDraggingOver(false);
    const file = event.dataTransfer.files[0];
    if (file) handleFileChosen(file);
  }

  async function handleImport(event: React.FormEvent) {
    event.preventDefault();
    if (!activeProfile) return;

    const file = selectedFile;
    if (!file || file.size === 0) {
      setError(
        "Choose a Letterboxd watchlist.csv or full export .zip file to import.",
      );
      return;
    }

    setIsImporting(true);
    setError(null);
    try {
      const read = await readImportFile(file);
      if (!read.ok) {
        setError(read.error);
        return;
      }

      const outcome = await importLocalWatchlistCsv(repositories, {
        profileId: activeProfile.id,
        rawFilename: file.name,
        source: read.source,
        ...read.files,
      });

      if (!outcome.ok) {
        setError(outcome.error);
        return;
      }

      const metadataStatus = await getImportMetadataStatus(
        repositories,
        outcome.filmIds,
      );
      setResult({
        filmsImported: outcome.filmsImported,
        filmsUpdated: outcome.filmsUpdated,
        duplicatesSkipped: outcome.duplicatesSkipped,
        alreadyWatchedSkipped: outcome.alreadyWatchedSkipped,
        unresolvedCount: outcome.unresolvedCount,
        metadataCached: metadataStatus.cached,
        metadataAwaitingDownload: metadataStatus.awaitingDownload,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Import failed.");
    } finally {
      setIsImporting(false);
    }
  }

  if (result) {
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2
              aria-hidden="true"
              className="text-watchlist-green size-5"
            />
            Import complete
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <SummaryStat label="Films imported" value={result.filmsImported} />
            <SummaryStat label="Films updated" value={result.filmsUpdated} />
            <SummaryStat
              label="Duplicates skipped"
              value={result.duplicatesSkipped}
            />
            <SummaryStat
              label="Already watched (not re-added)"
              value={result.alreadyWatchedSkipped}
            />
            <SummaryStat
              label="Unresolved rows"
              value={result.unresolvedCount}
            />
          </dl>
          <div className="border-border bg-muted/40 space-y-1 rounded-lg border p-3 text-sm">
            <p className="text-foreground font-medium">Metadata</p>
            <p className="text-muted-foreground">
              {result.metadataCached} cached
              {result.metadataAwaitingDownload > 0
                ? `, ${result.metadataAwaitingDownload} awaiting download`
                : ""}
            </p>
            {result.metadataAwaitingDownload > 0 ? (
              <p className="text-muted-foreground">
                Connect to the internet when convenient and visit{" "}
                <Link href="/settings" className="underline underline-offset-2">
                  Settings
                </Link>{" "}
                to download it.
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button nativeButton={false} render={<Link href="/watchlist" />}>
              View watchlist
            </Button>
            <Button variant="outline" onClick={() => setResult(null)}>
              Import another file
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div className="space-y-2">
        <h1 className="page-heading">Import your watchlist</h1>
        <p className="page-subtitle max-w-2xl">
          Bring your Letterboxd library into FDraft — your watchlist, and
          optionally your ratings, watched films, and diary.
        </p>
      </div>

      <Card className="overflow-visible">
        <CardContent className="space-y-5">
          <form onSubmit={handleImport} className="space-y-5">
            <div
              onDragEnter={(event) => {
                event.preventDefault();
                setIsDraggingOver(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setIsDraggingOver(false)}
              onDrop={handleDrop}
              className={cn(
                "relative flex min-h-52 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors sm:p-10",
                isDraggingOver && "border-primary bg-primary/5",
                !isDraggingOver &&
                  selectedFile &&
                  "border-watchlist-green/50 bg-watchlist-green/5",
                !isDraggingOver &&
                  !selectedFile &&
                  "border-border hover:border-primary/40",
              )}
            >
              <Label htmlFor="file" className="sr-only">
                Watchlist CSV or export ZIP
              </Label>
              <input
                id="file"
                name="file"
                type="file"
                accept=".csv,.zip"
                className="peer absolute inset-0 z-10 cursor-pointer opacity-0"
                onChange={(event) =>
                  handleFileChosen(event.target.files?.[0] ?? null)
                }
              />
              <div className="peer-focus-visible:ring-ring peer-focus-visible:ring-offset-background pointer-events-none flex flex-col items-center gap-2 rounded-lg peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2">
                {selectedFile ? (
                  <>
                    <FileText
                      aria-hidden="true"
                      className="text-watchlist-green size-9"
                    />
                    <p className="text-foreground font-medium break-all">
                      {selectedFile.name}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {formatFileSize(selectedFile.size)} · Ready to import
                    </p>
                  </>
                ) : (
                  <>
                    <Upload
                      aria-hidden="true"
                      className="text-muted-foreground size-9"
                    />
                    <p className="text-foreground font-medium">
                      Drag your file here
                    </p>
                    <p className="text-muted-foreground text-sm">or</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="pointer-events-none"
                    >
                      Choose File
                    </Button>
                    <p className="text-muted-foreground mt-1 text-xs">
                      Watchlist CSV or Letterboxd export ZIP
                    </p>
                  </>
                )}
              </div>
            </div>

            {selectedFile ? (
              <button
                type="button"
                onClick={() => handleFileChosen(null)}
                className="text-muted-foreground hover:text-foreground focus-visible:outline-ring text-xs underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Choose a different file
              </button>
            ) : null}

            {error ? (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <Button
              type="submit"
              size="lg"
              disabled={isImporting || !activeProfile || !selectedFile}
            >
              <Upload aria-hidden="true" />
              {isImporting ? "Importing…" : "Import"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs">
        Everything is processed locally on this device — your file is never
        uploaded anywhere, even while offline.
      </p>
    </div>
  );
}
