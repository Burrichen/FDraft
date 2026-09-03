"use client";

import type {
  ComponentAdapterProps,
  ComponentAdapterRegistry,
  ComponentCopyContractRegistry,
} from "@fdraft/theme-renderer";
import { Coins, Eye, Loader2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { ActiveDraftFilms } from "@/components/drafts/active-draft-films";
import { DraftLifecycleView } from "@/components/drafts/draft-lifecycle-view";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PointsCard } from "@/components/stats/points-card";
import { archiveLocalDraftIfResolved } from "@/application/drafts/local-draft-service";
import { markLocalFilmWatched } from "@/application/watchlist/local-watchlist-service";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { useEventDiscovery } from "@/components/events/event-discovery-provider";
import { useEventOptInFlow } from "@/components/events/use-event-opt-in-flow";
import { useWatchUndo } from "@/components/watch-undo/watch-undo-provider";
import { resolveVisibleEventPages } from "@/application/events/event-discovery";
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

/** The profile's real overall/Lifetime Points balance — see `FDraftThemeRenderContextValue.lifetimePointsBalance`'s own doc comment for why this is NOT the same number `event-points-counter` shows. */
function PointsCounterAdapter({ style, copy }: ComponentAdapterProps) {
  const { lifetimePointsBalance } = useFDraftThemeRenderContext();
  return (
    <div style={style}>
      <PointsCard
        icon={Coins}
        label={copy.unitLabel}
        value={lifetimePointsBalance ?? 0}
      />
    </div>
  );
}

/** This event's own currency balance (e.g. Halloween's Haunted Points, January's Misery Points) — distinct from `points-counter`'s overall/Lifetime balance above. */
function EventPointsCounterAdapter({ style, copy }: ComponentAdapterProps) {
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

/** How many picks a draft currently has, distinct framing of the exact same real progress numbers `event-progress` renders (see `FDraftThemeRenderContextValue`'s own doc comments — `draft-progress` and `event-progress` are not two different data sources, only two different copy templates over one). */
function DraftProgressAdapter({ style, copy }: ComponentAdapterProps) {
  return (
    <div style={style} className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-xs tabular-nums">
        {copy.statusLabel}
      </span>
    </div>
  );
}

/**
 * A themed presentational card over the profile's real display name —
 * only the visual (`Avatar`/`AvatarFallback`, the same primitives
 * `ProfileMenu` itself uses) is reused; the real header's dropdown
 * (switch profile / settings) is deliberately NOT wrapped here, since a
 * theme places this anywhere on a page, not necessarily somewhere a
 * profile-switching menu would make sense — `useProfileContext()` is
 * already a real, existing app-wide context, so no new render-context
 * field is needed for this.
 */
function ProfileBadgeAdapter({ style, copy }: ComponentAdapterProps) {
  const { activeProfile } = useProfileContext();
  const initial = activeProfile?.displayName?.charAt(0).toUpperCase() ?? "?";
  return (
    <div style={style} aria-label={copy.accessibleLabel}>
      <Avatar>
        <AvatarFallback>{initial}</AvatarFallback>
      </Avatar>
    </div>
  );
}

/**
 * The real "opt into this event" action (`useEventOptInFlow`, the same
 * hook `EventSwitcherSection`/`EventIntroDialog` already call) — the one
 * generic, single-click, event-agnostic real action FDraft has for
 * getting a profile from "not yet participating" to "on the event's own
 * page," which is where the template places this key (Event Landing,
 * Join) — before a draft exists. Generating the draft ITSELF afterwards
 * still goes through the event's own real, multi-step creation flow
 * (`NewDraftForm`/`HalloweenDraftCreationView`), never re-implemented or
 * defaulted here — this button never invents draft settings on a theme
 * author's behalf.
 */
function GenerateDraftActionAdapter({
  style,
  copy,
  enabled,
}: ComponentAdapterProps) {
  const { eventId } = useFDraftThemeRenderContext();
  const { activeProfile, repositories } = useProfileContext();
  const { isSaving, beginOptIn } = useEventOptInFlow({
    profileId: activeProfile?.id ?? null,
    timezone: activeProfile?.timezone ?? null,
    repositories,
    onOptedIn: () => {},
    onError: (message) => toast.error(message),
  });
  return (
    <div style={style}>
      <Button
        type="button"
        disabled={!enabled || isSaving || !activeProfile}
        aria-label={copy.accessibleLabel}
        onClick={() => void beginOptIn(eventId)}
      >
        {isSaving ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : null}
        {copy.actionLabel}
      </Button>
    </div>
  );
}

/**
 * The real "mark this film watched" mutation (`markLocalFilmWatched`,
 * the exact same call `WatchToggle` itself makes) — never reimplemented,
 * only called with a themed button so `copy.actionLabel` is genuinely
 * shown (unlike `draft-controls`'s known `DraftLifecycleView`-owned-text
 * gap). Targets the current draft's first not-yet-watched film — a
 * single global action has no other real, well-defined target once
 * placed outside a per-film card, and "the next thing to watch" is a
 * plain derivation over already-real, host-supplied `films`, never a new
 * eligibility/business rule.
 */
function CompleteWatchActionAdapter({
  style,
  copy,
  enabled,
}: ComponentAdapterProps) {
  const { films } = useFDraftThemeRenderContext();
  const { activeProfile, repositories } = useProfileContext();
  const watchUndo = useWatchUndo();
  const [isPending, startTransition] = useTransition();
  // Only a film with a real watchlist entry can go through the generic
  // `markLocalFilmWatched` path — an `entryId: null` item (e.g. a
  // Halloween pool film with no watchlist entry) is a real, existing
  // FDraft case the eye control itself already hides for, per
  // `DraftFilmCardView.entryId`'s own doc comment; this adapter does the
  // same rather than inventing a second mutation path for it.
  const nextFilm =
    films.find((film) => !film.isCompleted && film.entryId !== null) ?? null;

  function handleClick() {
    const entryId = nextFilm?.entryId;
    if (
      !activeProfile ||
      !nextFilm ||
      entryId === null ||
      entryId === undefined
    )
      return;
    startTransition(async () => {
      const outcome = await markLocalFilmWatched(
        repositories,
        {
          profileId: activeProfile.id,
          watchlistEntryId: entryId,
          profileTimezone: activeProfile.timezone,
        },
        { archiveIfResolved: archiveLocalDraftIfResolved },
      );
      if (outcome.ok) {
        watchUndo.registerWatched({
          watchlistEntryId: outcome.watchlistEntryId,
          filmId: outcome.filmId,
          watchedHistoryId: outcome.watchedHistoryId,
          draftItemId: outcome.draftItemId,
          draftId: outcome.draftId,
          draftArchivedByThisAction: outcome.draftArchivedByThisAction,
          secondaryDraftCompletion: outcome.secondaryDraftCompletion,
        });
        toast.success(`Marked "${nextFilm.title}" as watched`);
      } else {
        toast.error("Could not mark this film as watched. Please try again.");
      }
    });
  }

  return (
    <div style={style}>
      <Button
        type="button"
        disabled={!enabled || isPending || !activeProfile || !nextFilm}
        aria-label={copy.accessibleLabel}
        onClick={handleClick}
      >
        {isPending ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : (
          <Eye aria-hidden="true" />
        )}
        {copy.actionLabel}
      </Button>
    </div>
  );
}

/**
 * Prev/next between the profile's currently VISIBLE events (real,
 * already-tested `resolveVisibleEventPages` — the exact same filter the
 * real nav bar uses) — genuinely new glue (no existing FDraft component
 * does prev/next specifically), but the underlying data/eligibility is
 * 100% real: no new participation/visibility rule is invented here.
 */
function EventNavigationAdapter({ style, copy }: ComponentAdapterProps) {
  const { eventId } = useFDraftThemeRenderContext();
  const { result } = useEventDiscovery();
  const router = useRouter();
  const visible = resolveVisibleEventPages(result.statuses);
  const index = visible.findIndex((status) => status.event.id === eventId);
  const previous = index > 0 ? visible[index - 1] : undefined;
  const next =
    index >= 0 && index < visible.length - 1 ? visible[index + 1] : undefined;

  return (
    <div
      style={style}
      className="flex items-center justify-between gap-2"
      aria-label={copy.accessibleLabel}
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!previous?.event.page}
        onClick={() => {
          if (previous?.event.page) router.push(previous.event.page.route);
        }}
      >
        {copy.previousLabel}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!next?.event.page}
        onClick={() => {
          if (next?.event.page) router.push(next.event.page.route);
        }}
      >
        {copy.nextLabel}
      </Button>
    </div>
  );
}

/** A theme-authored card — same minimal "wrap real copy in the real `Card` primitive" pattern `EventInformationAdapter` already uses; no event-specific host data is needed since both slots are theme-authored text, not dynamic values. */
function ChallengeCardAdapter({ style, copy }: ComponentAdapterProps) {
  return (
    <Card style={style} className="size-full">
      <CardHeader>
        <CardTitle>{copy.title}</CardTitle>
      </CardHeader>
      {copy.description ? (
        <CardContent>
          <p className="text-muted-foreground text-sm">{copy.description}</p>
        </CardContent>
      ) : null}
    </Card>
  );
}

/** Same reasoning as `ChallengeCardAdapter` — `headline`/`body` are theme-authored copy (`body`'s `{{eventName}}` placeholder is already substituted before this adapter ever sees it, via the renderer's own copy resolution), not real dynamic event data. */
function ResultsCompletionContentAdapter({
  style,
  copy,
}: ComponentAdapterProps) {
  return (
    <Card style={style} className="size-full">
      <CardHeader>
        <CardTitle>{copy.headline}</CardTitle>
      </CardHeader>
      {copy.body ? (
        <CardContent>
          <p className="text-muted-foreground text-sm">{copy.body}</p>
        </CardContent>
      ) : null}
    </Card>
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
  "generate-draft-action": GenerateDraftActionAdapter,
  "profile-badge": ProfileBadgeAdapter,
  "event-navigation": EventNavigationAdapter,
  "draft-progress": DraftProgressAdapter,
  "complete-watch-action": CompleteWatchActionAdapter,
  "challenge-card": ChallengeCardAdapter,
  "results-completion-content": ResultsCompletionContentAdapter,
  "event-points-counter": EventPointsCounterAdapter,
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
    "event-points-counter": [
      {
        key: "unitLabel",
        label: "Unit label",
        defaultText: "event pts",
        required: true,
        maxLength: 20,
      },
      {
        key: "accessibleLabel",
        label: "Accessible label",
        defaultText: "Your points for this event",
        required: true,
        maxLength: 60,
      },
    ],
    "profile-badge": [
      {
        key: "accessibleLabel",
        label: "Accessible label",
        defaultText: "Your profile",
        required: true,
        maxLength: 60,
      },
    ],
    "generate-draft-action": [
      {
        key: "actionLabel",
        label: "Button label",
        defaultText: "Generate My Draft",
        required: true,
        maxLength: 30,
      },
      {
        key: "accessibleLabel",
        label: "Accessible label",
        defaultText: "Generate my film draft",
        required: true,
        maxLength: 80,
      },
    ],
    "complete-watch-action": [
      {
        key: "actionLabel",
        label: "Button label",
        defaultText: "Mark as Watched",
        required: true,
        maxLength: 30,
      },
      {
        key: "accessibleLabel",
        label: "Accessible label",
        defaultText: "Mark this film as watched",
        required: true,
        maxLength: 80,
      },
    ],
    "challenge-card": [
      {
        key: "title",
        label: "Challenge title",
        defaultText: "Weekend Challenge",
        required: true,
        maxLength: 60,
      },
      {
        key: "description",
        label: "Description",
        defaultText: "Watch 3 films this weekend to earn a bonus.",
        required: false,
        maxLength: 200,
      },
    ],
    "results-completion-content": [
      {
        key: "headline",
        label: "Headline",
        defaultText: "You're all caught up!",
        required: true,
        maxLength: 80,
      },
      {
        key: "body",
        label: "Body text",
        defaultText: "Thanks for taking part — check back next event for more.",
        required: false,
        maxLength: 300,
        allowedPlaceholders: ["eventName"],
      },
    ],
    "event-navigation": [
      {
        key: "previousLabel",
        label: "Previous label",
        defaultText: "Previous",
        required: true,
        maxLength: 30,
      },
      {
        key: "nextLabel",
        label: "Next label",
        defaultText: "Next",
        required: true,
        maxLength: 30,
      },
      {
        key: "accessibleLabel",
        label: "Accessible label",
        defaultText: "Event navigation",
        required: true,
        maxLength: 60,
      },
    ],
    "draft-progress": [
      {
        key: "statusLabel",
        label: "Status text",
        defaultText: "{{picksMade}} of {{totalPicks}} picks made",
        required: true,
        maxLength: 60,
        allowedPlaceholders: ["progress", "targetCount", "watchedCount"],
      },
    ],
  } satisfies Record<
    (typeof FDRAFT_SUPPORTED_COMPONENT_KEYS)[number],
    ComponentCopyContractRegistry[string]
  >;
