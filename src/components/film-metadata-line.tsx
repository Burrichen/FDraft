interface FilmMetadataLineProps {
  releaseYear: number | null;
  runtimeMinutes: number | null;
  averageRating: number | null;
}

/**
 * The year/runtime/rating line shown under a film's title on both the
 * Watchlist and Draft film cards (see docs/product-spec.md, "GENERAL
 * VISUAL POLISH" — "metadata that visually blends together"). Year and
 * runtime stay in the muted tone since they're secondary context; the
 * rating renders at full foreground contrast so the one number most worth
 * a glance doesn't blend in with the rest.
 */
export function FilmMetadataLine({
  releaseYear,
  runtimeMinutes,
  averageRating,
}: FilmMetadataLineProps) {
  const context = [
    releaseYear ? String(releaseYear) : null,
    runtimeMinutes ? `${runtimeMinutes} min` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");

  if (!context && averageRating === null) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5 text-xs">
      {context ? (
        <span className="text-muted-foreground">{context}</span>
      ) : null}
      {context && averageRating !== null ? (
        <span className="text-muted-foreground/70" aria-hidden="true">
          ·
        </span>
      ) : null}
      {averageRating !== null ? (
        <span className="text-foreground font-medium">
          ★ {averageRating.toFixed(1)}
        </span>
      ) : null}
    </div>
  );
}
