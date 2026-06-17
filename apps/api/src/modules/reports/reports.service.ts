import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import ExcelJS from 'exceljs';
import type {
  ReportData,
  ReportPeriod,
  LoyaltySection,
  PointsSection,
  WhatsappSection,
  WalletSection,
  ContentSection,
} from '@pingloyal/types';
import { ReportPeriodType } from '@pingloyal/types';
import { ReportSnapshot } from './entities/report-snapshot.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { Subscription } from '../billing/entities/subscription.entity';

// ── Message type categorisation ───────────────────────────────────────────────

const UTILITY_TYPES = new Set([
  'welcome',
  'purchase_confirmation',
  'threshold_nudge',
  'reward_unlocked',
  'balance_bot_reply',
  'wallet_low_balance',
  'wallet_zero',
]);

const MARKETING_TYPES = new Set([
  'birthday',
  'lapsed_winback',
  'campaign_message',
]);

// ── pdfmake types ─────────────────────────────────────────────────────────────

interface PdfMakeLib {
  createPdf: (docDefinition: unknown) => {
    getBuffer: (cb: (buf: Buffer) => void) => void;
  };
  vfs: Record<string, string>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPeriod(period: ReportPeriod): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  return `${fmt(period.start)} – ${fmt(period.end)}`;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ReportSnapshot)
    private readonly snapshotRepo: Repository<ReportSnapshot>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
  ) {}

  // ── getReport ─────────────────────────────────────────────────────────────

  async getReport(tenantId: string, period: ReportPeriod): Promise<ReportData> {
    let cached = await this.snapshotRepo.findOne({
      where: {
        tenantId,
        periodStart: period.start,
        periodEnd: period.end,
        periodType: period.type as ReportPeriodType,
      },
      order: { computedAt: 'DESC' },
    });

    if (cached) {
      const staleThreshold = new Date(Date.now() - 24 * 3600 * 1000);
      if (cached.computedAt < staleThreshold) {
        cached = null;
      }
    }

    if (cached) return cached.data as unknown as ReportData;
    return this.computeReport(tenantId, period);
  }

  // ── computeReport ─────────────────────────────────────────────────────────

  async computeReport(
    tenantId: string,
    period: ReportPeriod,
  ): Promise<ReportData> {
    const loyalty = await this.computeLoyaltySection(tenantId, period);
    const [points, whatsapp, wallet, content] = await Promise.all([
      this.computePointsSection(tenantId, period, loyalty.activeCustomers),
      this.computeWhatsappSection(tenantId, period),
      this.computeWalletSection(tenantId, period),
      this.computeContentSection(tenantId, period),
    ]);

    const report: ReportData = {
      period,
      generatedAt: new Date().toISOString(),
      loyalty,
      points,
      whatsapp,
      wallet,
      content,
    };

    await this.snapshotRepo.upsert(
      {
        tenantId,
        periodStart: period.start,
        periodEnd: period.end,
        periodType: period.type as ReportPeriodType,
        data: report as unknown as Record<string, unknown>,
        computedAt: new Date(),
      } as never,
      ['tenantId', 'periodStart', 'periodEnd', 'periodType'],
    );

    return report;
  }

  // ── computeLoyaltySection ─────────────────────────────────────────────────

  async computeLoyaltySection(
    tenantId: string,
    period: ReportPeriod,
  ): Promise<LoyaltySection> {
    const rows = await this.dataSource.query<
      Array<{
        total_customers: string;
        active_customers: string;
        new_customers: string;
        repeat_buyer_count: string;
        avg_visits: string | null;
      }>
    >(
      `WITH period_customers AS (
         SELECT id, created_at, last_purchase_at, purchase_count
         FROM customers
         WHERE tenant_id = $1 AND wa_opted_in = true
       ),
       active AS (
         SELECT COUNT(*) AS active_count
         FROM period_customers
         WHERE last_purchase_at >= $2
       ),
       new_customers AS (
         SELECT COUNT(*) AS new_count
         FROM period_customers
         WHERE created_at BETWEEN $2 AND $3
       ),
       repeat_buyers AS (
         SELECT customer_id
         FROM transactions
         WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3
         GROUP BY customer_id
         HAVING COUNT(*) >= 2
       )
       SELECT
         (SELECT COUNT(*) FROM period_customers)             AS total_customers,
         (SELECT active_count FROM active)                   AS active_customers,
         (SELECT new_count FROM new_customers)               AS new_customers,
         (SELECT COUNT(*) FROM repeat_buyers)                AS repeat_buyer_count,
         (SELECT AVG(purchase_count) FROM period_customers
          WHERE last_purchase_at >= $2)                      AS avg_visits`,
      [tenantId, period.start, period.end],
    );

    const r = rows[0];
    const totalCustomers = Number(r.total_customers);
    const activeCustomers = Number(r.active_customers);
    const repeatBuyerCount = Number(r.repeat_buyer_count);

    const weeklyRows = await this.dataSource.query<
      Array<{ week: string; count: string }>
    >(
      `SELECT DATE_TRUNC('week', created_at)::date AS week, COUNT(*) AS count
       FROM customers
       WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3
       GROUP BY week ORDER BY week`,
      [tenantId, period.start, period.end],
    );

    // Previous period for vsLastPeriod
    const prevStart = new Date(
      period.start.getTime() - period.durationDays * 24 * 3600 * 1000,
    );
    const prevEnd = new Date(period.start.getTime() - 1);
    const prevRows = await this.dataSource.query<
      Array<{
        total_customers: string;
        active_customers: string;
        avg_visits: string | null;
      }>
    >(
      `SELECT
         COUNT(*) AS total_customers,
         SUM(CASE WHEN last_purchase_at BETWEEN $2 AND $3 THEN 1 ELSE 0 END) AS active_customers,
         AVG(CASE WHEN last_purchase_at BETWEEN $2 AND $3 THEN purchase_count ELSE NULL END) AS avg_visits
       FROM customers
       WHERE tenant_id = $1 AND wa_opted_in = true AND created_at <= $3`,
      [tenantId, prevStart, prevEnd],
    );
    const prevTotal = Number(prevRows[0]?.total_customers ?? 0);
    const prevActive = Number(prevRows[0]?.active_customers ?? 0);
    const prevActiveRate =
      prevTotal > 0 ? Math.round((prevActive / prevTotal) * 100) : 0;
    const prevAvgVisits = prevRows[0]?.avg_visits
      ? Math.round(Number(prevRows[0].avg_visits) * 10) / 10
      : 0;

    return {
      totalCustomers,
      activeCustomers,
      inactiveCustomers: Math.max(0, totalCustomers - activeCustomers),
      newCustomersThisMonth: Number(r.new_customers),
      retentionRate: Math.round(
        (repeatBuyerCount / Math.max(totalCustomers, 1)) * 100,
      ),
      avgVisitsPerCustomer: r.avg_visits
        ? Math.round(Number(r.avg_visits) * 10) / 10
        : 0,
      weeklyNewCustomers: weeklyRows.map((w) => ({
        week: String(w.week),
        count: Number(w.count),
      })),
      vsLastPeriod: {
        totalCustomers: prevTotal,
        activeRate: prevActiveRate,
        avgVisitsPerCustomer: prevAvgVisits,
      },
    };
  }

  // ── computePointsSection ──────────────────────────────────────────────────

  async computePointsSection(
    tenantId: string,
    period: ReportPeriod,
    activeCustomers: number,
  ): Promise<PointsSection> {
    const prevStart = new Date(
      period.start.getTime() - period.durationDays * 24 * 3600 * 1000,
    );
    const prevEnd = new Date(period.start.getTime() - 1);

    const [
      [issuedRow],
      [redeemedRow],
      [nearRewardRow],
      dailyRows,
      [prevIssuedRow],
    ] = await Promise.all([
      this.dataSource.query<Array<{ issued: string }>>(
        `SELECT COALESCE(SUM(delta), 0) AS issued
           FROM points_ledger
           WHERE tenant_id = $1 AND delta > 0 AND created_at BETWEEN $2 AND $3`,
        [tenantId, period.start, period.end],
      ),
      this.dataSource.query<Array<{ redeemed: string }>>(
        `SELECT COALESCE(ABS(SUM(delta)), 0) AS redeemed
           FROM points_ledger
           WHERE tenant_id = $1 AND delta < 0 AND reason = 'redemption'
           AND created_at BETWEEN $2 AND $3`,
        [tenantId, period.start, period.end],
      ),
      this.dataSource.query<Array<{ near_reward: string }>>(
        `SELECT COUNT(*) AS near_reward
           FROM customers
           WHERE tenant_id = $1 AND wa_opted_in = true
           AND points_balance >= (
             SELECT points_threshold FROM tenants WHERE id = $1
           ) * 0.8`,
        [tenantId],
      ),
      this.dataSource.query<Array<{ date: string; amount: string }>>(
        `SELECT DATE(created_at) AS date, SUM(delta) AS amount
           FROM points_ledger
           WHERE tenant_id = $1 AND delta > 0 AND created_at BETWEEN $2 AND $3
           GROUP BY DATE(created_at) ORDER BY date`,
        [tenantId, period.start, period.end],
      ),
      this.dataSource.query<Array<{ issued: string }>>(
        `SELECT COALESCE(SUM(delta), 0) AS issued
           FROM points_ledger
           WHERE tenant_id = $1 AND delta > 0 AND created_at BETWEEN $2 AND $3`,
        [tenantId, prevStart, prevEnd],
      ),
    ]);

    const issued = Number(issuedRow.issued);
    const redeemed = Number(redeemedRow.redeemed);
    const prevIssued = Number(prevIssuedRow.issued);
    const issuedVsLastPeriod =
      prevIssued > 0
        ? Math.round(((issued - prevIssued) / prevIssued) * 100)
        : null;

    return {
      issued,
      redeemed,
      redemptionRate:
        issued > 0 ? Math.round((redeemed / issued) * 100 * 10) / 10 : 0,
      avgPointsPerCustomer:
        activeCustomers > 0 ? Math.round(issued / activeCustomers) : 0,
      nearRewardCount: Number(nearRewardRow.near_reward),
      dailyIssued: dailyRows.map((d) => ({
        date: String(d.date),
        amount: Number(d.amount),
      })),
      issuedVsLastPeriod,
    };
  }

  // ── computeWhatsappSection ────────────────────────────────────────────────

  async computeWhatsappSection(
    tenantId: string,
    period: ReportPeriod,
  ): Promise<WhatsappSection> {
    const sub = await this.subscriptionRepo.findOne({ where: { tenantId } });
    const marketingRate = Number(sub?.marketingRate ?? 130);

    const triggerRows = await this.dataSource.query<
      Array<{ trigger_type: string; status: string; count: string }>
    >(
      `SELECT trigger_type, status, COUNT(*) AS count
       FROM trigger_logs
       WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3
       GROUP BY trigger_type, status`,
      [tenantId, period.start, period.end],
    );

    // Aggregate by trigger type
    const byType: Record<string, { sent: number; delivered: number }> = {};
    let totalSent = 0;
    let totalDelivered = 0;
    let botInteractions = 0;

    for (const row of triggerRows) {
      const type = row.trigger_type;
      const count = Number(row.count);
      if (!byType[type]) byType[type] = { sent: 0, delivered: 0 };

      if (row.status === 'sent' || row.status === 'delivered') {
        byType[type].sent += count;
        totalSent += count;
      }
      if (row.status === 'delivered') {
        byType[type].delivered += count;
        totalDelivered += count;
      }
      if (type === 'balance_bot_reply' && row.status === 'sent') {
        botInteractions += count;
      }
    }

    const triggerBreakdown: WhatsappSection['triggerBreakdown'] = {};
    for (const [type, counts] of Object.entries(byType)) {
      const rate =
        counts.sent > 0
          ? Math.round((counts.delivered / counts.sent) * 1000) / 10
          : 0;

      let cost: string;
      if (UTILITY_TYPES.has(type)) {
        cost = 'Plan included';
      } else if (MARKETING_TYPES.has(type)) {
        cost = `₦${(counts.sent * marketingRate).toLocaleString()}`;
      } else {
        cost = 'Free';
      }

      triggerBreakdown[type] = {
        sent: counts.sent,
        delivered: counts.delivered,
        rate,
        cost,
      };
    }

    return {
      totalSent,
      deliveryRate:
        totalSent > 0
          ? Math.round((totalDelivered / totalSent) * 1000) / 10
          : 0,
      botInteractions,
      triggerBreakdown,
    };
  }

  // ── computeWalletSection ──────────────────────────────────────────────────

  async computeWalletSection(
    tenantId: string,
    period: ReportPeriod,
  ): Promise<WalletSection> {
    const [sub, [totalRow], spendRows, avgTxnRows, triggerRows] =
      await Promise.all([
        this.subscriptionRepo.findOne({ where: { tenantId } }),
        this.dataSource.query<Array<{ spend: string }>>(
          `SELECT COALESCE(ABS(SUM(amount)), 0) AS spend
         FROM wallet_transactions
         WHERE tenant_id = $1 AND amount < 0 AND created_at BETWEEN $2 AND $3`,
          [tenantId, period.start, period.end],
        ),
        this.dataSource.query<Array<{ type: string; amount: string }>>(
          `SELECT type, ABS(SUM(amount)) AS amount
         FROM wallet_transactions
         WHERE tenant_id = $1 AND amount < 0 AND created_at BETWEEN $2 AND $3
         GROUP BY type`,
          [tenantId, period.start, period.end],
        ),
        this.dataSource.query<Array<{ avg_amount: string | null }>>(
          `SELECT AVG(amount) AS avg_amount
         FROM transactions
         WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3`,
          [tenantId, period.start, period.end],
        ),
        this.dataSource.query<Array<{ count: string }>>(
          `SELECT COUNT(*) AS count FROM trigger_logs
         WHERE tenant_id = $1 AND trigger_type = 'lapsed_winback'
         AND status IN ('sent','delivered') AND created_at BETWEEN $2 AND $3`,
          [tenantId, period.start, period.end],
        ),
      ]);

    const totalSpend = Number(totalRow.spend);
    const spendByType: Record<string, number> = {};
    for (const row of spendRows) {
      spendByType[row.type] = Number(row.amount);
    }

    // Cost per message is the plan's marketing rate, not a derived calculation
    const costPerReach = Number(sub?.marketingRate ?? 130);

    const lapsedCount = Number(triggerRows[0]?.count ?? 0);
    const avgTxnValue = Math.round(Number(avgTxnRows[0]?.avg_amount ?? 0));
    const estimatedRevenue = lapsedCount * avgTxnValue;
    const estimatedRoi =
      totalSpend > 0
        ? Math.round((estimatedRevenue / totalSpend) * 10) / 10
        : 0;

    return {
      totalSpend,
      spendByType,
      costPerReach,
      estimatedRoi,
      estimatedRevenue,
      lapsedCustomerCount: lapsedCount,
      avgTransactionValue: avgTxnValue,
    };
  }

  // ── computeContentSection ─────────────────────────────────────────────────

  async computeContentSection(
    tenantId: string,
    period: ReportPeriod,
  ): Promise<ContentSection> {
    const [campaignRows, dowRows, topCustomerRows, categoryRows] =
      await Promise.all([
        this.dataSource.query<
          Array<{
            id: string;
            name: string;
            delivery_rate: string;
            sent_count: string;
            sent_at: string | null;
          }>
        >(
          `SELECT c.id, c.name, c.sent_count, c.sent_at,
             CASE WHEN c.sent_count = 0 THEN 0
             ELSE ROUND(c.delivered_count * 100.0 / c.sent_count, 1)
             END AS delivery_rate
           FROM campaigns c
           WHERE c.tenant_id = $1 AND c.sent_at BETWEEN $2 AND $3
           AND c.status = 'sent'
           ORDER BY delivery_rate DESC LIMIT 1`,
          [tenantId, period.start, period.end],
        ),
        this.dataSource.query<
          Array<{ dow: string; day_name: string; count: string }>
        >(
          `SELECT EXTRACT(DOW FROM created_at) AS dow,
                  TO_CHAR(created_at, 'Day') AS day_name,
                  COUNT(*) AS count
           FROM transactions
           WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3
           GROUP BY dow, day_name ORDER BY dow`,
          [tenantId, period.start, period.end],
        ),
        this.dataSource.query<
          Array<{
            id: string;
            full_name: string;
            total_spend: string;
            points_balance: string;
            purchase_count: string;
            tier_label: string | null;
          }>
        >(
          `SELECT c.id, c.full_name, c.total_spend, c.points_balance, c.purchase_count,
                  tc.tier_label
           FROM customers c
           LEFT JOIN tier_configs tc ON c.tier_id = tc.id
           WHERE c.tenant_id = $1
           ORDER BY c.total_spend DESC LIMIT 5`,
          [tenantId],
        ),
        this.dataSource.query<Array<{ name: string; txn_count: string }>>(
          `SELECT pc.name, COUNT(*) AS txn_count
           FROM transactions t
           JOIN product_categories pc ON t.category_id = pc.id
           WHERE t.tenant_id = $1 AND t.created_at BETWEEN $2 AND $3
           GROUP BY pc.id, pc.name ORDER BY txn_count DESC`,
          [tenantId, period.start, period.end],
        ),
      ]);

    const bestCampaign =
      campaignRows.length > 0
        ? {
            id: campaignRows[0].id,
            name: campaignRows[0].name,
            deliveryRate: Number(campaignRows[0].delivery_rate),
            sentCount: Number(campaignRows[0].sent_count),
            sentAt: campaignRows[0].sent_at ?? undefined,
          }
        : null;

    const categoryTotal = categoryRows.reduce(
      (s, r) => s + Number(r.txn_count),
      0,
    );

    return {
      bestCampaign,
      busiestDayOfWeek: dowRows.map((r) => ({
        day: r.day_name.trim(),
        count: Number(r.count),
      })),
      topCustomers: topCustomerRows.map((r) => ({
        id: r.id,
        fullName: r.full_name,
        totalSpend: Number(r.total_spend),
        pointsBalance: Number(r.points_balance),
        tierLabel: r.tier_label,
        visitCount: Number(r.purchase_count),
      })),
      categoryBreakdown: categoryRows.map((r) => ({
        name: r.name,
        percentage:
          categoryTotal > 0
            ? Math.round((Number(r.txn_count) / categoryTotal) * 100)
            : 0,
      })),
    };
  }

  // ── getBusinessName ───────────────────────────────────────────────────────

  async getBusinessName(tenantId: string): Promise<string> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    return tenant?.businessName ?? 'store';
  }

  // ── generatePdf ───────────────────────────────────────────────────────────

  async generatePdf(tenantId: string, period: ReportPeriod): Promise<Buffer> {
    // Use require() so we always get the real CJS default export — import *
    // gives the namespace object which lacks createPdf in some bundler configs.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfmakeLib = require('pdfmake/build/pdfmake') as PdfMakeLib;
    // vfs_fonts exports font files at root level (no .vfs or .pdfMake wrapper)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfFonts = require('pdfmake/build/vfs_fonts') as Record<
      string,
      string
    >;
    pdfmakeLib.vfs = pdfFonts;

    const [data, tenant] = await Promise.all([
      this.getReport(tenantId, period),
      this.tenantRepo.findOne({ where: { id: tenantId } }),
    ]);

    const docDefinition = {
      content: [
        { text: tenant?.businessName ?? 'PingLoyal', style: 'header' },
        {
          text: `Loyalty Report — ${formatPeriod(period)}`,
          style: 'subheader',
        },
        { text: 'Loyalty Performance', style: 'sectionHeader' },
        {
          table: {
            body: [
              ['Total Customers', data.loyalty.totalCustomers],
              ['Active Customers', data.loyalty.activeCustomers],
              ['Retention Rate', `${data.loyalty.retentionRate}%`],
              ['New This Period', data.loyalty.newCustomersThisMonth],
            ],
          },
        },
        { text: 'Points Summary', style: 'sectionHeader' },
        {
          table: {
            body: [
              ['Points Issued', data.points.issued.toLocaleString()],
              ['Points Redeemed', data.points.redeemed.toLocaleString()],
              ['Redemption Rate', `${data.points.redemptionRate}%`],
            ],
          },
        },
        { text: 'WhatsApp Performance', style: 'sectionHeader' },
        {
          table: {
            body: [
              ['Messages Sent', data.whatsapp.totalSent],
              ['Delivery Rate', `${data.whatsapp.deliveryRate}%`],
              ['Bot Interactions', data.whatsapp.botInteractions],
            ],
          },
        },
        { text: 'Marketing Wallet', style: 'sectionHeader' },
        {
          table: {
            body: [
              ['Total Spend', `₦${data.wallet.totalSpend.toLocaleString()}`],
              ['Estimated ROI', `${data.wallet.estimatedRoi}x`],
            ],
          },
        },
      ],
      styles: {
        header: { fontSize: 20, bold: true, margin: [0, 0, 0, 10] },
        subheader: { fontSize: 14, color: '#6B7280', margin: [0, 0, 0, 20] },
        sectionHeader: {
          fontSize: 14,
          bold: true,
          margin: [0, 15, 0, 5],
        },
      },
    };

    return new Promise<Buffer>((resolve) => {
      pdfmakeLib
        .createPdf(docDefinition)
        .getBuffer((buffer) => resolve(buffer));
    });
  }

  // ── generateExcel ─────────────────────────────────────────────────────────

  async generateExcel(tenantId: string, period: ReportPeriod): Promise<Buffer> {
    const data = await this.getReport(tenantId, period);
    const workbook = new ExcelJS.Workbook();

    // Sheet 1 — Loyalty
    const loyaltySheet = workbook.addWorksheet('Loyalty');
    loyaltySheet.addRow(['Metric', 'Value']);
    loyaltySheet.addRows([
      ['Total Customers', data.loyalty.totalCustomers],
      ['Active Customers', data.loyalty.activeCustomers],
      ['Inactive Customers', data.loyalty.inactiveCustomers],
      ['New This Period', data.loyalty.newCustomersThisMonth],
      ['Retention Rate (%)', data.loyalty.retentionRate],
      ['Avg Visits per Customer', data.loyalty.avgVisitsPerCustomer],
    ]);

    // Sheet 2 — Points
    const pointsSheet = workbook.addWorksheet('Points');
    pointsSheet.addRow(['Metric', 'Value']);
    pointsSheet.addRows([
      ['Points Issued', data.points.issued],
      ['Points Redeemed', data.points.redeemed],
      ['Redemption Rate (%)', data.points.redemptionRate],
      ['Near Reward Count', data.points.nearRewardCount],
      ['Avg Points per Customer', data.points.avgPointsPerCustomer],
    ]);

    // Sheet 3 — WhatsApp
    const waSheet = workbook.addWorksheet('WhatsApp');
    waSheet.addRow(['Trigger Type', 'Sent', 'Delivered', 'Rate (%)', 'Cost']);
    for (const [type, stats] of Object.entries(
      data.whatsapp.triggerBreakdown,
    )) {
      waSheet.addRow([
        type,
        stats.sent,
        stats.delivered,
        stats.rate,
        stats.cost,
      ]);
    }

    // Sheet 4 — Wallet
    const walletSheet = workbook.addWorksheet('Wallet');
    walletSheet.addRow(['Type', 'Amount (₦)']);
    for (const [type, amount] of Object.entries(data.wallet.spendByType)) {
      walletSheet.addRow([type, amount]);
    }

    // Sheet 5 — Top Customers
    const customersSheet = workbook.addWorksheet('Top Customers');
    customersSheet.addRow(['Name', 'Total Spend (₦)', 'Points', 'Tier']);
    for (const c of data.content.topCustomers) {
      customersSheet.addRow([
        c.fullName,
        c.totalSpend,
        c.pointsBalance,
        c.tierLabel ?? '—',
      ]);
    }

    const buf = await workbook.xlsx.writeBuffer();
    return Buffer.from(buf);
  }
}
