"use client";

import { formatInTimeZone } from "date-fns-tz";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { isOccurrenceActiveNow } from "@/application/events/event-discovery";
import { rollSingleFilmEventDraft } from "@/application/events/single-film-event-draft";
import { DraftLifecycleView } from "@/components/drafts/draft-lifecycle-view";
import { useEventDiscovery } from "@/components/events/event-discovery-provider";
import { resolveEventTheme } from "@/components/events/event-visual-themes";
import { describeFixedEventDeadline } from "@/components/events/fixed-event-deadline-copy";
import { useEventOptInFlow } from "@/components/events/use-event-opt-in-flow";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getCurrentOccurrenceBounds,
  getNextOccurrenceStart,
} from "@/domain/events/event-availability";
import {
  F_YOU_ITS_JANUARY_EVENT_ID,
  getEventDefinition,
} from "@/domain/events/event-registry";
import { useAsyncData } from "@/hooks/use-async-data";

/**
 * The "F* You, It's January!" Event page (see docs/updates, "FDRAFT UPDATE
 * 1 — F* YOU, IT'S JANUARY: SIMPLE EVENT MECHANICS" §10) — a bespoke page
 * like Halloween's rather than a delegate to the generic `EventPageView`
 * shell (which Christmas still uses unchanged).
 *
 * Two reasons it can no longer be that shell. First, the shell's
 * "description + bullets" explanation is exactly what the join modal
 * already said, and repeating it on the page is the "empty Draft-builder
 * UI January no longer needs" this phase removes. Second, and more
 * importantly, January has no creation step AT ALL: joining already rolled
 * and persisted its one film (see `beginEventOptIn` →
 * `rollSingleFilmEventDraft`), so by the time a joined profile reaches
 * this page there is a real Draft for `DraftLifecycleView` to render —
 * event identity, the rolled film with its normal metadata, watched state,
 * progress, and the fixed Event deadline, all through the exact same
 * shared draft presentation `/drafts` uses.
 *
 * `DraftLifecycleView` is rendered UNCONDITIONALLY (the same rule
 * Halloween's page follows) — it queries strictly by `sourceEventId`, so
 * an existing January Draft is never orphaned by the window closing or the
 * profile leaving. Only the EMPTY state depends on join/availability.
 *
 * The empty state is deliberately NOT a "Create Draft" step. For a profile
 * that isn't joined it is a Join button (or "Returns <date>"); for a
 * JOINED profile it can only mean the join-time roll never completed — a
 * profile who joined on a build before this mechanic existed, or whose
 * curated pool hadn't finished resolving yet — so it offers one honest
 * recovery action that runs the exact same idempotent roll. That is a
 * repair path, never a reroll: `rollSingleFilmEventDraft` returns the
 * already-persisted Draft untouched whenever this occurrence has one (§6,
 * §7), and this page never rolls on mount, only on a real click.
 */
export function JanuaryPageClient() {
  const { activeProfile, repositories } = useProfileContext();
  const profileId = activeProfile?.id ?? null;
  const timezone = activeProfile?.timezone ?? null;
  const january = getEventDefinition(F_YOU_ITS_JANUARY_EVENT_ID)!;
  const discovery = useEventDiscovery();
  const [isRolling, setIsRolling] = useState(false);
  // Guards against a double-click firing two concurrent rolls before the
  // first has persisted its Draft — `rollSingleFilmEventDraft`'s own
  // idempotency is checked against PERSISTED state, so two truly
  // simultaneous calls could both see "nothing rolled yet."
  const rollInFlight = useRef(false);

  const { data: miseryPoints, reloadSilently } = useAsyncData(async () => {
    if (!profileId) return null;
    return repositories.points.getBalance(profileId, "misery");
  }, [profileId, repositories]);

  const optIn = useEventOptInFlow({
    profileId,
    timezone,
    repositories,
    onOptedIn: async () => {
      await Promise.all([reloadSilently(), discovery.refresh()]);
    },
    onError: (message) => toast.error(message),
  });

  if (!activeProfile || !timezone) {
    return null;
  }

  const status = discovery.result.statuses.find(
    (candidate) => candidate.event.id === F_YOU_ITS_JANUARY_EVENT_ID,
  );
  const available = status?.available ?? false;
  const isActiveForProfile = status ? isOccurrenceActiveNow(status) : false;
  const now = discovery.result.now;
  const theme = resolveEventTheme(
    january,
    discovery.result.eventVisualsEnabled,
  );
  const nextStart = getNextOccurrenceStart(january.availability, now, timezone);
  const eventWindow = available
    ? getCurrentOccurrenceBounds(january.availability, now, timezone)
    : null;

  async function repairMissingRoll(reloadDraft: () => void) {
    if (rollInFlight.current) return;
    rollInFlight.current = true;
    setIsRolling(true);
    try {
      const outcome = await rollSingleFilmEventDraft(repositories, {
        profileId: activeProfile!.id,
        timezone: activeProfile!.timezone,
        eventId: F_YOU_ITS_JANUARY_EVENT_ID,
        sourceEventManuallyEnabled: status?.manuallyEnabled ?? false,
      });
      if (!outcome.ok) {
        toast.error(outcome.message);
        return;
      }
      void reloadSilently();
      reloadDraft();
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Could not roll your January film.",
      );
    } finally {
      rollInFlight.current = false;
      setIsRolling(false);
    }
  }

  return (
    // `theme-january` is the ONE place January's palette is applied (see
    // `.theme-january`, `globals.css`) — everything below inherits its
    // icy accent through the app's own semantic tokens, so no component
    // here carries a January-specific colour of its own.
    <div className="theme-january relative">
      <div className="relative space-y-6">
        <div>
          <h1 className="page-heading text-january-frost flex flex-wrap items-center gap-2">
            {theme ? (
              <theme.icon
                aria-hidden="true"
                className="text-january-ice size-6"
              />
            ) : null}
            {january.name}
          </h1>
          {isActiveForProfile && eventWindow ? (
            <p className="page-subtitle">
              Event ends {describeFixedEventDeadline(eventWindow.end, timezone)}
            </p>
          ) : null}
        </div>

        <DraftLifecycleView
          sourceEventId={F_YOU_ITS_JANUARY_EVENT_ID}
          emptyState={(reloadDraft) =>
            isActiveForProfile ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    January hasn&apos;t handed you a film yet
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-muted-foreground text-sm">
                    Joining normally rolls your one film straight away. Ask
                    January again.
                  </p>
                  <Button
                    type="button"
                    disabled={isRolling}
                    onClick={() => void repairMissingRoll(reloadDraft)}
                  >
                    {isRolling ? "Rolling…" : "Ask January for my film"}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {available ? "Available now" : "Not currently active"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {available ? (
                    <Button
                      type="button"
                      onClick={() =>
                        void optIn.beginOptIn(F_YOU_ITS_JANUARY_EVENT_ID)
                      }
                      disabled={optIn.isSaving}
                    >
                      {january.intro.primaryActionLabel ?? "Opt In"}
                    </Button>
                  ) : nextStart ? (
                    <p className="text-muted-foreground text-sm">
                      Returns{" "}
                      {formatInTimeZone(
                        nextStart,
                        timezone,
                        "d MMMM 'at' h:mm a",
                      )}
                      .
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            )
          }
        />

        {isActiveForProfile &&
        miseryPoints !== null &&
        miseryPoints !== undefined ? (
          <p className="text-muted-foreground text-sm">
            Misery Points:{" "}
            <strong className="tabular-nums">{miseryPoints}</strong>
          </p>
        ) : null}
      </div>
    </div>
  );
}
