"use client";

import { useEffect } from "react";
import { acknowledgeEventEnding } from "@/application/events/event-ending-acknowledgement-store";
import { resolveEventEndingCandidate } from "@/application/events/event-discovery";
import { finalizeExpiredEventDraftIfNeeded } from "@/application/events/event-draft-finalization";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { resolveEventEndingSecondaryMessage } from "@/domain/events/event-ending-annual";
import { parseEventOccurrenceYear } from "@/domain/events/event-participation";
import { useEventDiscovery } from "./event-discovery-provider";
import {
  resolveEventPresentationTheme,
  resolveEventTheme,
} from "./event-visual-themes";

/**
 * The generic Event-over/ending modal (see docs/updates, "EVENT SYSTEM —
 * EVENT-OVER EXPERIENCE") — the end-of-event counterpart to
 * `EventIntroDialog`, mounted once in `AppShell` the same way, so it can
 * appear over any page without requiring a visit to the event's own page,
 * Settings, or Drafts. Every event supplies its own content entirely
 * through `EventDefinition.ending` (message/secondary-message-template/
 * button label) plus, for artwork, `EventVisualTheme.
 * EndingDecorationComponent` — this component has no per-event branch or
 * copy of its own; an event with no `ending` (or `enabled: false`) simply
 * never has a candidate here.
 *
 * Eligibility is entirely `resolveEventEndingCandidate`'s call, read off
 * the SAME shared `EventDiscoveryProvider` snapshot `EventIntroDialog`
 * uses — a JOINED occurrence whose window has closed and whose ending
 * hasn't already been acknowledged. Whenever a candidate appears, this
 * also opportunistically finalises that event's own Draft (see
 * `finalizeExpiredEventDraftIfNeeded`) — the SAME global moment covers
 * both "show the goodbye" and "safely archive the Draft," so a profile
 * who never revisits the event's own page still gets both.
 *
 * Deliberately has exactly ONE action, not the join modal's two: there is
 * nothing to opt out of at this point, only to acknowledge (see
 * docs/updates §11/§12 — "require the explicit... action so
 * acknowledgement is unambiguous"). `onOpenChange` ignores every close
 * request the dialog primitive raises on its own (Escape, outside
 * interaction) — `open` stays bound to whether a candidate exists, so
 * only the explicit button below ever actually dismisses it. This still
 * doesn't trap focus incorrectly: the dialog's own focus trap keeps
 * cycling between its (one) real, keyboard-reachable control exactly like
 * any other must-act modal.
 */
export function EventEndingDialog() {
  const { activeProfile, repositories } = useProfileContext();
  const profileId = activeProfile?.id ?? null;
  const { result, refresh } = useEventDiscovery();
  const candidate = resolveEventEndingCandidate(result.statuses);
  const candidateEventId = candidate?.event.id ?? null;
  const candidateOccurrenceKey = candidate?.occurrenceKey ?? null;

  // Fires once per (profile, candidate) pair — safely re-entrant even if
  // this effect runs more than once for the same candidate, since
  // `finalizeExpiredEventDraftIfNeeded`/`expireLocalDraftIfDue` are
  // themselves idempotent (a no-op once the Draft is no longer `"active"`).
  useEffect(() => {
    if (!profileId || !candidateEventId) return;
    void finalizeExpiredEventDraftIfNeeded(repositories, {
      profileId,
      eventId: candidateEventId,
    });
  }, [profileId, candidateEventId, candidateOccurrenceKey, repositories]);

  async function handleAcknowledge() {
    if (!profileId || !candidate) return;
    await acknowledgeEventEnding(repositories, {
      profileId,
      occurrenceKey: candidate.occurrenceKey,
    });
    await refresh();
  }

  const presentationTheme = candidate
    ? resolveEventPresentationTheme(candidate.event)
    : undefined;
  const occurrenceYear = candidate
    ? parseEventOccurrenceYear(candidate.occurrenceKey)
    : null;
  const secondaryMessage =
    candidate?.event.ending && occurrenceYear !== null
      ? resolveEventEndingSecondaryMessage(
          candidate.event.ending,
          occurrenceYear,
        )
      : null;

  return (
    <AlertDialog open={Boolean(candidate)} onOpenChange={() => {}}>
      <AlertDialogContent
        className={cn(
          presentationTheme?.endingRootClassName ??
            presentationTheme?.rootClassName,
        )}
      >
        {candidate?.event.ending ? (
          <>
            {presentationTheme?.EndingDecorationComponent ? (
              <presentationTheme.EndingDecorationComponent />
            ) : null}
            <AlertDialogHeader>
              <AlertDialogTitle
                className={cn(
                  "flex items-center gap-2",
                  presentationTheme?.endingTitleClassName ??
                    presentationTheme?.titleClassName,
                )}
              >
                {(() => {
                  const theme = resolveEventTheme(
                    candidate.event,
                    result.eventVisualsEnabled,
                  );
                  return theme ? (
                    <theme.icon
                      aria-hidden="true"
                      className="size-4 shrink-0"
                    />
                  ) : null;
                })()}
                {candidate.event.ending.title ?? candidate.event.name}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-foreground text-base leading-relaxed sm:text-lg">
                {candidate.event.ending.message}
              </AlertDialogDescription>
            </AlertDialogHeader>

            {secondaryMessage ? (
              <p className="text-muted-foreground text-center text-sm italic sm:text-base">
                {secondaryMessage}
              </p>
            ) : null}

            <AlertDialogFooter>
              <Button
                type="button"
                className="h-auto w-full px-6 py-2.5 text-sm sm:text-base"
                onClick={() => void handleAcknowledge()}
              >
                {candidate.event.ending.buttonLabel}
              </Button>
            </AlertDialogFooter>
          </>
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  );
}
