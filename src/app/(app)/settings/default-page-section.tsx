"use client";

import { toast } from "sonner";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_PAGE_OPTIONS,
  isDefaultPage,
  resolveDefaultPage,
} from "@/domain/profiles/default-page";

/**
 * The Settings page's "Default page" control (see docs/product-spec.md,
 * "DEFAULT START PAGE SETTING") — which page FDraft opens to for THIS
 * profile, persisted on the profile record itself via
 * `updateProfileSettings` (see "MULTIPLE LOCAL PROFILES": "Default-page
 * preference belongs to the profile," not a device-wide setting).
 */
export function DefaultPageSection() {
  const { activeProfile, updateProfileSettings } = useProfileContext();

  if (!activeProfile) {
    return null;
  }

  const profileId = activeProfile.id;
  const currentValue = resolveDefaultPage(activeProfile.settings.defaultPage);

  async function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value;
    if (!isDefaultPage(value)) return;
    try {
      await updateProfileSettings(profileId, { defaultPage: value });
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Could not save the default page.",
      );
    }
  }

  return (
    <Card>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="default-page" className="text-foreground text-base">
            Default page
          </Label>
          <select
            id="default-page"
            value={currentValue}
            onChange={handleChange}
            className="border-border bg-background text-foreground focus-visible:outline-ring rounded-md border px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-1"
          >
            {DEFAULT_PAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <p className="text-muted-foreground text-sm">
          The page FDraft opens to when you launch the app.
        </p>
      </CardContent>
    </Card>
  );
}
