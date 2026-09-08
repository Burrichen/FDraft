"use client";

import { useEffect, useRef, useState } from "react";
import { acknowledgeEventEnding } from "@/application/events/event-ending-acknowledgement-store";
import { acknowledgeEventEndingStinger } from "@/application/events/event-ending-stinger-store";
import {
  resolveEventEndingCandidate,
  resolveEventEndingStingerCandidate,
} from "@/application/events/event-discovery";
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
 *
 * TWO-STAGE endings (see `EventEndingContent.stinger`, docs/updates
 * "FDRAFT UPDATE 1 — CHRISTMAS DRAFT DIFFICULTIES + VISUAL POLISH" §16 —
 * today only Christmas's January stinger): an event that declares a
 * `stinger` shows a second, separate modal a beat after the first is
 * acknowledged, resolved by `resolveEventEndingStingerCandidate` off the
 * same shared snapshot and acknowledged through its own sibling settings
 * key. The two stages are INDEPENDENTLY persisted, so dismissing the
 * goodbye can never resurrect the sting or vice versa, and an interrupted
 * session resumes at whichever stage is genuinely still outstanding.
 * `stinger.delayMs` is honoured only within the session that acknowledged
 * stage one (`justAcknowledgedRef`) — it is a dramatic beat, not a
 * schedule, and a profile returning later has already waited far longer
 * than the delay in real time, so the stinger shows immediately.
 *
 * The stinger is purely presentational. It renders copy and records its
 * own acknowledgement, and touches nothing else — in particular it never
 * joins, activates, or alters the participation of whatever event its
 * copy alludes to, so Christmas's January sting cannot make January
 * active early (§16).
 */
export function EventEndingDialog() {
  const { activeProfile, repositories } = useProfileContext();
  const profileId = activeProfile?.id ?? null;
  const { result, refresh } = useEventDiscovery();
  const candidate = resolveEventEndingCandidate(result.statuses);
  const candidateEventId = candidate?.event.id ?? null;
  const candidateOccurrenceKey = candidate?.occurrenceKey ?? null;

  // The second stage, when this event declares one. `stingerHeld` is what
  // implements the dramatic beat: it is set the moment stage one is
  // acknowledged IN THIS SESSION and cleared by a timer, so the stinger
  // waits — while a profile arriving with stage one already acknowledged
  // from a previous session sees it immediately (see this component's own
  // doc comment).
  const stingerCandidate = resolveEventEndingStingerCandidate(result.statuses);
  const [stingerHeld, setStingerHeld] = useState(false);
  const justAcknowledgedRef = useRef(false);
  const stingerDelayMs = stingerCandidate?.event.ending?.stinger?.delayMs ?? 0;

  useEffect(() => {
    if (!stingerHeld) return;
    const timer = window.setTimeout(
      () => setStingerHeld(false),
      stingerDelayMs,
    );
    return () => window.clearTimeout(timer);
  }, [stingerHeld, stingerDelayMs]);

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
    // Hold the stinger back for its delay only when THIS session is the
    // one that just dismissed stage one.
    if (candidate.event.ending?.stinger) {
      justAcknowledgedRef.current = true;
      setStingerHeld(true);
    }
    await acknowledgeEventEnding(repositories, {
      profileId,
      occurrenceKey: candidate.occurrenceKey,
    });
    await refresh();
  }

  async function handleAcknowledgeStinger() {
    if (!profileId || !stingerCandidate) return;
    justAcknowledgedRef.current = false;
    await acknowledgeEventEndingStinger(repositories, {
      profileId,
      occurrenceKey: stingerCandidate.occurrenceKey,
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

  const stingerVisible = Boolean(stingerCandidate) && !stingerHeld;
  const stingerTheme = stingerCandidate
    ? resolveEventPresentationTheme(stingerCandidate.event)
    : undefined;
  const stinger = stingerCandidate?.event.ending?.stinger ?? null;

  if (stingerVisible && stinger && stingerCandidate) {
    return (
      <AlertDialog open onOpenChange={() => {}}>
        <AlertDialogContent
          className={cn(
            stingerTheme?.endingStingerRootClassName ??
              stingerTheme?.endingRootClassName ??
              stingerTheme?.rootClassName,
          )}
        >
          <AlertDialogHeader>
            {stinger.title ? (
              <AlertDialogTitle
                className={cn(
                  "flex items-center gap-2",
                  stingerTheme?.endingStingerTitleClassName,
                )}
              >
                {stinger.title}
              </AlertDialogTitle>
            ) : (
              // Every AlertDialog needs an accessible name even when the
              // design deliberately shows no visible title — this stage is
              // meant to land as one bare, abrupt line of copy. Named by
              // the EVENT, deliberately not by `stinger.message`: repeating
              // the message here would announce it twice to a screen
              // reader (and match it twice in the DOM).
              <AlertDialogTitle className="sr-only">
                {stingerCandidate.event.name}
              </AlertDialogTitle>
            )}
            <AlertDialogDescription
              className={cn(
                "text-foreground text-base leading-relaxed sm:text-lg",
                stingerTheme?.endingStingerMessageClassName,
              )}
            >
              {stinger.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              className="h-auto w-full px-6 py-2.5 text-sm sm:text-base"
              onClick={() => void handleAcknowledgeStinger()}
            >
              {stinger.buttonLabel}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

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
