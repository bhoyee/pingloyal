import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DateTime } from 'luxon';

export interface ReconciliationSummary {
  totalTransactions: number;
  totalAmountLogged: number;
  totalPointsIssued: number;
  expectedPoints: number;
  pointsDiscrepancy: number;
  terminalVerifiedCount: number;
  terminalVerifiedAmount: number;
  manualEntryCount: number;
  manualEntryAmount: number;
  manualEntryPercent: number;
}

export interface CashierBreakdown {
  cashierId: string | null;
  cashierName: string;
  transactionCount: number;
  totalAmount: number;
  averageAmount: number;
  manualEntryCount: number;
  percentageOfStoreTotal: number;
  flagged: boolean;
}

export interface RedemptionLogEntry {
  redeemedAt: string;
  customerName: string;
  pointsRedeemed: number;
  rewardValue: number;
  cashierName: string;
}

export interface ReconciliationResult {
  period: { start: string; end: string };
  summary: ReconciliationSummary;
  redemptions: {
    totalRedemptions: number;
    totalPointsRedeemed: number;
    totalValueGivenOut: number;
  };
  cashierBreakdown: CashierBreakdown[];
  redemptionLog: RedemptionLogEntry[];
}

export interface ReconciliationQuery {
  startDate?: string;
  endDate?: string;
}

// Sources from automated/verified integrations — counted as "terminal-verified"
const TERMINAL_SOURCES = ['webhook', 'api_pull', 'file_import'];

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getReport(
    tenantId: string,
    query: ReconciliationQuery,
  ): Promise<ReconciliationResult> {
    const today = DateTime.now();
    const end = query.endDate
      ? DateTime.fromISO(query.endDate).endOf('day')
      : today.endOf('day');
    const start = query.startDate
      ? DateTime.fromISO(query.startDate).startOf('day')
      : today.startOf('day');

    const endIso = end.toISO() ?? end.toFormat("yyyy-MM-dd'T'HH:mm:ss");
    const startIso = start.toISO() ?? start.toFormat("yyyy-MM-dd'T'HH:mm:ss");

    // ── 1. Tenant earn rate ───────────────────────────────────────────────────
    const [tenantRow] = await this.dataSource.query<
      { points_earn_rate: string }[]
    >(`SELECT points_earn_rate FROM tenants WHERE id = $1`, [tenantId]);
    const pointsEarnRate = tenantRow ? Number(tenantRow.points_earn_rate) : 1;

    // ── 2. Transaction aggregate ──────────────────────────────────────────────
    const [txAgg] = await this.dataSource.query<
      {
        total_transactions: string;
        total_amount: string;
        total_points: string;
        terminal_count: string;
        terminal_amount: string;
        manual_count: string;
        manual_amount: string;
      }[]
    >(
      `SELECT
         COUNT(*)                                                                  AS total_transactions,
         COALESCE(SUM(amount), 0)                                                 AS total_amount,
         COALESCE(SUM(points_earned), 0)                                          AS total_points,
         COUNT(*)        FILTER (WHERE source = ANY($4::text[]))                  AS terminal_count,
         COALESCE(SUM(amount) FILTER (WHERE source = ANY($4::text[])), 0)        AS terminal_amount,
         COUNT(*)        FILTER (WHERE NOT (source = ANY($4::text[])))            AS manual_count,
         COALESCE(SUM(amount) FILTER (WHERE NOT (source = ANY($4::text[]))), 0) AS manual_amount
       FROM transactions
       WHERE tenant_id = $1
         AND created_at >= $2
         AND created_at <= $3`,
      [tenantId, startIso, endIso, TERMINAL_SOURCES],
    );

    const totalTransactions = parseInt(txAgg?.total_transactions ?? '0', 10);
    const totalAmount = Number(txAgg?.total_amount ?? 0);
    const totalPoints = parseInt(txAgg?.total_points ?? '0', 10);
    const terminalCount = parseInt(txAgg?.terminal_count ?? '0', 10);
    const terminalAmount = Number(txAgg?.terminal_amount ?? 0);
    const manualCount = parseInt(txAgg?.manual_count ?? '0', 10);
    const manualAmount = Number(txAgg?.manual_amount ?? 0);

    const expectedPoints =
      pointsEarnRate > 0 ? Math.floor(totalAmount / pointsEarnRate) : 0;
    const manualEntryPercent =
      totalTransactions > 0
        ? Math.round((manualCount / totalTransactions) * 100)
        : 0;

    // ── 3. Per-cashier breakdown ──────────────────────────────────────────────
    const cashierRows = await this.dataSource.query<
      {
        cashier_id: string | null;
        cashier_name: string | null;
        transaction_count: string;
        total_amount: string;
        average_amount: string;
        manual_count: string;
      }[]
    >(
      `SELECT
         t.logged_by_user_id                                                        AS cashier_id,
         COALESCE(u.full_name, 'System')                                            AS cashier_name,
         COUNT(*)                                                                    AS transaction_count,
         COALESCE(SUM(t.amount), 0)                                                AS total_amount,
         COALESCE(AVG(t.amount), 0)                                                AS average_amount,
         COUNT(*) FILTER (WHERE NOT (t.source = ANY($4::text[])))                   AS manual_count
       FROM transactions t
       LEFT JOIN users u ON u.id = t.logged_by_user_id
       WHERE t.tenant_id = $1
         AND t.created_at >= $2
         AND t.created_at <= $3
       GROUP BY t.logged_by_user_id, u.full_name
       ORDER BY total_amount DESC`,
      [tenantId, startIso, endIso, TERMINAL_SOURCES],
    );

    // Store-wide average used for the flagging threshold
    const storeAvg = totalTransactions > 0 ? totalAmount / totalTransactions : 0;

    const cashierBreakdown: CashierBreakdown[] = cashierRows.map((row) => {
      const txCount = parseInt(row.transaction_count, 10);
      const rowTotal = Number(row.total_amount);
      const rowAvg = Number(row.average_amount);
      const rowManual = parseInt(row.manual_count, 10);
      const rowManualPct = txCount > 0 ? (rowManual / txCount) * 100 : 0;

      return {
        cashierId: row.cashier_id ?? null,
        cashierName: row.cashier_name ?? 'Unknown',
        transactionCount: txCount,
        totalAmount: rowTotal,
        averageAmount: rowAvg,
        manualEntryCount: rowManual,
        percentageOfStoreTotal:
          totalAmount > 0 ? Math.round((rowTotal / totalAmount) * 100) : 0,
        // Flagged when average is >40% below store average OR manual entry rate is very high
        flagged: rowAvg < storeAvg * 0.6 || rowManualPct > 70,
      };
    });

    // ── 4 & 5. Redemptions (gracefully degrade if table is absent) ────────────
    let redemptionTotals = {
      totalRedemptions: 0,
      totalPointsRedeemed: 0,
      totalValueGivenOut: 0,
    };
    let redemptionLog: RedemptionLogEntry[] = [];

    try {
      const [redAgg] = await this.dataSource.query<
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

      if (redAgg) {
        redemptionTotals = {
          totalRedemptions: parseInt(redAgg.total, 10),
          totalPointsRedeemed: parseInt(redAgg.points_redeemed, 10),
          totalValueGivenOut: Number(redAgg.reward_value),
        };
      }

      const logRows = await this.dataSource.query<
        {
          redeemed_at: string;
          customer_name: string;
          points_redeemed: string;
          reward_value: string;
          cashier_name: string;
        }[]
      >(
        `SELECT
           r.redeemed_at,
           c.full_name  AS customer_name,
           r.points_redeemed,
           r.value      AS reward_value,
           u.full_name  AS cashier_name
         FROM redemptions r
         JOIN customers c ON c.id = r.customer_id
         JOIN users u     ON u.id = r.cashier_id
         WHERE r.tenant_id = $1
           AND r.redeemed_at >= $2
           AND r.redeemed_at <= $3
         ORDER BY r.redeemed_at DESC`,
        [tenantId, startIso, endIso],
      );

      redemptionLog = logRows.map((row) => ({
        redeemedAt: row.redeemed_at,
        customerName: row.customer_name,
        pointsRedeemed: parseInt(row.points_redeemed, 10),
        rewardValue: Number(row.reward_value),
        cashierName: row.cashier_name,
      }));
    } catch (err) {
      this.logger.warn(
        `Redemptions query failed for tenant=${tenantId}: ${String(err)}`,
      );
    }

    return {
      period: {
        start: start.toISODate() ?? start.toFormat('yyyy-MM-dd'),
        end: end.toISODate() ?? end.toFormat('yyyy-MM-dd'),
      },
      summary: {
        totalTransactions,
        totalAmountLogged: totalAmount,
        totalPointsIssued: totalPoints,
        expectedPoints,
        pointsDiscrepancy: totalPoints - expectedPoints,
        terminalVerifiedCount: terminalCount,
        terminalVerifiedAmount: terminalAmount,
        manualEntryCount: manualCount,
        manualEntryAmount: manualAmount,
        manualEntryPercent: manualEntryPercent,
      },
      redemptions: redemptionTotals,
      cashierBreakdown,
      redemptionLog,
    };
  }
}
