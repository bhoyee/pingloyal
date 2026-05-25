import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import type { Redis } from 'ioredis';
import { SubscriptionStatus } from '@pingloyal/types';
import { REDIS_CLIENT } from '../../common/redis/redis.constants';
import { TierService } from './tier.service';

@Injectable()
export class QuarterlyResetCron {
  private readonly logger = new Logger(QuarterlyResetCron.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly tierService: TierService,
  ) {}

  // Midnight UTC on 1 Jan, 1 Apr, 1 Jul, 1 Oct
  @Cron('0 0 1 1,4,7,10 *')
  async runQuarterlyReset(): Promise<void> {
    const startTime = Date.now();
    this.logger.log('Quarterly reset started');

    try {
      // Step 1 — Load all active/trialing/past_due tenants
      const tenants: Array<{ id: string }> = await this.dataSource.query(
        `SELECT id FROM tenants
         WHERE subscription_status IN ($1, $2, $3)`,
        [
          SubscriptionStatus.ACTIVE,
          SubscriptionStatus.TRIALING,
          SubscriptionStatus.PAST_DUE,
        ],
      );

      if (tenants.length === 0) {
        this.logger.log('Quarterly reset — no eligible tenants found');
        return;
      }

      const tenantIds = tenants.map((t) => t.id);

      // Step 2 — Count customers before reset (for audit log)
      const countResult: Array<{ count: string }> = await this.dataSource.query(
        'SELECT COUNT(*)::int AS count FROM customers WHERE tenant_id = ANY($1)',
        [tenantIds],
      );
      const customerCount = Number(countResult[0]?.count ?? 0);

      // Step 3 — Reset quarterly_spend for all customers in one query
      await this.dataSource.query(
        'UPDATE customers SET quarterly_spend = 0, updated_at = NOW() WHERE tenant_id = ANY($1)',
        [tenantIds],
      );

      // Step 4 — Reset utility_used_this_period and grace_period_started_at
      // on subscriptions (resets monthly Utility counter for the new period)
      await this.dataSource.query(
        `UPDATE subscriptions
         SET utility_used_this_period = 0,
             grace_period_started_at = NULL,
             updated_at = NOW()
         WHERE tenant_id = ANY($1)`,
        [tenantIds],
      );

      // Step 5 — Invalidate Redis cache for all affected tenants (pipeline)
      const pipeline = this.redis.pipeline();
      for (const id of tenantIds) {
        pipeline.del(`tenant:${id}`);
        pipeline.del(`tenant:full:${id}`);
        pipeline.del(`tenant:sub:${id}`);
      }
      await pipeline.exec();

      // Step 6 — Recalculate tiers in parallel batches of 5
      // After reset, quarterly_spend = 0 → most customers drop to Standard tier
      const chunks = chunk(tenants, 5);
      for (const batch of chunks) {
        await Promise.all(
          batch.map((t) =>
            this.tierService.recalculateAll(t.id).catch((err: unknown) => {
              this.logger.error(
                `Quarterly reset — tier recalculation failed for tenant ${t.id}: ${String(err)}`,
              );
            }),
          ),
        );
      }

      // Step 7 — Log completion
      this.logger.log(
        `Quarterly reset complete — ` +
          `tenants: ${tenants.length}, ` +
          `customers reset: ${customerCount}, ` +
          `duration: ${Date.now() - startTime}ms`,
      );
    } catch (err) {
      this.logger.error(`Quarterly reset failed: ${String(err)}`);
      // Do NOT rethrow — a failed cron must not crash the server
    }
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}
