import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { Queue } from 'bullmq';
import { isTriggerEnabled, maskPhone } from '@pingloyal/utils';
import { SubscriptionStatus, TriggerType } from '@pingloyal/types';
import { Customer } from '../customers/entities/customer.entity';

interface TenantRow {
  id: string;
  businessName: string;
  lapsedDays: number;
  enabledTriggers: Record<string, boolean> | null;
}

const PAGE_SIZE = 20;
const MAX_PER_TENANT = 500;
const COOLDOWN_MS = 30 * 24 * 3600 * 1000;

@Injectable()
export class LapsedCronService {
  private readonly logger = new Logger(LapsedCronService.name);

  constructor(
    @InjectQueue('wa-messages') private readonly waMessagesQueue: Queue,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Cron('0 6 * * *')
  async runLapsedCron(): Promise<void> {
    let tenantsProcessed = 0;
    let totalQueued = 0;

    const now = Date.now();
    const startOfUtcDay = new Date(now);
    startOfUtcDay.setUTCHours(0, 0, 0, 0);

    // Step 1 — Paginate active/trialing tenants
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const tenants: TenantRow[] = await this.dataSource.query(
        `SELECT id,
                business_name AS "businessName",
                lapsed_days   AS "lapsedDays",
                enabled_triggers AS "enabledTriggers"
         FROM tenants
         WHERE subscription_status IN ($1, $2)
         ORDER BY id
         LIMIT $3 OFFSET $4`,
        [
          SubscriptionStatus.ACTIVE,
          SubscriptionStatus.TRIALING,
          PAGE_SIZE,
          offset,
        ],
      );

      for (const tenant of tenants) {
        totalQueued += await this.processTenant(tenant, now, startOfUtcDay);
        tenantsProcessed++;
      }

      hasMore = tenants.length === PAGE_SIZE;
      offset += PAGE_SIZE;
    }

    // Step 4 — Log completion
    this.logger.log(
      `Lapsed cron complete. Tenants: ${tenantsProcessed}. Messages queued: ${totalQueued}.`,
    );
  }

  private async processTenant(
    tenant: TenantRow,
    now: number,
    startOfUtcDay: Date,
  ): Promise<number> {
    if (!isTriggerEnabled(tenant.enabledTriggers, TriggerType.LAPSED_WINBACK)) {
      return 0;
    }

    const cutoffDate = new Date(now - tenant.lapsedDays * 24 * 3600 * 1000);
    const thirtyDaysAgo = new Date(now - COOLDOWN_MS);

    // Step 2 — Find lapsed customers via QueryBuilder
    const customers = await this.dataSource
      .createQueryBuilder(Customer, 'c')
      .select(['c.id', 'c.fullName', 'c.phoneE164', 'c.lastPurchaseAt'])
      .where('c.tenantId = :tenantId', { tenantId: tenant.id })
      .andWhere('c.waOptedIn = true')
      .andWhere('c.lastPurchaseAt < :cutoffDate', { cutoffDate })
      .andWhere('c.lastPurchaseAt IS NOT NULL')
      .andWhere('(c.lapsedSentAt IS NULL OR c.lapsedSentAt < :thirtyDaysAgo)', {
        thirtyDaysAgo,
      })
      .andWhere('c.isActive = true')
      .limit(MAX_PER_TENANT)
      .getMany();

    let queued = 0;

    for (const customer of customers) {
      // Protection: skip if birthday message was already sent today
      const hasBirthdayToday: Array<{ id: string }> =
        await this.dataSource.query(
          `SELECT id FROM trigger_logs
           WHERE customer_id = $1
             AND tenant_id   = $2
             AND trigger_type = $3
             AND created_at  >= $4
           LIMIT 1`,
          [customer.id, tenant.id, TriggerType.BIRTHDAY, startOfUtcDay],
        );

      if (hasBirthdayToday.length > 0) continue;

      // Step 3 — Queue win-back message
      const daysSinceVisit = Math.floor(
        (now - customer.lastPurchaseAt!.getTime()) / (24 * 3600 * 1000),
      );
      const firstName = customer.fullName.split(' ')[0];

      await this.waMessagesQueue.add(
        'send-message',
        {
          type: TriggerType.LAPSED_WINBACK,
          tenantId: tenant.id,
          customerId: customer.id,
          data: {
            firstName,
            businessName: tenant.businessName,
            daysSinceVisit: daysSinceVisit.toString(),
          },
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        },
      );

      await this.dataSource.query(
        'UPDATE customers SET lapsed_sent_at = NOW() WHERE id = $1',
        [customer.id],
      );

      this.logger.log(
        `Lapsed win-back queued: tenant=${tenant.businessName} ` +
          `phone=${maskPhone(customer.phoneE164)} ` +
          `daysSince=${daysSinceVisit}`,
      );

      queued++;
    }

    return queued;
  }
}
