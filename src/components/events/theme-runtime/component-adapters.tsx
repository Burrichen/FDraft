"use client";

import type {
  ComponentAdapterProps,
  ComponentAdapterRegistry,
  ComponentCopyContractRegistry,
} from "@fdraft/theme-renderer";
import { Coins } from "lucide-react";
import { useEffect, useState } from "react";
import { ActiveDraftFilms } from "@/components/drafts/active-draft-films";
import { DraftLifecycleView } from "@/components/drafts/draft-lifecycle-view";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PointsCard } from "@/components/stats/points-card";
import { useFDraftThemeRenderContext } from "@/infrastructure/theme-runtime/render-context";
import { FDRAFT_SUPPORTED_COMPONENT_KEYS } from "@/infrastructure/theme-runtime/compatibility";

/**
 * FDraft's real host component adapters (see docs/updates, "FDRAFT THEME
 * RUNTIME — PROMPT 10", "FDraft host adapters") — maps every approved
 * renderer key to an EXISTING real FDraft component/domain value, never a
 * duplicated re-implementation. Every adapter here:
 *
 * - Renders only `copy.<slotKey>` text a theme author edited (already
 *   resolved/placeholder-substituted by `resolveComponentCopy` — this
 *   file never re-derives display text itself);
 * - Reads dynamic typed values (a number, a fetched film list) ONLY from
 *   `useFDraftThemeRenderContext()` or an existing real app context
 *   (`ProfileProvider`/`EventDiscoveryProvider`/`WatchUndoProvider`) —
 *   never fetches its own data or reaches a repository directly, per
 *   `docs/architecture/RENDERER_HOST_NOTES.md`'s own host constraints;
 * - Owns no eligibility/opt-in/draft-generation/points-mutation decision
 *   itself — `draft-controls` reuses the real `DraftLifecycleView`
 *   wholesale specifically so those decisions stay in FDraft's existing,
 *   already-tested domain code, not a second copy of it here.
 */

const noopEmptyState = (
  <p className="text-muted-foreground text-sm">Nothing here yet.</p>
);

/**
 * No `truncate` — found during verification that a component-adapter's
 * job is to make ALL of a theme author's copy visible, not just present
 * in the DOM. `truncate` clips overflow with an ellipsis regardless of
 * how much of the real string is actually shown on screen, so a
 * text-content assertion in a test can pass while a real user only ever
 * sees a fragment. Wrapping instead guarantees the full title is always
 * visible (on however many lines it needs), the strictly safer default
 * for something as load-bearing as an event's own title.
 */
function PageTitleAdapter({ style, copy }: ComponentAdapterProps) {
  return (
    <CardTitle
      style={style}
      className="page-heading text-lg break-words sm:text-xl"
    >
      {copy.title}
    </CardTitle>
  );
}

function EventInformationAdapter({ style, copy }: ComponentAdapterProps) {
  return (
    <Card style={style} className="size-full">
      <CardHeader>
        <CardTitle>{copy.eventName}</CardTitle>
      </CardHeader>
      {copy.dateRange ? (
        <CardContent>
          <p className="text-muted-foreground text-sm">{copy.dateRange}</p>
        </CardContent>
      ) : null}
    </Card>
  );
}

/** `mm:ss`-or-longer breakdown of a millisecond duration, floored at zero. */
function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

/**
 * Ticks once a second purely for a smooth on-screen countdown — this is
 * NOT the Admin Mode test-date resolution (`getEffectiveEventDate`
 * already resolved the correct target timestamp, in
 * `buildFDraftThemeRenderContext`, before this component ever mounts);
 * only the live "time remaining" ANIMATION uses wall-clock time, the same
 * way a plain CSS countdown widget would.
 */
function EventCountdownAdapter({
  style,
  copy,
  enabled,
}: ComponentAdapterProps) {
  const { countdownTargetAtMs } = useFDraftThemeRenderContext();
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (countdownTargetAtMs === null || !enabled) return;
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [countdownTargetAtMs, enabled]);

  return (
    <p
      style={style}
      className="text-foreground tabular-nums"
      aria-label={copy.accessibleLabel}
    >
      {countdownTargetAtMs === null
        ? "—"
        : formatCountdown(countdownTargetAtMs - nowMs)}
    </p>
  );
}

/**
 * KNOWN GAP (documented, not silently dropped): the shared fixture's
 * copy contract for this key declares `skipLabel`/`confirmLabel` as
 * editable text, matching the general "button wording may be overridden"
 * rule — but the real `DraftLifecycleView` this adapter reuses renders
 * its own Skip/Confirm/reroll button text internally with no prop to
 * override it. The contract entries are kept (so a theme authored
 * against the shared fixture stays structurally valid against FDraft),
 * but `copy.skipLabel`/`copy.confirmLabel` are not applied to anything
 * yet — see docs/fdraft-theme-runtime/INTEGRATION.md's remaining
 * blockers. Action/route/disabled-logic/accessible-fallback all remain
 * fully FDraft-owned regardless, per the same rule.
 */
function DraftControlsAdapter({ style }: ComponentAdapterProps) {
  const { eventId } = useFDraftThemeRenderContext();
  return (
    <div style={style} className="size-full">
      <DraftLifecycleView sourceEventId={eventId} emptyState={noopEmptyState} />
    </div>
  );
}

function FilmGridAdapter({ style }: ComponentAdapterProps) {
  const { films } = useFDraftThemeRenderContext();
  return (
    <div style={style} className="size-full">
      <ActiveDraftFilms films={films} />
    </div>
  );
}

function EventProgressAdapter({ style, copy }: ComponentAdapterProps) {
  const { progressPercent } = useFDraftThemeRenderContext();
  return (
    <div style={style} className="flex flex-col gap-1.5">
      <Progress value={progressPercent} aria-label={copy.accessibleLabel} />
      <span className="text-muted-foreground text-xs tabular-nums">
        {copy.statusLabel}
      </span>
    </div>
  );
}

function PointsCounterAdapter({ style, copy }: ComponentAdapterProps) {
  const { pointsBalance } = useFDraftThemeRenderContext();
  return (
    <div style={style}>
      <PointsCard
        icon={Coins}
        label={copy.unitLabel}
        value={pointsBalance ?? 0}
      />
    </div>
  );
}

/**
 * FDraft's real adapter registry — implements exactly
 * `FDRAFT_SUPPORTED_COMPONENT_KEYS` (see `compatibility.ts`), the single
 * source of truth for which keys this host actually supports. Never
 * import `@fdraft/theme-renderer`'s own `createSampleComponentAdapterRegistry`
 * from FDraft — that registry is fixture-lab/Studio demo material only,
 * per its own doc comment.
 */
export const fdraftComponentAdapterRegistry: ComponentAdapterRegistry = {
  "page-title": PageTitleAdapter,
  "event-information": EventInformationAdapter,
  "event-countdown": EventCountdownAdapter,
  "draft-controls": DraftControlsAdapter,
  "film-grid": FilmGridAdapter,
  "event-progress": EventProgressAdapter,
  "points-counter": PointsCounterAdapter,
};

/**
 * FDraft's real copy-slot declarations — one entry per key in
 * `fdraftComponentAdapterRegistry`, matching the shared fixture's own
 * declared shape exactly (see `@fdraft/theme-renderer`'s
 * `SAMPLE_COPY_CONTRACTS`) so a theme authored against the shared fixture
 * needs no changes to render correctly against FDraft's real adapters.
 */
export const fdraftComponentCopyContractRegistry: ComponentCopyContractRegistry =
  {
    "page-title": [
      {
        key: "title",
        label: "Title",
        defaultText: "Sample Event Title",
        required: true,
        maxLength: 80,
        accessibleNameFallback: "Event title",
      },
    ],
    "event-information": [
      {
        key: "eventName",
        label: "Event name",
        defaultText: "Sample Event",
        required: true,
        maxLength: 60,
        allowedPlaceholders: ["eventName"],
      },
      {
        key: "dateRange",
        label: "Date range",
        defaultText: "Runs 1 Oct – 31 Oct (sample dates)",
        required: false,
        maxLength: 80,
        allowedPlaceholders: ["eventDate"],
      },
    ],
    "event-countdown": [
      {
        key: "accessibleLabel",
        label: "Accessible label",
        defaultText: "Time remaining until the event ends",
        required: true,
        maxLength: 100,
        accessibleNameFallback: "Event countdown",
      },
    ],
    "draft-controls": [
      {
        key: "skipLabel",
        label: "Skip button",
        defaultText: "Skip",
        required: true,
        maxLength: 20,
      },
      {
        key: "confirmLabel",
        label: "Confirm button",
        defaultText: "Confirm pick",
        required: true,
        maxLength: 20,
      },
      {
        key: "accessibleLabel",
        label: "Confirm accessible label",
        defaultText: "Confirm your film pick",
        required: true,
        maxLength: 80,
      },
    ],
    "film-grid": [],
    "event-progress": [
      {
        key: "statusLabel",
        label: "Status text",
        defaultText: "{{progress}}% complete",
        required: true,
        maxLength: 60,
        allowedPlaceholders: ["progress", "watchedCount", "targetCount"],
      },
      {
        key: "accessibleLabel",
        label: "Accessible label",
        defaultText: "Event completion progress",
        required: true,
        maxLength: 80,
      },
    ],
    "points-counter": [
      {
        key: "unitLabel",
        label: "Unit label",
        defaultText: "pts",
        required: true,
        maxLength: 20,
      },
      {
        key: "accessibleLabel",
        label: "Accessible label",
        defaultText: "Your points",
        required: true,
        maxLength: 60,
      },
    ],
  } satisfies Record<
    (typeof FDRAFT_SUPPORTED_COMPONENT_KEYS)[number],
    ComponentCopyContractRegistry[string]
  >;
