import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Queue } from 'bullmq';
import {
  IntegrationConnectionType,
  IntegrationSyncStatus,
} from '@pingloyal/types';
import { Integration } from './entities/integration.entity';

@Injectable()
export class IntegrationSchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(IntegrationSchedulerService.name);

  constructor(
    @InjectQueue('integration-sync')
    private readonly integrationSyncQueue: Queue,
    @InjectRepository(Integration)
    private readonly integrationRepo: Repository<Integration>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.scheduleAll().catch((err) =>
      this.logger.error(
        `Failed to schedule integrations at startup: ${String(err)}`,
      ),
    );
  }

  async scheduleAll(): Promise<void> {
    const integrations = await this.integrationRepo.find({
      where: [
        {
          connectionType: IntegrationConnectionType.API_PULL,
          syncStatus: IntegrationSyncStatus.ACTIVE,
        },
        {
          connectionType: IntegrationConnectionType.API_PULL,
          syncStatus: IntegrationSyncStatus.PENDING,
        },
      ],
    });

    for (const integration of integrations) {
      await this.scheduleOne(integration).catch((err) =>
        this.logger.error(
          `Failed to schedule integration ${integration.id}: ${String(err)}`,
        ),
      );
    }

    this.logger.log(`Scheduled ${integrations.length} api_pull integration(s)`);
  }

  async scheduleOne(integration: Integration): Promise<void> {
    if (integration.connectionType !== IntegrationConnectionType.API_PULL)
      return;

    const every = integration.pollIntervalMins * 60 * 1000;
    const jobId = `poll-${integration.id}`;

    await this.integrationSyncQueue.add(
      'poll',
      { integrationId: integration.id, tenantId: integration.tenantId },
      {
        repeat: { every },
        jobId,
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 50 },
      },
    );

    this.logger.log(
      `Scheduled integration-sync job: id=${jobId} every=${integration.pollIntervalMins}min`,
    );
  }

  async unschedule(integrationId: string): Promise<void> {
    const jobId = `poll-${integrationId}`;
    try {
      const repeatableJobs =
        await this.integrationSyncQueue.getRepeatableJobs();
      const job = repeatableJobs.find((j) => j.key.includes(jobId));
      if (job) {
        await this.integrationSyncQueue.removeRepeatableByKey(job.key);
        this.logger.log(`Unscheduled integration-sync job: ${jobId}`);
      }
    } catch (err) {
      this.logger.error(`Failed to unschedule ${jobId}: ${String(err)}`);
    }
  }

  async triggerOnce(integrationId: string, tenantId: string): Promise<void> {
    await this.integrationSyncQueue.add('manual', { integrationId, tenantId });
  }
}
