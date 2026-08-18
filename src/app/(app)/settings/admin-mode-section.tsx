"use client";

import { toast } from "sonner";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { resolveAdminMode } from "@/domain/profiles/profile";

/**
 * The Settings page's "Admin Mode" control (see docs/updates, v1.0.4
 * "God Mode", "PROFILE-SPECIFIC ADMIN MODE") — off by default, persisted
 * per profile via `updateProfileSettings`, following the exact same
 * pattern as `FranchiseOrderSection`. Currently unlocks only one thing,
 * the Draft page's "Regenerate Draft" action — never surfaced anywhere
 * else as a badge or indicator once turned on (see that requirement).
 */
export function AdminModeSection() {
  const { activeProfile, updateProfileSettings } = useProfileContext();

  if (!activeProfile) {
    return null;
  }

  const profileId = activeProfile.id;
  const checked = resolveAdminMode(activeProfile.settings.adminMode);

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    try {
      await updateProfileSettings(profileId, {
        adminMode: event.target.checked,
      });
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not save this setting.",
      );
    }
  }

  return (
    <Card>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="admin-mode" className="text-foreground text-base">
            Admin Mode
          </Label>
          <input
            id="admin-mode"
            type="checkbox"
            checked={checked}
            onChange={(event) => void handleChange(event)}
            className="border-border accent-primary focus-visible:outline-ring size-4 rounded border focus-visible:outline-2 focus-visible:outline-offset-2"
          />
        </div>
        <p className="text-muted-foreground text-sm">
          Unlocks temporary, testing-only actions for this profile only —
          currently, an option to regenerate your active draft. This is a
          temporary tool for testing and will eventually be removed.
        </p>
      </CardContent>
    </Card>
  );
}
