"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { beginEventOptIn } from "@/application/events/event-opt-in";
import { getEventDefinition } from "@/domain/events/event-registry";
import type { Repositories } from "@/repositories";

/**
 * The "opt into full event participation" action — see docs/product-spec.md,
 * event system Phase 5; revised by docs/updates, "PROMPT B2.1 — DUAL DRAFT
 * ARCHITECTURE + EVENT ROUTING/SETTINGS FIXES" §1, which removed the "Say
 * Goodbye to your active draft first" detour entirely (opting into an event
 * never touches a profile's normal Draft — the two are fully independent).
 * Originally inline in `EventSwitcherSection`; extracted in Phase 6 so the
 * event introduction modal (`EventIntroDialog`) can trigger the exact same
 * opt-in action as Settings without duplicating it.
 *
 * Also the ONE place "join → land on the event's own page" happens (see
 * docs/updates, "PROMPT 18 — EVENT PAGES + HALLOWEEN LIFECYCLE") — after a
 * successful opt-in, if the event defines a `page`, this navigates there
 * before calling the caller's `onOptedIn`. An event with no `page` (Frontier,
 * Signal from Beyond) simply doesn't navigate anywhere, exactly as today.
 */
export function useEventOptInFlow(params: {
  profileId: string | null;
  timezone: string | null;
  repositories: Repositories;
  onOptedIn: () => void | Promise<void>;
  onError?: (message: string) => void;
}) {
  const { profileId, timezone, repositories, onOptedIn, onError } = params;
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  const beginOptIn = useCallback(
    async (eventId?: string) => {
      if (!profileId || !timezone) return;
      setIsSaving(true);
      try {
        const result = await beginEventOptIn(repositories, {
          profileId,
          timezone,
          eventId,
        });
        if (result.eventId) {
          const page = getEventDefinition(result.eventId)?.page;
          if (page) {
            router.push(page.route);
          }
        }
        await onOptedIn();
      } catch (cause) {
        onError?.(
          cause instanceof Error
            ? cause.message
            : "Could not opt into that event.",
        );
      } finally {
        setIsSaving(false);
      }
    },
    [profileId, timezone, repositories, onOptedIn, onError, router],
  );

  return { isSaving, beginOptIn };
}
