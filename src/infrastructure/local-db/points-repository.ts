import { POINT_CURRENCIES } from "@/domain/events/point-currency";
import type { PointsRepository } from "@/repositories/points-repository";
import type { PointBalanceRecord, PointCurrency } from "@/repositories/records";
import type { FDraftLocalDatabase } from "./database";

export class LocalPointsRepository implements PointsRepository {
  constructor(private readonly db: FDraftLocalDatabase) {}

  async getBalance(
    profileId: string,
    currency: PointCurrency,
  ): Promise<number> {
    const row = await this.db.pointBalances.get([profileId, currency]);
    return row?.total ?? 0;
  }

  async getAllBalances(
    profileId: string,
  ): Promise<Record<PointCurrency, number>> {
    const rows = await this.db.pointBalances
      .where("profileId")
      .equals(profileId)
      .toArray();
    const balances = Object.fromEntries(
      POINT_CURRENCIES.map((currency) => [currency, 0]),
    ) as Record<PointCurrency, number>;
    for (const row of rows) {
      balances[row.currency] = row.total;
    }
    return balances;
  }

  async listBalances(profileId: string): Promise<PointBalanceRecord[]> {
    return this.db.pointBalances.where("profileId").equals(profileId).toArray();
  }

  async setBalance(record: PointBalanceRecord): Promise<void> {
    await this.db.pointBalances.put(record);
  }
}
