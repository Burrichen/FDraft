"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DataBackupSection } from "./data-backup-section";
import { DeveloperSection } from "./developer-section";
import { EventSwitcherSection } from "./event-switcher-section";
import { GeneralSection } from "./general-section";
import { HauntedSection } from "./haunted-section";
import { MetadataSection } from "./metadata-section";
import { ProfileRow } from "./profile-row";
import { ReimportWatchlistSection } from "./reimport-watchlist-section";
import { SettingsSection } from "./settings-section";
import { UpdatesSection } from "./updates-section";

/**
 * Settings, reorganised into named, clearly-scoped sections (see
 * docs/updates, "SETTINGS INFORMATION ARCHITECTURE REBUILD") — Profile,
 * General, Events, Watchlist & Metadata, Data & Backups, Updates, and
 * Developer. Two intentional omissions from the brief's full eight-section
 * hierarchy, both confirmed by direct inspection before this rewrite
 * rather than assumed:
 *
 *  - No "Appearance & Accessibility" section exists. FDraft has no
 *    implemented appearance control at all (no theme toggle — the app is
 *    permanently dark, see `globals.css`'s `.dark` class applied
 *    unconditionally on `<html>`) and no "performance mode"/"visual
 *    intensity" setting anywhere. `ProfileSettings.reducedMotion` exists
 *    as a stored per-profile field, but nothing in the app ever reads it
 *    (every actual reduced-motion behaviour is driven directly by the
 *    OS-level `prefers-reduced-motion` media query) — surfacing a toggle
 *    for a field with no observable effect would be exactly the "fake
 *    setting simply to fill the section" this rebuild is told not to
 *    create. The stored field itself is untouched by this phase.
 *  - Event Visuals/Gameplay live under Events (§5), not here, matching
 *    the brief exactly.
 *
 * Laid out as two columns on wide viewports rather than one narrow,
 * centered column (§12: "Avoid one tiny narrow Settings column surrounded
 * by empty space") — explicit column assignment, not CSS grid
 * auto-placement, so related sections always land together instead of an
 * unrelated section landing beside them by row-major accident. Collapses
 * to a single stacked column below `lg`.
 */
export function SettingsView() {
  const {
    activeProfile,
    profiles,
    createProfile,
    switchToProfile,
    renameProfile,
    deleteProfile,
  } = useProfileContext();
  const [newName, setNewName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    setIsCreating(true);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await createProfile(trimmed, timezone);
      setNewName("");
      toast.success(`Created profile "${trimmed}"`);
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Could not create that profile.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  if (!activeProfile) {
    return null;
  }

  return (
    // Previously its own `max-w-[87.5rem]` (1400px) cap, narrower than the
    // shared app shell (`app-shell-width`, 2048px) it sits inside — see
    // docs/product-spec.md, "Desktop Layout Width," and the release-
    // hardening pass that measured this page falling to ~73%/~55% of a
    // 1920/2560 viewport respectively, worse than every other primary
    // page. Now simply inherits the shell's own width like the rest of
    // the app, rather than re-narrowing it a second time.
    <div className="space-y-8">
      <div>
        <h1 className="page-heading">Settings</h1>
        <p className="page-subtitle">
          Local profiles and cached film metadata for this device.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
        <div className="space-y-8">
          <SettingsSection title="Profile">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Profiles</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {profiles.map((profile) => (
                    <ProfileRow
                      key={profile.id}
                      profile={profile}
                      isActive={profile.id === activeProfile.id}
                      onSwitch={switchToProfile}
                      onRename={renameProfile}
                      onDelete={deleteProfile}
                    />
                  ))}
                </ul>

                <form
                  onSubmit={handleCreate}
                  className="flex gap-2 border-t pt-4"
                >
                  <Input
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    placeholder="New profile name"
                    aria-label="New profile name"
                    maxLength={80}
                    disabled={isCreating}
                  />
                  <Button
                    type="submit"
                    disabled={isCreating || newName.trim().length === 0}
                  >
                    + Create Profile
                  </Button>
                </form>
              </CardContent>
            </Card>
          </SettingsSection>

          <SettingsSection title="General">
            <GeneralSection />
          </SettingsSection>

          <SettingsSection title="Events">
            <EventSwitcherSection />
            <HauntedSection />
          </SettingsSection>
        </div>

        <div className="space-y-8">
          <SettingsSection title="Watchlist & Metadata">
            <MetadataSection />
            <ReimportWatchlistSection />
          </SettingsSection>

          <SettingsSection title="Data & Backups">
            <DataBackupSection />
          </SettingsSection>

          <SettingsSection title="Updates">
            <UpdatesSection />
          </SettingsSection>

          <SettingsSection title="Developer">
            <DeveloperSection />
          </SettingsSection>
        </div>
      </div>
    </div>
  );
}
