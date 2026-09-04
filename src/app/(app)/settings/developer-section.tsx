"use client";

import { useProfileContext } from "@/components/profiles/profile-provider";
import { Card, CardContent } from "@/components/ui/card";
import { resolveAdminMode } from "@/domain/profiles/profile";
import { AdminModeSection } from "./admin-mode-section";
import { EventArtSystemPreviewSection } from "./event-art-system-preview-section";
import { EventTestingSection } from "./event-testing-section";
import { FDraftThemeImportSection } from "./fdraft-theme-import-section";

/**
 * "DEVELOPER" (see docs/updates, "SETTINGS INFORMATION ARCHITECTURE
 * REBUILD" §10) — Admin Mode is the only thing a normal user ever sees
 * here. Turning it on reveals the actual developer/testing tools: the
 * EventClock override (`EventTestingSection`, which also carries its own
 * compact "TEST DATE ACTIVE" indicator — §11). The two event-manifest
 * force-refresh buttons that used to live here are gone (see docs/updates,
 * "STATIC EVENT FILM CONTENT PACKS" §22) — Halloween/January's curated
 * film content is now bundled, static JSON with no remote fetch to
 * refresh; updating it requires editing `public/events/<event>/films.json`
 * and shipping a new build, not a button here. None of this is
 * normal-user Event selection — that lives entirely in the Events section
 * instead, and never reads Admin Mode at all (§10: "Testing and
 * user-facing Event selection are different concepts").
 */
export function DeveloperSection() {
  const { activeProfile } = useProfileContext();
  const adminModeEnabled = resolveAdminMode(activeProfile?.settings.adminMode);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent>
          <AdminModeSection />
        </CardContent>
      </Card>
      {adminModeEnabled ? (
        <>
          <EventTestingSection />
          <EventArtSystemPreviewSection />
          <FDraftThemeImportSection />
        </>
      ) : null}
    </div>
  );
}
