"use client";

import { Info } from "lucide-react";
import { toast } from "sonner";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { resolveFranchiseChronologicalOrder } from "@/domain/profiles/profile";

const EXPLANATION =
  "To avoid skipping entries in a franchise (e.g. starting Mission Impossible 3 before you've watched Mission Impossible 1), enable this setting so if you roll on a franchise film, the one with the earliest release date is selected.";

/**
 * The Settings page's "Franchises in chronological order?" control (see
 * docs/updates, "FRANCHISE-ORDER SETTINGS CONTROL") — off by default,
 * persisted on the profile record via `updateProfileSettings`, following
 * the exact same pattern as `DefaultPageSection`. The info icon's
 * explanation is duplicated into its own `aria-label` rather than left to
 * the `Tooltip` alone, so it's reachable as descriptive text and not just
 * on hover.
 *
 * Renders one row's worth of content (no `Card` of its own) — see
 * `general-section.tsx`, which combines this with `DefaultPageSection`
 * under one shared "General" card (docs/updates, "SETTINGS INFORMATION
 * ARCHITECTURE REBUILD" §2/§13).
 */
export function FranchiseOrderSection() {
  const { activeProfile, updateProfileSettings } = useProfileContext();

  if (!activeProfile) {
    return null;
  }

  const profileId = activeProfile.id;
  const checked = resolveFranchiseChronologicalOrder(
    activeProfile.settings.franchiseChronologicalOrder,
  );

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    try {
      await updateProfileSettings(profileId, {
        franchiseChronologicalOrder: event.target.checked,
      });
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not save this setting.",
      );
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <Label
            htmlFor="franchise-chronological-order"
            className="text-foreground text-base"
          >
            Franchises in chronological order?
          </Label>
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={EXPLANATION}
                  className="text-muted-foreground hover:text-foreground focus-visible:outline-ring rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <Info aria-hidden="true" className="size-4" />
                </button>
              }
            />
            <TooltipContent className="max-w-64">{EXPLANATION}</TooltipContent>
          </Tooltip>
        </div>
        <input
          id="franchise-chronological-order"
          type="checkbox"
          checked={checked}
          onChange={(event) => void handleChange(event)}
          className="border-border accent-primary focus-visible:outline-ring size-4 rounded border focus-visible:outline-2 focus-visible:outline-offset-2"
        />
      </div>
      <p className="text-muted-foreground text-sm">
        When a roll lands on a franchise film, pick the earliest release in that
        franchise instead, if it&apos;s still on your watchlist.
      </p>
    </div>
  );
}
