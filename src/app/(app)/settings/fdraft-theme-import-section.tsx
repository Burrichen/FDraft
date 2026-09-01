"use client";

import { useState, type ChangeEvent } from "react";
import {
  clearThemePreviewOverride,
  getThemePreviewOverride,
  setThemePreviewOverride,
} from "@/application/event-themes/theme-preview-override-store";
import { EventThemeLayoutRenderer } from "@/components/events/event-theme-layout-renderer";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { parseFDraftThemeText } from "@/domain/event-themes/fdraft-theme-schema";
import { useAsyncData } from "@/hooks/use-async-data";

/**
 * ADMIN-ONLY testing utility (see docs/updates, "EVENT STUDIO — PHASE 1"
 * §14) — lets an Admin pick a `.fdraft-theme` file exported from a future
 * FDraft (Dev) and temporarily preview it in Beta before it's committed
 * as a canonical file. Only ever mounted by `DeveloperSection` while
 * Admin Mode is on (this component doesn't re-check that itself, same
 * convention every other Developer-section component already follows) —
 * a normal user never sees this.
 *
 * NO editing happens here: the imported file is validated through the
 * exact same `parseFDraftThemeText` pipeline every other theme load goes
 * through, then rendered read-only via the SAME production
 * `EventThemeLayoutRenderer` normal pages would use — never a second,
 * approximate preview renderer (see that component's own doc comment).
 * The override is stored completely separately from any canonical
 * bundled theme file (`theme-preview-override-store.ts`) — importing one
 * can never touch `public/event-themes/` or any other profile.
 */
export function FDraftThemeImportSection() {
  const { activeProfile, repositories } = useProfileContext();
  const profileId = activeProfile?.id ?? null;
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [previewPageId, setPreviewPageId] = useState<string | null>(null);
  const [previewStateId, setPreviewStateId] = useState<string | null>(null);

  const { data: override, reloadSilently } = useAsyncData(async () => {
    if (!profileId) return null;
    return getThemePreviewOverride(repositories, profileId);
  }, [profileId, repositories]);

  if (!profileId) {
    return null;
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !profileId) {
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const text = await file.text();
      const result = parseFDraftThemeText(text);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      await setThemePreviewOverride(repositories, profileId, result.theme);
      setPreviewPageId(null);
      setPreviewStateId(null);
      await reloadSilently();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not read that file.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemove() {
    if (!profileId) return;
    await clearThemePreviewOverride(repositories, profileId);
    setError(null);
    setPreviewPageId(null);
    setPreviewStateId(null);
    await reloadSilently();
  }

  const pageIds = override ? Object.keys(override.layouts) : [];
  const resolvedPageId = previewPageId ?? pageIds[0] ?? null;
  const stateIds =
    override && resolvedPageId
      ? Object.keys(override.layouts[resolvedPageId]?.states ?? {})
      : [];
  const resolvedStateId = previewStateId ?? stateIds[0] ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          FDraft Theme Preview (Admin/testing only)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          Import a <code>.fdraft-theme</code> file to temporarily preview it in
          Beta — this never edits or commits anything, and is a local-only
          override just for this profile. Not shown to ordinary users.
        </p>

        <div className="space-y-1.5">
          <Label
            htmlFor="fdraft-theme-import"
            className="text-foreground text-sm"
          >
            Import .fdraft-theme for Preview
          </Label>
          <input
            id="fdraft-theme-import"
            type="file"
            accept=".fdraft-theme"
            disabled={isSaving}
            onChange={(event) => void handleFileChange(event)}
            className="text-muted-foreground text-sm"
          />
        </div>

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}

        {override ? (
          <div className="space-y-3 border-t pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">
                Previewing{" "}
                <strong>{override.displayName ?? override.themeId}</strong>{" "}
                <span className="text-muted-foreground">
                  ({override.themeId})
                </span>
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleRemove()}
              >
                Remove Preview Override
              </Button>
            </div>

            {pageIds.length > 0 ? (
              <div className="flex flex-wrap gap-3">
                <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  Page
                  <select
                    className="border-border bg-background rounded border px-1.5 py-1 text-xs"
                    value={resolvedPageId ?? ""}
                    onChange={(event) => {
                      setPreviewPageId(event.target.value);
                      setPreviewStateId(null);
                    }}
                  >
                    {pageIds.map((pageId) => (
                      <option key={pageId} value={pageId}>
                        {pageId}
                      </option>
                    ))}
                  </select>
                </label>
                {stateIds.length > 0 ? (
                  <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    State
                    <select
                      className="border-border bg-background rounded border px-1.5 py-1 text-xs"
                      value={resolvedStateId ?? ""}
                      onChange={(event) =>
                        setPreviewStateId(event.target.value)
                      }
                    >
                      {stateIds.map((stateId) => (
                        <option key={stateId} value={stateId}>
                          {stateId}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">
                This theme declares no layouts yet — nothing to preview.
              </p>
            )}

            {resolvedPageId && resolvedStateId ? (
              <div className="border-border bg-muted/30 relative h-64 overflow-hidden rounded border">
                <EventThemeLayoutRenderer
                  theme={override}
                  pageId={resolvedPageId}
                  stateId={resolvedStateId}
                  profileId={profileId}
                />
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">
            No preview override active — Beta renders whichever canonical
            bundled theme (if any) applies.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
