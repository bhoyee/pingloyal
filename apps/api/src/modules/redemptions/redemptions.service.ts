import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TriggerType } from '@pingloyal/types';
import { TenantsService } from '../tenants/tenants.service';
import { Redemption } from './entities/redemption.entity';
import type { CreateRedemptionDto } from './dto/create-redemption.dto';

export interface RedemptionRow {
  id: string;
  customerId: string;
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

export interface ListRedemptionsQuery {
  customerId?: string;
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
}

@Injectable()
export class RedemptionsService {
  private readonly logger = new Logger(RedemptionsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Redemption)
    private readonly redemptionRepo: Repository<Redemption>,
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

      const [redemption] = await em.query<{ id: string; redeemed_at: string }[]>(
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
        id: redemption.id as string,
        customerId: dto.customerId,
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

    const qb = this.redemptionRepo
      .createQueryBuilder('r')
      .leftJoin('r.cashier', 'cashier')
      .addSelect(['cashier.fullName'])
      .where('r.tenantId = :tenantId', { tenantId })
      .orderBy('r.redeemedAt', 'DESC')
      .take(limit)
      .skip((page - 1) * limit);

    if (query.customerId) {
      qb.andWhere('r.customerId = :customerId', { customerId: query.customerId });
    }
    if (query.startDate) {
      qb.andWhere('r.redeemedAt >= :startDate', { startDate: query.startDate });
    }
    if (query.endDate) {
      qb.andWhere('r.redeemedAt <= :endDate', { endDate: query.endDate });
    }

    const [rows, total] = await qb.getManyAndCount();

    return {
      data: rows.map((r) => ({
        id: r.id,
        customerId: r.customerId,
        redeemedAt: r.redeemedAt.toISOString(),
        pointsRedeemed: r.pointsRedeemed,
        rewardsCount: r.rewardsCount,
        value: Number(r.value),
        balanceAfter: r.balanceAfter,
        cashierName: r.cashier?.fullName ?? null,
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
    const qb = this.redemptionRepo
      .createQueryBuilder('r')
      .select('COUNT(r.id)', 'totalRedemptions')
      .addSelect('COALESCE(SUM(r.pointsRedeemed), 0)', 'totalPointsRedeemed')
      .addSelect('COALESCE(SUM(r.value), 0)', 'totalValue')
      .where('r.tenantId = :tenantId', { tenantId });

    if (query.startDate) {
      qb.andWhere('r.redeemedAt >= :startDate', { startDate: query.startDate });
    }
    if (query.endDate) {
      qb.andWhere('r.redeemedAt <= :endDate', { endDate: query.endDate });
    }

    const raw = await qb.getRawOne<{
      totalRedemptions: string;
      totalPointsRedeemed: string;
      totalValue: string;
    }>();

    return {
      totalRedemptions: parseInt(raw?.totalRedemptions ?? '0', 10),
      totalPointsRedeemed: parseInt(raw?.totalPointsRedeemed ?? '0', 10),
      totalValue: Number(raw?.totalValue ?? '0'),
    };
  }
}
