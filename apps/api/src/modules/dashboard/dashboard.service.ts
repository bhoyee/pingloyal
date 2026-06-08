import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type Redis from 'ioredis';
import { WaVerificationStatus } from '@pingloyal/types';
import { REDIS_CLIENT } from '../../common/redis/redis.constants';
import { TenantsService } from '../tenants/tenants.service';

const SUMMARY_TTL_S = 60;
const TOP_SPENDERS_TTL_S = 900;
const WALLET_LOW_THRESHOLD = 3000;

export interface DashboardSummary {
  totalCustomers: number;
  activeCustomers: number;
  inactiveCustomers: number;
  newCustomersThisMonth: number;
  pointsIssuedThisMonth: number;
  pointsRedeemedThisMonth: number;
  campaignsSentThisMonth: number;
  avgDeliveryRate: number;
  messagesSentThisMonth: number;
  messagesSkippedWalletThisMonth: number;
  marketingMessagesThisMonth: number;
  walletBalance: number;
  walletSpentThisMonth: number;
  walletIsLow: boolean;
  walletIsEmpty: boolean;
  waIsConnected: boolean;
  waVerificationStatus: string;
}

export interface TopSpender {
  id: string;
  fullName: string;
  pointsBalance: number;
  totalSpend: number;
  lastPurchaseAt: string | null;
  purchaseCount: number;
  tierLabel: string | null;
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly tenantsService: TenantsService,
  ) {}

  async getSummary(tenantId: string): Promise<DashboardSummary> {
    const cacheKey = `dashboard:summary:${tenantId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as DashboardSummary;

    const rows = await this.dataSource.query<Record<string, string>[]>(
      `WITH customer_stats AS (
        SELECT
          COUNT(*)
            AS total_customers,
          COUNT(*) FILTER (
            WHERE last_purchase_at > NOW() - (
              SELECT lapsed_days FROM tenants WHERE id = $1
            ) * INTERVAL '1 day'
          ) AS active_customers,
          COUNT(*) FILTER (
            WHERE last_purchase_at <= NOW() - (
                SELECT lapsed_days FROM tenants WHERE id = $1
              ) * INTERVAL '1 day'
              OR last_purchase_at IS NULL
          ) AS inactive_customers,
          COUNT(*) FILTER (
            WHERE created_at >= date_trunc('month', NOW())
          ) AS new_customers_this_month
        FROM customers
        WHERE tenant_id = $1
          AND is_active = true
      ),
      points_stats AS (
        SELECT
          COALESCE(SUM(delta) FILTER (
            WHERE delta > 0
            AND created_at >= date_trunc('month', NOW())
          ), 0) AS issued_this_month,
          COALESCE(ABS(SUM(delta) FILTER (
            WHERE delta < 0
            AND created_at >= date_trunc('month', NOW())
          )), 0) AS redeemed_this_month
        FROM points_ledger
        WHERE tenant_id = $1
      ),
      campaign_stats AS (
        SELECT
          COUNT(*) FILTER (
            WHERE status = 'sent'
            AND sent_at >= date_trunc('month', NOW())
          ) AS campaigns_this_month,
          CASE
            WHEN COALESCE(SUM(sent_count), 0) = 0 THEN 0
            ELSE ROUND(
              SUM(delivered_count) * 100.0 / NULLIF(SUM(sent_count), 0), 1
            )
          END AS avg_delivery_rate
        FROM campaigns
        WHERE tenant_id = $1
      ),
      trigger_stats AS (
        SELECT
          COUNT(*) FILTER (
            WHERE status = 'sent'
            AND created_at >= date_trunc('month', NOW())
          ) AS messages_sent_this_month,
          COUNT(*) FILTER (
            WHERE status = 'skipped'
            AND skip_reason = 'wallet_empty'
            AND created_at >= date_trunc('month', NOW())
          ) AS messages_skipped_wallet_this_month
        FROM trigger_logs
        WHERE tenant_id = $1
      ),
      wallet_stats AS (
        SELECT
          COALESCE(ABS(SUM(amount) FILTER (
            WHERE amount < 0
            AND created_at >= date_trunc('month', NOW())
          )), 0) AS wallet_spent_this_month,
          COALESCE(COUNT(*) FILTER (
            WHERE amount < 0
            AND created_at >= date_trunc('month', NOW())
          ), 0) AS marketing_messages_this_month
        FROM wallet_transactions
        WHERE tenant_id = $1
      )
      SELECT cs.*, ps.*, cas.*, ts.*, ws.*
      FROM customer_stats cs,
           points_stats ps,
           campaign_stats cas,
           trigger_stats ts,
           wallet_stats ws`,
      [tenantId],
    );

    const row = rows[0] ?? {};
    const tenant = await this.tenantsService.findOne(tenantId);
    const walletBalance = Number(tenant.marketingWalletBalance);

    const result: DashboardSummary = {
      totalCustomers: Number(row.total_customers ?? 0),
      activeCustomers: Number(row.active_customers ?? 0),
      inactiveCustomers: Number(row.inactive_customers ?? 0),
      newCustomersThisMonth: Number(row.new_customers_this_month ?? 0),
      pointsIssuedThisMonth: Number(row.issued_this_month ?? 0),
      pointsRedeemedThisMonth: Number(row.redeemed_this_month ?? 0),
      campaignsSentThisMonth: Number(row.campaigns_this_month ?? 0),
      avgDeliveryRate: Number(row.avg_delivery_rate ?? 0),
      messagesSentThisMonth: Number(row.messages_sent_this_month ?? 0),
      messagesSkippedWalletThisMonth: Number(
        row.messages_skipped_wallet_this_month ?? 0,
      ),
      marketingMessagesThisMonth: Number(
        row.marketing_messages_this_month ?? 0,
      ),
      walletBalance,
      walletSpentThisMonth: Number(row.wallet_spent_this_month ?? 0),
      walletIsLow: walletBalance > 0 && walletBalance < WALLET_LOW_THRESHOLD,
      walletIsEmpty: walletBalance <= 0,
      waIsConnected:
        tenant.waVerificationStatus === WaVerificationStatus.VERIFIED,
      waVerificationStatus: tenant.waVerificationStatus,
    };

    await this.redis.setex(cacheKey, SUMMARY_TTL_S, JSON.stringify(result));
    return result;
  }

  async getTopSpenders(tenantId: string): Promise<TopSpender[]> {
    const cacheKey = `dashboard:top-spenders:${tenantId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as TopSpender[];

    const rows = await this.dataSource.query<
      Array<{
        id: string;
        full_name: string;
        points_balance: string;
        total_spend: string;
        last_purchase_at: string | null;
        purchase_count: string;
        tier_label: string | null;
      }>
    >(
      `SELECT
        c.id, c.full_name, c.points_balance, c.total_spend,
        c.last_purchase_at, c.purchase_count,
        tc.tier_label
      FROM customers c
      LEFT JOIN tier_configs tc ON c.tier_id = tc.id
      WHERE c.tenant_id = $1
        AND c.is_active = true
      ORDER BY c.total_spend DESC
      LIMIT 10`,
      [tenantId],
    );

    const result: TopSpender[] = rows.map((r) => ({
      id: r.id,
      fullName: r.full_name,
      pointsBalance: Number(r.points_balance),
      totalSpend: Number(r.total_spend),
      lastPurchaseAt: r.last_purchase_at,
      purchaseCount: Number(r.purchase_count),
      tierLabel: r.tier_label,
    }));

    await this.redis.setex(
      cacheKey,
      TOP_SPENDERS_TTL_S,
      JSON.stringify(result),
    );
    return result;
  }

  async invalidateCache(tenantId: string): Promise<void> {
    await this.redis.del(
      `dashboard:summary:${tenantId}`,
      `dashboard:top-spenders:${tenantId}`,
    );
  }
}
