import { Gift, Star, TreePine } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import type { EventDefinition } from "@/domain/events/event-definition";

/**
 * One feature-list marker per Christmas colour role, cycled in order (see
 * docs/updates, "FDRAFT UPDATE 1 — CHRISTMAS DRAFT DIFFICULTIES + VISUAL
 * POLISH" §12: "alternate subtle red/green/blue highlights/icons/borders").
 *
 * Cycled rather than mapped per-bullet on purpose: the bullets themselves
 * are approved copy that a future edit may add to or reorder, and a
 * hardcoded colour-per-bullet table would either break or need editing
 * alongside it. Three markers over however many bullets exist keeps the
 * alternation working for any count.
 */
const FEATURE_MARKERS: Array<{
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  className: string;
}> = [
  { Icon: Star, className: "text-christmas-red bg-christmas-red/12" },
  { Icon: TreePine, className: "text-christmas-green bg-christmas-green/12" },
  { Icon: Gift, className: "text-christmas-winter bg-christmas-winter/12" },
];

/**
 * Christmas's own rich join-modal body (see docs/updates, "FDRAFT UPDATE 1
 * — CHRISTMAS DRAFT DIFFICULTIES + VISUAL POLISH" §12/§13), rendered by
 * `EventIntroDialog` through the same generic
 * `EventVisualTheme.renderIntroContent` hook Halloween already uses — so
 * this stays the only Christmas-specific file involved and the shared
 * dialog gains no per-event branch.
 *
 * COPY IS NOT AUTHORED HERE. Every sentence and bullet comes straight out
 * of the event's own approved `intro.description`/`intro.bullets`
 * (§12: "Keep its existing approved text EXACTLY. Do not rewrite the
 * copy."), read from the definition rather than hand-copied, so it is
 * structurally impossible for this presentation layer to drift from — or
 * quietly reword — the approved strings. The only text this file
 * contributes is the "<year> FDraft Holiday Celebration" subtitle and the
 * "Featuring:" label, both purely structural.
 *
 * Colour use follows §10's unequal hierarchy and §13's restraint: SNOW is
 * the body and the subtitle (highly readable, warm-white, and the primary
 * accent role), the year itself takes the cool WINTER blue, and the
 * feature markers cycle red/green/blue at low opacity. No rainbow text,
 * no per-word recolouring, no glow, no saturated background fill, no
 * novelty font — the modal underneath is still plainly FDraft.
 */
export function renderChristmasIntroContent({
  event,
  occurrenceYear,
}: {
  event: EventDefinition;
  occurrenceYear: number | null;
}) {
  return (
    // One wrapper with explicit vertical rhythm — the dialog places
    // `renderIntroContent`'s output as siblings, so without this the
    // subtitle, body, feature list and footer note all sat flush against
    // each other (§12 asks for Halloween's modal as the baseline for
    // spacing, and Halloween gets away with none only because its own
    // copy is far longer).
    <div className="space-y-4">
      {occurrenceYear !== null ? (
        <p className="text-christmas-snow text-center text-sm font-semibold tracking-wide sm:text-base">
          <span className="text-christmas-winter tabular-nums">
            {occurrenceYear}
          </span>{" "}
          FDraft Holiday Celebration
        </p>
      ) : null}

      <p className="text-christmas-snow text-base leading-relaxed sm:text-lg">
        {event.intro.description}
      </p>

      <div className="space-y-2">
        <h3 className="text-foreground text-sm font-bold sm:text-base">
          Featuring:
        </h3>
        <ul className="space-y-2">
          {event.intro.bullets.map((bullet, index) => {
            const marker = FEATURE_MARKERS[index % FEATURE_MARKERS.length];
            return (
              <li
                key={bullet}
                className="text-foreground flex items-start gap-2.5 text-sm sm:text-base"
              >
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${marker.className}`}
                >
                  <marker.Icon className="size-3" />
                </span>
                <span>{bullet}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <p className="text-muted-foreground text-xs">
        Not ready? This isn&apos;t permanent — you can still opt in later from
        Settings while it&apos;s available.
      </p>
    </div>
  );
}
