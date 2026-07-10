import { Injectable } from '@nestjs/common';
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
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getReport(
    tenantId: string,
    query: ReconciliationQuery,
  ): Promise<ReconciliationResult> {
    const endDate = query.endDate
      ? DateTime.fromISO(query.endDate).endOf('day').toISO()!
      : DateTime.now().endOf('day').toISO();
    const startDate = query.startDate
      ? DateTime.fromISO(query.startDate).startOf('day').toISO()!
      : DateTime.now().minus({ days: 29 }).startOf('day').toISO();

    const [txRows, redemptionRow] = await Promise.all([
      this.dataSource.query<
        { source: string; count: string; revenue: string; points: string }[]
      >(
        `SELECT
           source,
           COUNT(*) AS count,
           COALESCE(SUM(amount), 0)        AS revenue,
           COALESCE(SUM(points_earned), 0) AS points
         FROM transactions
         WHERE tenant_id = $1
           AND created_at >= $2
           AND created_at <= $3
         GROUP BY source`,
        [tenantId, startDate, endDate],
      ),
      this.dataSource.query<
        {
          total: string;
          points_redeemed: string;
          reward_value: string;
        }[]
      >(
        `SELECT
           COUNT(*)                          AS total,
           COALESCE(SUM(points_redeemed), 0) AS points_redeemed,
           COALESCE(SUM(value), 0)           AS reward_value
         FROM redemptions
         WHERE tenant_id = $1
           AND redeemed_at >= $2
           AND redeemed_at <= $3`,
        [tenantId, startDate, endDate],
      ),
    ]);

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

    const r = redemptionRow[0] ?? {
      total: '0',
      points_redeemed: '0',
      reward_value: '0',
    };

    return {
      period: {
        startDate: DateTime.fromISO(startDate).toISODate()!,
        endDate: DateTime.fromISO(endDate).toISODate()!,
      },
      transactions: {
        total: totalTx,
        totalRevenue,
        totalPointsIssued: totalPoints,
        bySource,
      },
      redemptions: {
        total: parseInt(r.total, 10),
        totalPointsRedeemed: parseInt(r.points_redeemed, 10),
        totalRewardValue: Number(r.reward_value),
      },
    };
  }
}
