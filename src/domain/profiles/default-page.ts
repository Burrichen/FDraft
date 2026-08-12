/**
 * The profile-scoped "which page FDraft opens to" preference (see
 * docs/product-spec.md, "DEFAULT START PAGE SETTING", "ROOT ROUTING").
 */

export type DefaultPage = "watchlist" | "drafts" | "history" | "stats";

/** Required fallback — see docs/product-spec.md: "If the setting is missing or invalid, default to: Watchlist." */
export const DEFAULT_PAGE_FALLBACK: DefaultPage = "watchlist";

export const DEFAULT_PAGE_OPTIONS: { value: DefaultPage; label: string }[] = [
  { value: "watchlist", label: "Watchlist" },
  { value: "drafts", label: "Drafts" },
  { value: "history", label: "History" },
  { value: "stats", label: "Stats" },
];

export function isDefaultPage(value: unknown): value is DefaultPage {
  return (
    typeof value === "string" &&
    DEFAULT_PAGE_OPTIONS.some((option) => option.value === value)
  );
}

/**
 * Normalizes a profile's stored `defaultPage` setting to a valid
 * `DefaultPage`, falling back to the required default when it's missing
 * (an older profile record predating this setting) or invalid (a stale
 * value some future removed page left behind). Every reader of this
 * setting — the root route included — must route through this rather
 * than trusting the stored value directly.
 */
export function resolveDefaultPage(value: unknown): DefaultPage {
  return isDefaultPage(value) ? value : DEFAULT_PAGE_FALLBACK;
}

/**
 * Where the root route ("/") should send the user for a given resolved
 * `DefaultPage` — see docs/product-spec.md, "ROOT ROUTING". Kept as its
 * own pure mapping (rather than inlined at the one call site) so a
 * changed route for one of these pages only ever needs updating here.
 */
export function defaultPagePath(page: DefaultPage): string {
  switch (page) {
    case "watchlist":
      return "/watchlist";
    case "drafts":
      return "/drafts";
    case "history":
      return "/drafts/history";
    case "stats":
      return "/stats";
  }
}
