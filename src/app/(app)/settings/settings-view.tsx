"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DataBackupSection } from "./data-backup-section";
import { MetadataSection } from "./metadata-section";
import { ProfileRow } from "./profile-row";

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
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="page-heading">Settings</h1>
        <p className="page-subtitle">
          Local profiles and cached film metadata for this device.
        </p>
      </div>

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

          <form onSubmit={handleCreate} className="flex gap-2 border-t pt-4">
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

      <MetadataSection />

      <DataBackupSection />
    </div>
  );
}
