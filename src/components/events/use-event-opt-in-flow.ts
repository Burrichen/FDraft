"use client";

import { useCallback, useState } from "react";
import {
  beginEventOptIn,
  confirmSayGoodbye,
} from "@/application/events/event-opt-in";
import type { Repositories } from "@/repositories";

export interface PendingSayGoodbye {
  draftId: string;
  eventId: string;
  manuallyEnabled: boolean;
}

/**
 * The "opt into full event participation, running the existing Say
 * Goodbye flow if an active draft is in the way" state machine — see
 * docs/product-spec.md, event system Phase 3 ("SAY GOODBYE") and Phase 5.
 * Originally inline in `EventSwitcherSection`; extracted in Phase 6 so the
 * new event introduction modal (`EventIntroDialog`) can trigger the exact
 * same opt-in lifecycle as Settings without duplicating any of it — both
 * surfaces call `beginEventOptIn`/`confirmSayGoodbye` through this one
 * hook, never their own copy of this logic.
 */
export function useEventOptInFlow(params: {
  profileId: string | null;
  timezone: string | null;
  repositories: Repositories;
  onOptedIn: () => void | Promise<void>;
  onError?: (message: string) => void;
}) {
  const { profileId, timezone, repositories, onOptedIn, onError } = params;
  const [pendingSayGoodbye, setPendingSayGoodbye] =
    useState<PendingSayGoodbye | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const beginOptIn = useCallback(async (eventId?: string) => {
    if (!profileId || !timezone) return;
    setIsSaving(true);
    try {
      const result = await beginEventOptIn(repositories, {
        profileId,
        timezone,
        eventId,
      });
      if (result.needsSayGoodbye) {
        setPendingSayGoodbye({
          draftId: result.activeDraftId,
          eventId: result.eventId,
          manuallyEnabled: result.manuallyEnabled,
        });
      } else {
        await onOptedIn();
      }
    } catch (cause) {
      onError?.(
        cause instanceof Error
          ? cause.message
          : "Could not opt into that event.",
      );
    } finally {
      setIsSaving(false);
    }
  }, [profileId, timezone, repositories, onOptedIn, onError]);

  const confirmSayGoodbyeAction = useCallback(async () => {
    if (!profileId || !pendingSayGoodbye) return;
    setIsSaving(true);
    try {
      await confirmSayGoodbye(repositories, {
        profileId,
        draftId: pendingSayGoodbye.draftId,
        eventId: pendingSayGoodbye.eventId,
        manuallyEnabled: pendingSayGoodbye.manuallyEnabled,
      });
      setPendingSayGoodbye(null);
      await onOptedIn();
    } catch (cause) {
      onError?.(
        cause instanceof Error
          ? cause.message
          : "Could not close out that draft.",
      );
    } finally {
      setIsSaving(false);
    }
  }, [profileId, pendingSayGoodbye, repositories, onOptedIn, onError]);

  const cancelSayGoodbye = useCallback(() => setPendingSayGoodbye(null), []);

  return {
    pendingSayGoodbye,
    isSaving,
    beginOptIn,
    confirmSayGoodbyeAction,
    cancelSayGoodbye,
  };
}
