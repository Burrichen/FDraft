"use client";

import { toast } from "sonner";
import { dismissEventForCycle } from "@/application/events/event-dismissal-store";
import { resolveEventIntroToShow } from "@/application/events/event-intro";
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
import { useAsyncData } from "@/hooks/use-async-data";
import { useProfileContext } from "@/components/profiles/profile-provider";
import {
  resolveEventPresentationTheme,
  resolveEventTheme,
} from "./event-visual-themes";
import { useEventOptInFlow } from "./use-event-opt-in-flow";
import { SayGoodbyeView } from "@/app/(app)/settings/say-goodbye-view";

/**
 * The generic event introduction modal (see docs/product-spec.md, event
 * system Phase 6: "the modal is now the primary way users discover a
 * newly-started event, not Settings") — mounted once in `AppShell`, like
 * `UpdateDialog`, so it can appear over any page. Every event supplies its
 * own `name`/`intro` content (`EventDefinition.intro`); this component has
 * no per-event branch or copy of its own, so a second future event needs
 * no new modal component.
 *
 * Eligibility is entirely `resolveEventIntroToShow`'s call — this
 * component only renders whatever it returns and reacts to the two
 * actions: "Opt In" runs the SAME `useEventOptInFlow` lifecycle
 * `EventSwitcherSection` uses (including Say Goodbye when an active draft
 * is in the way), and "Nah" records a cycle-scoped dismissal, never a
 * permanent one — the next occurrence of a recurring event is eligible to
 * show its intro again.
 */
export function EventIntroDialog() {
  const { activeProfile, repositories } = useProfileContext();
  const profileId = activeProfile?.id ?? null;
  const timezone = activeProfile?.timezone ?? null;

  const { data: candidate, reloadSilently } = useAsyncData(async () => {
    if (!profileId || !timezone) return null;
    return resolveEventIntroToShow(repositories, { profileId, timezone });
  }, [profileId, timezone, repositories]);

  const optIn = useEventOptInFlow({
    profileId,
    timezone,
    repositories,
    onOptedIn: reloadSilently,
    onError: (message) => toast.error(message),
  });

  async function handleDismiss() {
    if (!profileId || !candidate) return;
    if (candidate.cycleId) {
      await dismissEventForCycle(
        repositories,
        profileId,
        candidate.event.id,
        candidate.cycleId,
      );
    }
    await reloadSilently();
  }

  const introOpen = Boolean(candidate) && !optIn.pendingSayGoodbye;
  const sayGoodbyeOpen = Boolean(optIn.pendingSayGoodbye);

  return (
    <>
      <AlertDialog
        open={introOpen}
        onOpenChange={(next) => {
          if (!next) void handleDismiss();
        }}
      >
        <AlertDialogContent
          className={
            candidate
              ? resolveEventPresentationTheme(candidate.event)?.rootClassName
              : undefined
          }
        >
          {candidate ? (
            <>
              {resolveEventPresentationTheme(
                candidate.event,
              )?.renderDecoration?.()}
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  {(() => {
                    const theme = resolveEventTheme(
                      candidate.event,
                      candidate.eventVisualsEnabled,
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
                <AlertDialogDescription>
                  {candidate.event.intro.description}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
                {candidate.event.intro.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
              <p className="text-muted-foreground text-xs">
                Not ready? This isn&apos;t permanent — you can still opt in
                later from Settings while it&apos;s available.
              </p>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={optIn.isSaving}>
                  {candidate.event.intro.secondaryActionLabel ?? "Nah"}
                </AlertDialogCancel>
                <Button
                  type="button"
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

      <AlertDialog open={sayGoodbyeOpen} onOpenChange={() => {}}>
        <AlertDialogContent className="max-w-lg">
          {optIn.pendingSayGoodbye ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Say goodbye to your draft?</AlertDialogTitle>
                <AlertDialogDescription>
                  Opting in replaces your active draft. Mark anything
                  you&apos;ve watched, then confirm to close this draft out and
                  continue — whatever&apos;s left unwatched is simply let go of,
                  not held against you.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <SayGoodbyeView draftId={optIn.pendingSayGoodbye.draftId} />
              <AlertDialogFooter>
                <Button
                  type="button"
                  onClick={() => void optIn.confirmSayGoodbyeAction()}
                  disabled={optIn.isSaving}
                >
                  Say Goodbye
                </Button>
                <AlertDialogCancel
                  onClick={optIn.cancelSayGoodbye}
                  disabled={optIn.isSaving}
                >
                  Cancel
                </AlertDialogCancel>
              </AlertDialogFooter>
            </>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
