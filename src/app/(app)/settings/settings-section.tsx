import type { ReactNode } from "react";

/**
 * The named section wrapper every group of Settings cards renders under
 * (see docs/updates, "SETTINGS INFORMATION ARCHITECTURE REBUILD" §1/§13) —
 * a small uppercase kicker heading plus an optional one-line description,
 * with its cards stacked below at normal reading spacing. Deliberately NOT
 * a `Card` itself — a section can hold one card or several related ones
 * (e.g. "Watchlist & Metadata" holds both Metadata and Re-import), and
 * wrapping them all in a second, redundant border would be exactly the
 * "dozens of heavy borders" this rebuild is meant to remove.
 */
export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="space-y-3">
      <div>
        <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          {title}
        </h2>
        {description ? (
          <p className="text-muted-foreground mt-1 text-sm">{description}</p>
        ) : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
