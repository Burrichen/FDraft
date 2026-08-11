/**
 * Wraps a statistic that may not be computable from available data (see
 * docs/product-spec.md, "Statistics" — "Do not render meaningless 'N/A'
 * dashboards full of missing statistics. Hide or gracefully omit unsupported
 * cards."). UI code should render nothing (or omit the card entirely) for an
 * `unavailable` stat rather than showing a placeholder.
 */
export type Stat<T> =
  { available: true; value: T } | { available: false; reason: string };

export function availableStat<T>(value: T): Stat<T> {
  return { available: true, value };
}

export function unavailableStat<T>(reason: string): Stat<T> {
  return { available: false, reason };
}

/** True only when every input stat is available — useful for gating a composite card on several dependencies at once. */
export function allAvailable(stats: Stat<unknown>[]): boolean {
  return stats.every((stat) => stat.available);
}
