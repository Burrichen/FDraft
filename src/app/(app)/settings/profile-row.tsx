"use client";

import { Check, Pencil, Trash2, UserRound, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LocalProfile } from "@/domain/profiles/profile";

interface ProfileRowProps {
  profile: LocalProfile;
  isActive: boolean;
  onSwitch: (profileId: string) => Promise<void>;
  onRename: (profileId: string, displayName: string) => Promise<void>;
  onDelete: (profileId: string) => Promise<void>;
}

/**
 * One row in Settings' "Profiles" list — rename, switch, and destructive
 * delete (see docs/product-spec.md, "LOCAL PROFILE MANAGEMENT" — Prompt
 * 9.5B: "Deleting a profile is destructive. Require a clear confirmation.
 * Do not allow accidental deletion."). Delete requires opening a modal and
 * clicking a second, clearly-labeled destructive action inside it — a
 * single click on the row can never delete anything.
 */
export function ProfileRow({
  profile,
  isActive,
  onSwitch,
  onRename,
  onDelete,
}: ProfileRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(profile.displayName);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleSaveRename() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === profile.displayName) {
      setIsEditing(false);
      setName(profile.displayName);
      return;
    }
    setIsSaving(true);
    try {
      await onRename(profile.id, trimmed);
      setIsEditing(false);
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Could not rename this profile.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await onDelete(profile.id);
      toast.success(`Deleted "${profile.displayName}" and all of its data.`);
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Could not delete this profile.",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <li className="border-border bg-card flex items-center gap-3 rounded-lg border p-3">
      <UserRound
        aria-hidden="true"
        className="text-muted-foreground size-5 shrink-0"
      />

      {isEditing ? (
        <div className="flex flex-1 items-center gap-2">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            autoFocus
            disabled={isSaving}
            aria-label="Profile name"
          />
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={handleSaveRename}
            disabled={isSaving}
            aria-label="Save name"
          >
            <Check aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={() => {
              setIsEditing(false);
              setName(profile.displayName);
            }}
            disabled={isSaving}
            aria-label="Cancel rename"
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <>
          <div className="min-w-0 flex-1">
            <p className="text-foreground truncate text-sm font-medium">
              {profile.displayName}
              {isActive ? (
                <Badge
                  variant="secondary"
                  className="ml-2 align-middle text-[0.65rem]"
                >
                  Active
                </Badge>
              ) : null}
            </p>
            <p className="text-muted-foreground text-xs">{profile.timezone}</p>
          </div>
          <div className="flex items-center gap-1">
            {!isActive ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onSwitch(profile.id)}
              >
                Switch to
              </Button>
            ) : null}
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={() => setIsEditing(true)}
              aria-label={`Rename "${profile.displayName}"`}
            >
              <Pencil aria-hidden="true" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    aria-label={`Delete "${profile.displayName}"`}
                    disabled={isDeleting}
                  />
                }
              >
                <Trash2 aria-hidden="true" />
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Delete &quot;{profile.displayName}&quot;?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes this profile&apos;s entire
                    watchlist, drafts, draft history, and settings from this
                    device. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    disabled={isDeleting}
                  >
                    {isDeleting ? "Deleting…" : "Delete permanently"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </>
      )}
    </li>
  );
}
