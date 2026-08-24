"use client";

import { toast } from "sonner";
import { resolveEventIntroCandidate } from "@/application/events/event-discovery";
import { declineEventOccurrence } from "@/application/events/event-opt-in";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { useEventDiscovery } from "./event-discovery-provider";
import {
  resolveEventPresentationTheme,
  resolveEventTheme,
} from "./event-visual-themes";
import { useEventOptInFlow } from "./use-event-opt-in-flow";

/**
 * The generic event introduction modal (see docs/product-spec.md, event
 * system Phase 6: "the modal is now the primary way users discover a
 * newly-started event, not Settings") — mounted once in `AppShell`, like
 * `UpdateDialog`, so it can appear over any page. Every event supplies its
 * own `name`/`intro` content (`EventDefinition.intro`); this component has
 * no per-event branch or copy of its own — an event that wants genuinely
 * richer presentation (size, title styling, decoration, fully custom body
 * copy) supplies it entirely through `EventVisualTheme`'s optional render
 * hooks (see docs/updates, "PROMPT B2.3 — HALLOWEEN JOIN MODAL COMPLETE
 * REDESIGN") — today only Halloween populates them; every other event's
 * dialog renders exactly as before (generic size, plain title, description
 * + bullets + the shared footer note).
 *
 * Eligibility is entirely `resolveEventIntroCandidate`'s call, read off the
 * SHARED `EventDiscoveryProvider` snapshot (see docs/updates, "EVENT
 * LIFECYCLE REPAIR" §4) rather than a separate fetch of its own — this
 * component only renders whatever it returns and reacts to the two
 * actions: "primary" runs the SAME `useEventOptInFlow` action
 * `EventSwitcherSection` uses, and "secondary" records an occurrence-scoped
 * decline, never a permanent one — the next occurrence of a recurring
 * event (a new year) is eligible to show its intro again. Both actions
 * call the shared `refresh()` afterward, so navigation and this modal can
 * never disagree about what just happened.
 */
export function EventIntroDialog() {
  const { activeProfile, repositories } = useProfileContext();
  const profileId = activeProfile?.id ?? null;
  const timezone = activeProfile?.timezone ?? null;
  const { result, refresh } = useEventDiscovery();
  const candidate = resolveEventIntroCandidate(result.statuses);

  const optIn = useEventOptInFlow({
    profileId,
    timezone,
    repositories,
    onOptedIn: refresh,
    onError: (message) => toast.error(message),
  });

  async function handleDismiss() {
    if (!profileId || !candidate) return;
    await declineEventOccurrence(repositories, {
      profileId,
      occurrenceKey: candidate.occurrenceKey,
    });
    await refresh();
  }

  // Ungated by `eventVisualsEnabled` (see `resolveEventPresentationTheme`'s
  // own doc comment) — this is a one-time first impression, shown before
  // any opt-in exists, so it must look fully dressed even for a profile
  // that has never turned visuals on for anything.
  const presentationTheme = candidate
    ? resolveEventPresentationTheme(candidate.event)
    : undefined;

  return (
    <AlertDialog
      open={Boolean(candidate)}
      onOpenChange={(next) => {
        if (!next) void handleDismiss();
      }}
    >
      <AlertDialogContent className={presentationTheme?.rootClassName}>
        {candidate ? (
          <>
            {presentationTheme?.renderDecoration?.()}
            <AlertDialogHeader>
              <AlertDialogTitle
                className={cn(
                  "flex items-center gap-2",
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
                {candidate.event.name}
              </AlertDialogTitle>
              {presentationTheme?.renderIntroContent ? null : (
                <AlertDialogDescription>
                  {candidate.event.intro.description}
                </AlertDialogDescription>
              )}
            </AlertDialogHeader>

            {presentationTheme?.renderIntroContent ? (
              presentationTheme.renderIntroContent()
            ) : (
              <>
                <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
                  {candidate.event.intro.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
                <p className="text-muted-foreground text-xs">
                  Not ready? This isn&apos;t permanent — you can still opt in
                  later from Settings while it&apos;s available.
                </p>
              </>
            )}

            <AlertDialogFooter>
              <AlertDialogCancel
                className="h-auto px-5 py-2.5 text-sm sm:text-base"
                disabled={optIn.isSaving}
              >
                {candidate.event.intro.secondaryActionLabel ?? "Nah"}
              </AlertDialogCancel>
              <Button
                type="button"
                className="h-auto px-6 py-2.5 text-sm sm:text-base"
                onClick={() => void optIn.beginOptIn(candidate.event.id)}
                disabled={optIn.isSaving}
              >
                {candidate.event.intro.primaryActionLabel ?? "Opt In"}
              </Button>
            </AlertDialogFooter>
          </>
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  );
}
