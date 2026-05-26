import { Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import * as Sentry from '@sentry/node';

@Processor('trigger-check')
export class TriggerCheckProcessor extends WorkerHost {
  private readonly logger = new Logger(TriggerCheckProcessor.name);

  // eslint-disable-next-line @typescript-eslint/require-await
  async process(job: Job): Promise<void> {
    this.logger.log(
      `Trigger check processor not yet implemented — jobId=${job.id}`,
    );
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
