import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { Queue } from 'bullmq';
import { DateTime } from 'luxon';
import pLimit from 'p-limit';
import {
  SubscriptionStatus,
  TriggerType,
  WaVerificationStatus,
} from '@pingloyal/types';
import { isTriggerEnabled } from '@pingloyal/utils';

interface TenantRow {
  id: string;
  timezone: string;
  waVerificationStatus: WaVerificationStatus;
  marketingWalletBalance: string;
  businessName: string;
  pointsThreshold: number;
  rewardValue: string;
  enabledTriggers: Record<string, boolean> | null;
}

interface CustomerRow {
  id: string;
  full_name: string;
  phone_e164: string;
  wa_opted_in: boolean;
}

interface ProcessResult {
  queued: number;
  skippedWallet: number;
  skippedNotConnected: number;
}

const PAGE_SIZE = 20;
const CONCURRENCY_LIMIT = 5;

@Injectable()
export class BirthdayCronService {
  private readonly logger = new Logger(BirthdayCronService.name);

  constructor(
    @InjectQueue('wa-messages') private readonly waMessagesQueue: Queue,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Cron('0 * * * *')
  async runBirthdayCron(): Promise<void> {
    const startTime = Date.now();
    let messagesQueued = 0;
    let skippedWallet = 0;
    let skippedNotConnected = 0;

    // Steps 1 & 2 — Find tenants where it is currently 8am
    const qualifyingTenants = await this.findQualifyingTenants();
    const tenantsChecked = qualifyingTenants.length;

    // Steps 3-5 — Process each qualifying tenant with concurrency cap
    const limit = pLimit(CONCURRENCY_LIMIT);
    const results = await Promise.all(
      qualifyingTenants.map((tenant) =>
        limit(() => this.processTenant(tenant)),
      ),
    );

    for (const result of results) {
      messagesQueued += result.queued;
      skippedWallet += result.skippedWallet;
      skippedNotConnected += result.skippedNotConnected;
    }

    // Step 7 — Log completion
    const duration = Date.now() - startTime;
    this.logger.log(
      `Birthday cron complete — ` +
        `tenants checked: ${tenantsChecked}, ` +
        `messages queued: ${messagesQueued}, ` +
        `skipped (wallet empty): ${skippedWallet}, ` +
        `skipped (WA not connected): ${skippedNotConnected}, ` +
        `duration: ${duration}ms`,
    );

    if (duration > 45_000) {
      this.logger.warn(
        `Birthday cron took ${duration}ms — exceeds 45s threshold. ` +
          `Consider optimising tenant pagination or reducing p-limit concurrency.`,
      );
    }
  }

  private async findQualifyingTenants(): Promise<TenantRow[]> {
    const qualifying: TenantRow[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const rows: TenantRow[] = await this.dataSource.query(
        `SELECT id, timezone,
                wa_verification_status AS "waVerificationStatus",
                marketing_wallet_balance AS "marketingWalletBalance",
                business_name AS "businessName",
                points_threshold AS "pointsThreshold",
                reward_value AS "rewardValue",
                enabled_triggers AS "enabledTriggers"
         FROM tenants
         WHERE subscription_status IN ($1, $2, $3)
         ORDER BY id
         LIMIT $4 OFFSET $5`,
        [
          SubscriptionStatus.ACTIVE,
          SubscriptionStatus.TRIALING,
          SubscriptionStatus.PAST_DUE,
          PAGE_SIZE,
          offset,
        ],
      );

      for (const tenant of rows) {
        const tenantNow = DateTime.now().setZone(tenant.timezone);
        const hour = tenantNow.hour;
        const minute = tenantNow.minute;
        const isEightAm = hour === 8 || (hour === 7 && minute >= 30);
        if (isEightAm) {
          qualifying.push(tenant);
        }
      }

      hasMore = rows.length === PAGE_SIZE;
      offset += PAGE_SIZE;
    }

    return qualifying;
  }

  private async processTenant(tenant: TenantRow): Promise<ProcessResult> {
    if (!isTriggerEnabled(tenant.enabledTriggers, TriggerType.BIRTHDAY)) {
      return { queued: 0, skippedWallet: 0, skippedNotConnected: 0 };
    }

    // Check A — WhatsApp connected
    if (tenant.waVerificationStatus !== WaVerificationStatus.VERIFIED) {
      return { queued: 0, skippedWallet: 0, skippedNotConnected: 1 };
    }

    // Check B — Marketing wallet has balance
    if (Number(tenant.marketingWalletBalance) <= 0) {
      this.logger.warn(
        `Birthday cron: skipping tenant ${tenant.id} — empty wallet`,
      );
      return { queued: 0, skippedWallet: 1, skippedNotConnected: 0 };
    }

    // Step 3 — Load birthday customers using EXTRACT in DB
    const tenantNow = DateTime.now().setZone(tenant.timezone);
    const currentMonth = tenantNow.month;
    const currentDay = tenantNow.day;

    const customers: CustomerRow[] = await this.dataSource.query(
      `SELECT c.id, c.full_name, c.phone_e164, c.wa_opted_in
       FROM customers c
       WHERE c.tenant_id = $1
         AND c.wa_opted_in = true
         AND c.is_active = true
         AND c.date_of_birth IS NOT NULL
         AND EXTRACT(MONTH FROM c.date_of_birth) = $2
         AND EXTRACT(DAY   FROM c.date_of_birth) = $3`,
      [tenant.id, currentMonth, currentDay],
    );

    // Steps 4 & 5 — Idempotency check then queue
    const startOfToday = tenantNow.startOf('day').toUTC().toJSDate();
    let queued = 0;

    for (const customer of customers) {
      const existing: Array<{ id: string }> = await this.dataSource.query(
        `SELECT id FROM trigger_logs
         WHERE customer_id = $1
           AND tenant_id = $2
           AND trigger_type = $3
           AND created_at >= $4
         LIMIT 1`,
        [customer.id, tenant.id, TriggerType.BIRTHDAY, startOfToday],
      );

      if (existing.length > 0) continue;

      // Step 5 — Queue the birthday message
      await this.waMessagesQueue.add(
        'send-message',
        {
          type: TriggerType.BIRTHDAY,
          tenantId: tenant.id,
          customerId: customer.id,
          data: {},
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        },
      );

      queued++;
    }

    return { queued, skippedWallet: 0, skippedNotConnected: 0 };
  }
}
