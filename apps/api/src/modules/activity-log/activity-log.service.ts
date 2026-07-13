import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ActivityLog } from './entities/activity-log.entity';

export interface LogEntry {
  tenantId: string;
  actorId?: string | null;
  actorRole?: string | null;
  actorName?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  description: string;
  metadata?: Record<string, unknown> | null;
}

export interface ActivityLogListResult {
  data: ActivityLog[];
  total: number;
  page: number;
  limit: number;
}

const RETENTION_DAYS = 90;

@Injectable()
export class ActivityLogService {
  private readonly logger = new Logger(ActivityLogService.name);

  constructor(
    @InjectRepository(ActivityLog)
    private readonly repo: Repository<ActivityLog>,
  ) {}

  async log(entry: LogEntry): Promise<void> {
    try {
      let actorName = entry.actorName ?? null;
      if (!actorName && entry.actorId) {
        const rows = await this.repo.manager.query(
          'SELECT full_name FROM users WHERE id = $1 LIMIT 1',
          [entry.actorId],
        ) as Array<{ full_name: string }>;
        actorName = rows[0]?.full_name ?? null;
      }
      await this.repo.save(
        this.repo.create({
          tenantId: entry.tenantId,
          actorId: entry.actorId ?? null,
          actorRole: entry.actorRole ?? null,
          actorName,
          action: entry.action,
          entityType: entry.entityType ?? null,
          entityId: entry.entityId ?? null,
          description: entry.description,
          metadata: entry.metadata ?? null,
        }),
      );
    } catch (err) {
      this.logger.warn(`Failed to write activity log [${entry.action}]: ${String(err)}`);
    }
  }

  async list(
    tenantId: string,
    query: {
      page?: number;
      limit?: number;
      action?: string;
      startDate?: string;
      endDate?: string;
    },
  ): Promise<ActivityLogListResult> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(query.limit ?? 50, 100);

    const qb = this.repo
      .createQueryBuilder('al')
      .where('al.tenant_id = :tenantId', { tenantId })
      .orderBy('al.created_at', 'DESC');

    if (query.action) {
      qb.andWhere('al.action = :action', { action: query.action });
    }
    if (query.startDate) {
      qb.andWhere('al.created_at >= :start', { start: query.startDate });
    }
    if (query.endDate) {
      qb.andWhere('al.created_at <= :end', {
        end: query.endDate + 'T23:59:59.999Z',
      });
    }

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit };
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async purgeOld(): Promise<void> {
    try {
      const result = await this.repo
        .createQueryBuilder()
        .delete()
        .from(ActivityLog)
        .where(`created_at < NOW() - INTERVAL '${RETENTION_DAYS} days'`)
        .execute();
      this.logger.log(`Activity log purge: removed ${result.affected ?? 0} entries older than ${RETENTION_DAYS} days`);
    } catch (err) {
      this.logger.error(`Activity log purge failed: ${String(err)}`);
    }
  }
}
