import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DateTime } from 'luxon';
import { TransactionSource } from '@pingloyal/types';

export interface SourceBreakdown {
  count: number;
  revenue: number;
  points: number;
}

export interface ReconciliationResult {
  period: { startDate: string; endDate: string };
  transactions: {
    total: number;
    totalRevenue: number;
    totalPointsIssued: number;
    bySource: Record<TransactionSource, SourceBreakdown>;
  };
  redemptions: {
    total: number;
    totalPointsRedeemed: number;
    totalRewardValue: number;
  };
}

export interface ReconciliationQuery {
  startDate?: string;
  endDate?: string;
}

const EMPTY_BREAKDOWN: SourceBreakdown = { count: 0, revenue: 0, points: 0 };

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getReport(
    tenantId: string,
    query: ReconciliationQuery,
  ): Promise<ReconciliationResult> {
    const end = query.endDate
      ? DateTime.fromISO(query.endDate).endOf('day')
      : DateTime.now().endOf('day');
    const start = query.startDate
      ? DateTime.fromISO(query.startDate).startOf('day')
      : DateTime.now().minus({ days: 29 }).startOf('day');

    const endIso = end.toISO() ?? end.toFormat("yyyy-MM-dd'T'HH:mm:ss");
    const startIso = start.toISO() ?? start.toFormat("yyyy-MM-dd'T'HH:mm:ss");

    const txRows = await this.dataSource.query<
      { source: string; count: string; revenue: string; points: string }[]
    >(
      `SELECT
         source,
         COUNT(*)                        AS count,
         COALESCE(SUM(amount), 0)        AS revenue,
         COALESCE(SUM(points_earned), 0) AS points
       FROM transactions
       WHERE tenant_id = $1
         AND created_at >= $2
         AND created_at <= $3
       GROUP BY source`,
      [tenantId, startIso, endIso],
    );

    let redemptionTotals = {
      total: 0,
      totalPointsRedeemed: 0,
      totalRewardValue: 0,
    };
    try {
      const rows = await this.dataSource.query<
        { total: string; points_redeemed: string; reward_value: string }[]
      >(
        `SELECT
           COUNT(*)                          AS total,
           COALESCE(SUM(points_redeemed), 0) AS points_redeemed,
           COALESCE(SUM(value), 0)           AS reward_value
         FROM redemptions
         WHERE tenant_id = $1
           AND redeemed_at >= $2
           AND redeemed_at <= $3`,
        [tenantId, startIso, endIso],
      );
      const r = rows[0];
      if (r) {
        redemptionTotals = {
          total: parseInt(r.total, 10),
          totalPointsRedeemed: parseInt(r.points_redeemed, 10),
          totalRewardValue: Number(r.reward_value),
        };
      }
    } catch (err) {
      this.logger.warn(
        `Redemptions query failed for tenant=${tenantId}: ${String(err)}`,
      );
    }

    const bySource: Record<TransactionSource, SourceBreakdown> = {
      [TransactionSource.CASHIER_APP]: { ...EMPTY_BREAKDOWN },
      [TransactionSource.WEBHOOK]: { ...EMPTY_BREAKDOWN },
      [TransactionSource.API_PULL]: { ...EMPTY_BREAKDOWN },
      [TransactionSource.FILE_IMPORT]: { ...EMPTY_BREAKDOWN },
    };

    let totalTx = 0;
    let totalRevenue = 0;
    let totalPoints = 0;

    for (const row of txRows) {
      const src = row.source as TransactionSource;
      if (bySource[src]) {
        const count = parseInt(row.count, 10);
        const revenue = Number(row.revenue);
        const points = parseInt(row.points, 10);
        bySource[src] = { count, revenue, points };
        totalTx += count;
        totalRevenue += revenue;
        totalPoints += points;
      }
    }

    return {
      period: {
        startDate: start.toISODate() ?? start.toFormat('yyyy-MM-dd'),
        endDate: end.toISODate() ?? end.toFormat('yyyy-MM-dd'),
      },
      transactions: {
        total: totalTx,
        totalRevenue,
        totalPointsIssued: totalPoints,
        bySource,
      },
      redemptions: redemptionTotals,
    };
  }
}
