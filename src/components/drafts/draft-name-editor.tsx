"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { setLocalDraftCustomName } from "@/application/drafts/local-draft-service";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * The small pen icon beside a draft's title (see docs/updates, "DRAFT
 * TITLE AND CUSTOM NAMING") — a `Popover`, not a full dialog or a
 * settings page, so renaming stays a quick, unobtrusive action right
 * where the title already is. Saving a non-empty value makes it the
 * draft's title everywhere (Active Draft, Draft History); saving an
 * empty/whitespace value clears it, restoring the generated `<Month>
 * <Difficulty> Draft` default — both go through the one existing
 * `setLocalDraftCustomName` action, never a separate "reset" path.
 */
export function DraftNameEditor({
  draftId,
  currentCustomName,
  onSaved,
}: {
  draftId: string;
  currentCustomName: string | null;
  onSaved: () => void;
}) {
  const { activeProfile, repositories } = useProfileContext();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(currentCustomName ?? "");
  const [isSaving, setIsSaving] = useState(false);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      // Always start from the currently-saved name, discarding any
      // unsaved edit from a previous time this was opened and dismissed.
      setValue(currentCustomName ?? "");
    }
  }

  async function handleSave() {
    if (!activeProfile) return;
    setIsSaving(true);
    try {
      await setLocalDraftCustomName(repositories, {
        profileId: activeProfile.id,
        draftId,
        customName: value,
      });
      setOpen(false);
      onSaved();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not rename this draft.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Rename draft"
          >
            <Pencil aria-hidden="true" className="size-3.5" />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-64 space-y-2">
        <label
          htmlFor="draft-custom-name"
          className="text-foreground text-xs font-semibold tracking-wide uppercase"
        >
          Draft name
        </label>
        <Input
          id="draft-custom-name"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="e.g. Horror Marathon"
          maxLength={100}
          disabled={isSaving}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void handleSave();
            }
          }}
        />
        <p className="text-muted-foreground text-xs">
          Leave blank to use the generated name instead.
        </p>
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            onClick={() => void handleSave()}
            disabled={isSaving}
          >
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
