import { Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import * as Sentry from '@sentry/node';

@Processor('wa-messages')
export class WaMessageProcessor extends WorkerHost {
  private readonly logger = new Logger(WaMessageProcessor.name);

  // eslint-disable-next-line @typescript-eslint/require-await
  async process(job: Job): Promise<void> {
    const type =
      typeof job.data === 'object' && job.data !== null && 'type' in job.data
        ? String((job.data as Record<string, unknown>)['type'])
        : 'unknown';
    this.logger.log(
      `WA message processor not yet implemented — jobId=${job.id} type=${type}`,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error): void {
    this.logger.error(
      `Job failed: queue=wa-messages jobId=${job.id} ` +
        `attempts=${job.attemptsMade}/${String(job.opts.attempts ?? 3)} ` +
        `error=${err.message}`,
      err.stack,
    );
    if (process.env.SENTRY_DSN) {
      Sentry.withScope((scope) => {
        scope.setExtra('queue', 'wa-messages');
        scope.setExtra('jobId', job.id);
        scope.setExtra('jobData', JSON.stringify(job.data).slice(0, 500));
        scope.setExtra('attempts', job.attemptsMade);
        Sentry.captureException(err);
      });
    }
  }

  @OnWorkerEvent('stalled')
  onStalled(jobId: string): void {
    this.logger.warn(`Job stalled: queue=wa-messages jobId=${jobId}`);
  }
}
