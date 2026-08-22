"use client";

import { Check, Film } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DiySelectableFilmView } from "./diy-film-card";

/**
 * A compact, poster-thumbnail film row with a select toggle — the shared
 * presentation both the "Need ideas?" recommendation lists (see
 * docs/updates, v1.1.0/v1.1.1) and the DIY Challenge Film picker (v1.1.1,
 * "DIY Challenge Film") use, so a second card system was never built for
 * the latter. Purely a display + a click forwarder — same discipline as
 * `DiyFilmCard`: never mutates anything itself, only ever calls `onToggle`.
 */
export function DiyCompactFilmRow({
  film,
  selected,
  onToggle,
  subtitle,
}: {
  film: DiySelectableFilmView;
  selected: boolean;
  onToggle: (entryId: string) => void;
  /** A short "why this qualified"/context line shown under the title, e.g. "★ 4.5" or "92 min". Omit for a plain title-only row. */
  subtitle?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onToggle(film.entryId)}
      className={cn(
        "focus-visible:outline-ring flex w-full items-center gap-2 rounded-md border p-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2",
        selected
          ? "border-primary bg-secondary"
          : "hover:bg-muted border-transparent",
      )}
    >
      <div className="bg-muted relative aspect-2/3 w-8 shrink-0 overflow-hidden rounded-sm">
        {film.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- posters are external, remote URLs from third-party providers
          <img
            src={film.posterUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="text-muted-foreground flex h-full w-full items-center justify-center">
            <Film aria-hidden="true" className="size-3" />
          </div>
        )}
      </div>
      <span className="min-w-0 flex-1">
        <span className="text-foreground block truncate text-xs">
          {film.title}
          {film.releaseYear ? ` (${film.releaseYear})` : ""}
        </span>
        {subtitle ? (
          <span className="text-muted-foreground block truncate text-[0.65rem]">
            {subtitle}
          </span>
        ) : null}
      </span>
      {selected ? (
        <Check aria-hidden="true" className="text-primary size-3.5 shrink-0" />
      ) : null}
    </button>
  );
}
