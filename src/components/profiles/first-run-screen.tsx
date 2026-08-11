"use client";

import { useState } from "react";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Shown exactly once — the very first time FDraft opens with zero local
 * profiles (see docs/product-spec.md, "REMOVE AUTHENTICATION" — Prompt
 * 9.5B: "Opening FDraft should launch directly into the application. If no
 * local profile exists: show a lightweight first-run screen... This must
 * NOT look like account registration."). Deliberately just a name field:
 * no email, no password, no username-for-a-server — a local profile is not
 * an account.
 *
 * Once at least one profile exists, a returning launch with several
 * profiles and no remembered choice uses `ProfilePicker` instead — this
 * screen is only for "there has never been a profile on this device."
 */
export function FirstRunScreen() {
  const { createProfile, switchToProfile } = useProfileContext();
  const [name, setName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    setIsCreating(true);
    setError(null);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const profile = await createProfile(trimmed, timezone);
      await switchToProfile(profile.id);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not create your profile.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="space-y-1.5">
          <h1 className="text-foreground text-2xl font-semibold">
            Welcome to FDraft
          </h1>
          <p className="text-muted-foreground text-sm">
            Create your local profile to get started. Everything you add stays
            on this device — no account, no sign-in.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-left">
          <div className="space-y-1.5">
            <Label htmlFor="profile-name">Profile name</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Alex"
              maxLength={80}
              autoFocus
              disabled={isCreating}
            />
          </div>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <Button
            type="submit"
            className="w-full"
            disabled={isCreating || name.trim().length === 0}
          >
            {isCreating ? "Creating…" : "Create Profile"}
          </Button>
        </form>
      </div>
    </div>
  );
}
