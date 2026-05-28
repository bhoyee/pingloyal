import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Repository } from 'typeorm';
import { Job, Queue } from 'bullmq';
import * as Sentry from '@sentry/node';
import { TriggerType, WaVerificationStatus } from '@pingloyal/types';
import { TenantsService } from '../../modules/tenants/tenants.service';
import { Customer } from '../../modules/customers/entities/customer.entity';

interface TriggerCheckJobPayload {
  tenantId: string;
  customerId: string;
  transactionId: string;
}

const NUDGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const REWARD_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

@Processor('trigger-check')
export class TriggerCheckProcessor extends WorkerHost {
  private readonly logger = new Logger(TriggerCheckProcessor.name);

  constructor(
    @InjectQueue('wa-messages') private readonly waQueue: Queue,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    private readonly tenantService: TenantsService,
  ) {
    super();
  }

  async process(job: Job<TriggerCheckJobPayload>): Promise<void> {
    const { tenantId, customerId } = job.data;

    const [customer, tenant] = await Promise.all([
      this.customerRepo.findOne({
        where: { id: customerId, tenantId, isActive: true },
      }),
      this.tenantService.findOne(tenantId).catch(() => null),
    ]);

    if (!customer || !tenant) {
      this.logger.warn(
        `Trigger check skipped — not found: customerId=${customerId} tenantId=${tenantId}`,
      );
      return;
    }

    if (!customer.waOptedIn) {
      this.logger.debug(
        `Trigger check skipped — not opted in: customerId=${customerId}`,
      );
      return;
    }

    if (tenant.waVerificationStatus !== WaVerificationStatus.VERIFIED) {
      this.logger.debug(
        `Trigger check skipped — WA not connected: tenantId=${tenantId}`,
      );
      return;
    }

    const pct =
      Number(customer.pointsBalance) / Number(tenant.pointsThreshold);
    const now = Date.now();

    if (pct >= 0.8 && pct < 1.0) {
      const lastNudge = customer.nudgeSentAt
        ? customer.nudgeSentAt.getTime()
        : 0;
      if (now - lastNudge >= NUDGE_COOLDOWN_MS) {
        const pointsNeeded =
          Number(tenant.pointsThreshold) - Number(customer.pointsBalance);
        const earnRate = Number(tenant.pointsEarnRate);
        const amountToGoal =
          Math.ceil((pointsNeeded * earnRate) / 100) * 100;

        await this.waQueue
          .add('send', {
            type: TriggerType.THRESHOLD_NUDGE,
            tenantId,
            customerId,
            data: { amountToGoal: amountToGoal.toString() },
          })
          .catch((err: unknown) => {
            this.logger.error(
              `Failed to enqueue THRESHOLD_NUDGE: customerId=${customerId}`,
              err instanceof Error ? err.stack : String(err),
            );
          });

        await this.customerRepo.update(customer.id, {
          nudgeSentAt: new Date(),
        });
      }
      return;
    }

    if (pct >= 1.0) {
      const lastReward = customer.rewardSentAt
        ? customer.rewardSentAt.getTime()
        : 0;
      if (now - lastReward >= REWARD_COOLDOWN_MS) {
        await this.waQueue
          .add('send', {
            type: TriggerType.REWARD_UNLOCKED,
            tenantId,
            customerId,
            data: {},
          })
          .catch((err: unknown) => {
            this.logger.error(
              `Failed to enqueue REWARD_UNLOCKED: customerId=${customerId}`,
              err instanceof Error ? err.stack : String(err),
            );
          });

        await this.customerRepo.update(customer.id, {
          rewardSentAt: new Date(),
        });
      }
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error): void {
    this.logger.error(
      `Job failed: queue=trigger-check jobId=${job.id} ` +
        `attempts=${job.attemptsMade}/${String(job.opts.attempts ?? 2)} ` +
        `error=${err.message}`,
      err.stack,
    );
    if (process.env.SENTRY_DSN) {
      Sentry.withScope((scope) => {
        scope.setExtra('queue', 'trigger-check');
        scope.setExtra('jobId', job.id);
        scope.setExtra('jobData', JSON.stringify(job.data).slice(0, 500));
        scope.setExtra('attempts', job.attemptsMade);
        Sentry.captureException(err);
      });
    }
  }

  @OnWorkerEvent('stalled')
  onStalled(jobId: string): void {
    this.logger.warn(`Job stalled: queue=trigger-check jobId=${jobId}`);
  }
}
