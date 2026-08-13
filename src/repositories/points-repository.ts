import type { PointBalanceRecord, PointCurrency } from "./records";

/**
 * A profile's running totals for every permanent point currency (see
 * docs/product-spec.md, event system Phase 4) — `PointBalanceRecord`'s
 * repository, exactly like `WatchlistRepository`/`HistoryRepository` are
 * for their own records. Reads always resolve to a number, never
 * `null`/`undefined` — a currency a profile has never earned any of is
 * simply 0, not a missing state a caller needs to handle separately (see
 * docs/product-spec.md, "Existing saves must load safely with new totals
 * defaulting to 0").
 */
export interface PointsRepository {
  getBalance(profileId: string, currency: PointCurrency): Promise<number>;
  getAllBalances(profileId: string): Promise<Record<PointCurrency, number>>;
  /** The raw rows a profile actually has — only currencies it's ever earned any of, unlike `getAllBalances`'s always-complete map. For backup export, where an absent currency should stay absent rather than round-tripping as an explicit zero row. */
  listBalances(profileId: string): Promise<PointBalanceRecord[]>;
  setBalance(record: PointBalanceRecord): Promise<void>;
}
