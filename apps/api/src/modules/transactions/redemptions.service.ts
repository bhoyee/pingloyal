import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PointsLedgerReason } from '@pingloyal/types';
import { TenantsService } from '../tenants/tenants.service';
import { PointsLedger } from './entities/points-ledger.entity';

// Reward redemption isn't recorded as its own entity yet — it's a
// points_ledger row with reason='redemption' (delta < 0). There is no
// creation flow for these today (no "redeem reward" action exists in the
// Cashier PWA), so this is read-only, and `cashierName` is always null
// since the ledger has no actor column to attribute it to.
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
  totalPointsRedeemed: number;
}

export interface ListRedemptionsQuery {
  customerId?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class RedemptionsService {
  constructor(
    @InjectRepository(PointsLedger)
    private readonly ledgerRepo: Repository<PointsLedger>,
    private readonly tenantsService: TenantsService,
  ) {}

  async findAll(
    tenantId: string,
    query: ListRedemptionsQuery,
  ): Promise<RedemptionListResult> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    const tenant = await this.tenantsService.findOne(tenantId);
    const pointsThreshold =
      tenant.pointsThreshold > 0 ? tenant.pointsThreshold : 1;
    const rewardValue = Number(tenant.rewardValue) || 0;

    const baseQuery = () => {
      const qb = this.ledgerRepo
        .createQueryBuilder('pl')
        .leftJoin('pl.customer', 'customer')
        .addSelect(['customer.id'])
        .where('pl.tenantId = :tenantId', { tenantId })
        .andWhere('pl.reason = :reason', {
          reason: PointsLedgerReason.REDEMPTION,
        });
      if (query.customerId) {
        qb.andWhere('customer.id = :customerId', {
          customerId: query.customerId,
        });
      }
      return qb;
    };

    const [rows, total] = await baseQuery()
      .orderBy('pl.createdAt', 'DESC')
      .take(limit)
      .skip((page - 1) * limit)
      .getManyAndCount();

    const aggregate = await baseQuery()
      .select('COALESCE(SUM(ABS(pl.delta)), 0)', 'totalPoints')
      .getRawOne<{ totalPoints: string }>();
    const totalPointsRedeemed = parseInt(aggregate?.totalPoints ?? '0', 10);

    return {
      data: rows.map((r) => {
        const pointsRedeemed = Math.abs(r.delta);
        const rewardsCount = Math.max(
          1,
          Math.round(pointsRedeemed / pointsThreshold),
        );
        return {
          id: r.id,
          customerId: r.customer.id,
          redeemedAt: r.createdAt.toISOString(),
          pointsRedeemed,
          rewardsCount,
          value: rewardsCount * rewardValue,
          balanceAfter: r.balanceAfter,
          cashierName: null,
        };
      }),
      total,
      page,
      limit,
      totalPointsRedeemed,
    };
  }
}
