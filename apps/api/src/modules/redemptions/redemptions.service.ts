import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TriggerType } from '@pingloyal/types';
import { TenantsService } from '../tenants/tenants.service';
import type { CreateRedemptionDto } from './dto/create-redemption.dto';

export interface RedemptionRow {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  redeemedAt: string;
  pointsRedeemed: number;
  rewardsCount: number;
  value: number;
  balanceAfter: number;
  cashierName: string | null;
}

export interface RedemptionListResult {
  data: RedemptionRow[];
  total: number;
  page: number;
  limit: number;
}

export interface RedemptionStats {
  totalRedemptions: number;
  totalPointsRedeemed: number;
  totalValue: number;
}

export type RedemptionSortField = 'redeemedAt' | 'pointsRedeemed' | 'value';

export interface ListRedemptionsQuery {
  customerId?: string;
  cashierId?: string;
  search?: string;
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
  sortBy?: RedemptionSortField;
  sortOrder?: 'ASC' | 'DESC';
}

@Injectable()
export class RedemptionsService {
  private readonly logger = new Logger(RedemptionsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tenantsService: TenantsService,
    @InjectQueue('wa-messages') private readonly waQueue: Queue,
  ) {}

  async createRedemption(
    tenantId: string,
    cashierId: string,
    dto: CreateRedemptionDto,
  ): Promise<RedemptionRow> {
    const tenant = await this.tenantsService.findOne(tenantId);
    const pointsToDeduct = dto.rewardsToRedeem * tenant.pointsThreshold;
    const value = dto.rewardsToRedeem * Number(tenant.rewardValue);

    const row = await this.dataSource.transaction(async (em) => {
      // Atomic deduction — WHERE clause prevents double-spend under concurrent requests
      const updated = await em.query<{ points_balance: string }[]>(
        `UPDATE customers
         SET points_balance = points_balance - $1
         WHERE id = $2
           AND tenant_id = $3
           AND points_balance >= $1
         RETURNING points_balance`,
        [pointsToDeduct, dto.customerId, tenantId],
      );

      if (updated.length === 0) {
        throw new BadRequestException('Insufficient points');
      }

      const balanceAfter = Number(updated[0].points_balance);

      await em.query(
        `INSERT INTO points_ledger (tenant_id, customer_id, delta, reason, balance_after)
         VALUES ($1, $2, $3, 'redemption', $4)`,
        [tenantId, dto.customerId, -pointsToDeduct, balanceAfter],
      );

      const [redemption] = await em.query<
        { id: string; redeemed_at: string }[]
      >(
        `INSERT INTO redemptions
           (tenant_id, customer_id, cashier_id, rewards_count, points_redeemed, value, balance_after, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, redeemed_at`,
        [
          tenantId,
          dto.customerId,
          cashierId,
          dto.rewardsToRedeem,
          pointsToDeduct,
          value,
          balanceAfter,
          dto.notes ?? null,
        ],
      );

      const result: RedemptionRow = {
        id: redemption.id,
        customerId: dto.customerId,
        customerName: '',
        customerPhone: '',
        redeemedAt: new Date(redemption.redeemed_at).toISOString(),
        pointsRedeemed: pointsToDeduct,
        rewardsCount: dto.rewardsToRedeem,
        value,
        balanceAfter,
        cashierName: null,
      };
      return result;
    });

    // Queue WA notification after transaction commits; fire-and-forget if queue is unavailable
    try {
      await this.waQueue.add('send', {
        type: TriggerType.REWARD_REDEEMED,
        tenantId,
        customerId: dto.customerId,
        data: {
          rewardsCount: String(dto.rewardsToRedeem),
          rewardValue: String(value),
          newBalance: String(row.balanceAfter),
          progressPercent: String(
            Math.round((row.balanceAfter / tenant.pointsThreshold) * 100),
          ),
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to queue REWARD_REDEEMED WA message for tenant=${tenantId}: ${String(err)}`,
      );
    }

    return row;
  }

  async getRedemptions(
    tenantId: string,
    query: ListRedemptionsQuery,
  ): Promise<RedemptionListResult> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(query.limit ?? 20, 100);

    // Whitelist sort columns mapped to actual snake_case DB columns
    const SORT_COL: Record<RedemptionSortField, string> = {
      redeemedAt: 'r.redeemed_at',
      pointsRedeemed: 'r.points_redeemed',
      value: 'r.value',
    };
    const sortCol = SORT_COL[query.sortBy ?? 'redeemedAt'];
    const sortOrder = query.sortOrder === 'ASC' ? 'ASC' : 'DESC';

    // Build parameterised WHERE conditions
    const params: unknown[] = [tenantId];
    const conditions: string[] = ['r.tenant_id = $1'];

    if (query.customerId) {
      params.push(query.customerId);
      conditions.push(`r.customer_id = $${params.length}`);
    }
    if (query.cashierId) {
      params.push(query.cashierId);
      conditions.push(`r.cashier_id = $${params.length}`);
    }
    if (query.startDate) {
      params.push(query.startDate);
      conditions.push(`r.redeemed_at >= $${params.length}`);
    }
    if (query.endDate) {
      params.push(query.endDate + 'T23:59:59.999Z');
      conditions.push(`r.redeemed_at < $${params.length}`);
    }

    // Search appended last so its $N is consistent between count and data queries
    let searchCondition = '';
    if (query.search) {
      params.push(`%${query.search.toLowerCase()}%`);
      // PostgreSQL allows reusing the same $N parameter twice in one query
      searchCondition = `AND (LOWER(c.full_name) LIKE $${params.length} OR c.phone_e164 LIKE $${params.length})`;
    }

    const whereClause = conditions.join(' AND ');
    const joins = `LEFT JOIN customers c ON c.id = r.customer_id
     LEFT JOIN users u ON u.id = r.cashier_id`;

    // COUNT
    const countRows: { count: string }[] = await this.dataSource.query(
      `SELECT COUNT(*) AS count
       FROM redemptions r
       ${joins}
       WHERE ${whereClause}
       ${searchCondition}`,
      [...params],
    );
    const total = parseInt(countRows[0]?.count ?? '0', 10);

    // DATA
    type RawRow = {
      id: string;
      customer_id: string;
      customer_name: string;
      customer_phone: string;
      redeemed_at: string;
      points_redeemed: string;
      rewards_count: string;
      value: string;
      balance_after: string;
      cashier_name: string | null;
    };
    const dataParams: unknown[] = [...params, limit, (page - 1) * limit];
    const rows: RawRow[] = await this.dataSource.query(
      `SELECT r.id,
              r.customer_id,
              COALESCE(c.full_name, 'Unknown') AS customer_name,
              COALESCE(c.phone_e164, '')        AS customer_phone,
              r.redeemed_at,
              r.points_redeemed,
              r.rewards_count,
              r.value,
              r.balance_after,
              u.full_name                       AS cashier_name
       FROM redemptions r
       ${joins}
       WHERE ${whereClause}
       ${searchCondition}
       ORDER BY ${sortCol} ${sortOrder}
       LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams,
    );

    return {
      data: rows.map((r) => ({
        id: r.id,
        customerId: r.customer_id,
        customerName: r.customer_name,
        customerPhone: r.customer_phone,
        redeemedAt: new Date(r.redeemed_at).toISOString(),
        pointsRedeemed: parseInt(r.points_redeemed, 10),
        rewardsCount: parseInt(r.rewards_count, 10),
        value: Number(r.value),
        balanceAfter: parseInt(r.balance_after, 10),
        cashierName: r.cashier_name ?? null,
      })),
      total,
      page,
      limit,
    };
  }

  async getStats(
    tenantId: string,
    query: { startDate?: string; endDate?: string },
  ): Promise<RedemptionStats> {
    const params: unknown[] = [tenantId];
    const conditions: string[] = ['r.tenant_id = $1'];

    if (query.startDate) {
      params.push(query.startDate);
      conditions.push(`r.redeemed_at >= $${params.length}`);
    }
    if (query.endDate) {
      params.push(query.endDate + 'T23:59:59.999Z');
      conditions.push(`r.redeemed_at < $${params.length}`);
    }

    const rows: { total: string; pts: string; val: string }[] =
      await this.dataSource.query(
        `SELECT COUNT(r.id)                         AS total,
                COALESCE(SUM(r.points_redeemed), 0) AS pts,
                COALESCE(SUM(r.value), 0)            AS val
         FROM redemptions r
         WHERE ${conditions.join(' AND ')}`,
        params,
      );

    const row = rows[0];
    return {
      totalRedemptions: parseInt(row?.total ?? '0', 10),
      totalPointsRedeemed: parseInt(row?.pts ?? '0', 10),
      totalValue: Number(row?.val ?? '0'),
    };
  }
}
