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
import { cn } from "@/lib/utils";
import { useAsyncData } from "@/hooks/use-async-data";
import { useProfileContext } from "@/components/profiles/profile-provider";
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
 * Eligibility is entirely `resolveEventIntroToShow`'s call — this
 * component only renders whatever it returns and reacts to the two
 * actions: "primary" runs the SAME `useEventOptInFlow` action
 * `EventSwitcherSection` uses, and "secondary" records a cycle-scoped
 * dismissal, never a permanent one — the next occurrence of a recurring
 * event is eligible to show its intro again.
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
