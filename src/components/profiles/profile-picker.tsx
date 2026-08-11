"use client";

import { UserRound } from "lucide-react";
import { useState } from "react";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * "Alex / Sam / + Create Profile" (see docs/product-spec.md, "LOCAL
 * PROFILES REPLACE REMOTE ACCOUNTS"). Shown only when `ProfileProvider`
 * couldn't auto-open a profile on its own — zero profiles yet (first
 * launch) or more than one with no remembered choice. A profile is a name
 * and nothing else: no password, no email field, nothing that implies an
 * account.
 */
export function ProfilePicker() {
  const { profiles, createProfile, switchToProfile } = useProfileContext();
  const [newName, setNewName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) {
      return;
    }
    setIsCreating(true);
    setError(null);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const profile = await createProfile(trimmed, timezone);
      await switchToProfile(profile.id);
      setNewName("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not create that profile.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm space-y-6 py-12">
      <div className="text-center">
        <h1 className="text-foreground text-xl font-semibold">
          Who&apos;s watching?
        </h1>
        <p className="text-muted-foreground text-sm">
          Each profile keeps its own watchlist, drafts, and history.
        </p>
      </div>

      {profiles.length > 0 ? (
        <ul className="space-y-2">
          {profiles.map((profile) => (
            <li key={profile.id}>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={() => switchToProfile(profile.id)}
              >
                <UserRound aria-hidden="true" />
                {profile.displayName}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <form onSubmit={handleCreate} className="flex gap-2">
        <Input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="New profile name"
          aria-label="New profile name"
          disabled={isCreating}
        />
        <Button
          type="submit"
          disabled={isCreating || newName.trim().length === 0}
        >
          + Create Profile
        </Button>
      </form>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </div>
  );
}
