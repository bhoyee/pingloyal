import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { DateTime } from 'luxon';
import Redis from 'ioredis';
import { TriggerType } from '@pingloyal/types';
import { isTriggerEnabled } from '@pingloyal/utils';
import { REDIS_CLIENT } from '../../common/redis/redis.constants';
import { Tenant } from '../tenants/entities/tenant.entity';

// The subset of trigger types that are user-toggleable from the Triggers page.
export const TOGGLEABLE_TRIGGER_TYPES = [
  TriggerType.WELCOME,
  TriggerType.THRESHOLD_NUDGE,
  TriggerType.REWARD_UNLOCKED,
  TriggerType.BIRTHDAY,
  TriggerType.LAPSED_WINBACK,
] as const;

// All trigger types that can be toggled via PATCH /triggers/:type, including
// the WA Bot's balance-reply (configured from its own page, not the Triggers page).
const ALL_TOGGLEABLE_TYPES = [
  ...TOGGLEABLE_TRIGGER_TYPES,
  TriggerType.BALANCE_BOT_REPLY,
] as const;

interface TriggerLogCountRow {
  trigger_type: string;
  today: string;
  this_month: string;
  all_time: string;
}

export interface TriggerConfigResponse {
  type: string;
  enabled: boolean;
  sentToday: number;
  sentThisMonth: number;
  allTime: number;
  pendingToday: number | null;
  timezone: string;
}

@Injectable()
export class TriggersService {
  constructor(
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async getConfig(tenantId: string): Promise<TriggerConfigResponse[]> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const countByType = await this.getLogCounts(tenantId, tenant.timezone);
    const pendingLapsed = await this.countPendingLapsed(tenant);

    return TOGGLEABLE_TRIGGER_TYPES.map((type) =>
      this.buildConfig(tenant, type, countByType, pendingLapsed),
    );
  }

  async getBotConfig(tenantId: string): Promise<TriggerConfigResponse> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const countByType = await this.getLogCounts(tenantId, tenant.timezone);
    return this.buildConfig(
      tenant,
      TriggerType.BALANCE_BOT_REPLY,
      countByType,
      null,
    );
  }

  private buildConfig(
    tenant: Tenant,
    type: string,
    countByType: Map<string, TriggerLogCountRow>,
    pendingLapsed: number | null,
  ): TriggerConfigResponse {
    const row = countByType.get(type);
    return {
      type,
      enabled: isTriggerEnabled(tenant.enabledTriggers, type),
      sentToday: row ? Number(row.today) : 0,
      sentThisMonth: row ? Number(row.this_month) : 0,
      allTime: row ? Number(row.all_time) : 0,
      pendingToday:
        type === (TriggerType.LAPSED_WINBACK as string) ? pendingLapsed : null,
      timezone: tenant.timezone,
    };
  }

  private async getLogCounts(
    tenantId: string,
    timezone: string,
  ): Promise<Map<string, TriggerLogCountRow>> {
    const tenantNow = DateTime.now().setZone(timezone);
    const startOfToday = tenantNow.startOf('day').toUTC().toJSDate();
    const startOfMonth = tenantNow.startOf('month').toUTC().toJSDate();

    const counts: TriggerLogCountRow[] = await this.dataSource.query(
      `SELECT trigger_type,
              COUNT(*) FILTER (WHERE created_at >= $2 AND status != 'skipped') AS today,
              COUNT(*) FILTER (WHERE created_at >= $3 AND status != 'skipped') AS this_month,
              COUNT(*) FILTER (WHERE status != 'skipped') AS all_time
       FROM trigger_logs
       WHERE tenant_id = $1
       GROUP BY trigger_type`,
      [tenantId, startOfToday, startOfMonth],
    );
    return new Map(counts.map((row) => [row.trigger_type, row]));
  }

  async setEnabled(
    tenantId: string,
    type: string,
    enabled: boolean,
  ): Promise<{ type: string; enabled: boolean }> {
    if (!(ALL_TOGGLEABLE_TYPES as readonly string[]).includes(type)) {
      throw new BadRequestException(`Unknown trigger type: ${type}`);
    }

    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const enabledTriggers = {
      ...(tenant.enabledTriggers ?? {}),
      [type]: enabled,
    };
    await this.tenantRepo.update(tenantId, { enabledTriggers });
    await Promise.all([
      this.redis.del(`tenant:${tenantId}`),
      this.redis.del(`tenant:full:${tenantId}`),
      this.redis.del(`tenant:sub:${tenantId}`),
    ]);

    return { type, enabled };
  }

  private async countPendingLapsed(tenant: Tenant): Promise<number> {
    const cutoffDate = new Date(
      Date.now() - tenant.lapsedDays * 24 * 3600 * 1000,
    );
    const cooldownDate = new Date(Date.now() - 30 * 24 * 3600 * 1000);

    const rows: Array<{ count: string }> = await this.dataSource.query(
      `SELECT COUNT(*) AS count
       FROM customers
       WHERE tenant_id = $1
         AND wa_opted_in = true
         AND is_active = true
         AND last_purchase_at IS NOT NULL
         AND last_purchase_at < $2
         AND (lapsed_sent_at IS NULL OR lapsed_sent_at < $3)`,
      [tenant.id, cutoffDate, cooldownDate],
    );

    return Number(rows[0]?.count ?? 0);
  }
}
