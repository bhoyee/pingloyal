import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { redisConfig } from './redis.config';
import { WaMessageProcessor } from './processors/wa-message.processor';
import { TriggerCheckProcessor } from './processors/trigger-check.processor';
import { CampaignSendProcessor } from './processors/campaign-send.processor';
import { IntegrationSyncProcessor } from './processors/integration-sync.processor';

export const QUEUE_NAMES = {
  WA_MESSAGES: 'wa-messages',
  TRIGGER_CHECK: 'trigger-check',
  CAMPAIGN_SEND: 'campaign-send',
  INTEGRATION_SYNC: 'integration-sync',
  SCHEDULED_JOBS: 'scheduled-jobs',
} as const;

@Global()
@Module({
  imports: [
    BullModule.forRoot(redisConfig),
    BullModule.registerQueue(
      {
        name: QUEUE_NAMES.WA_MESSAGES,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { count: 1000 },
          removeOnFail: false,
        },
      },
      {
        name: QUEUE_NAMES.TRIGGER_CHECK,
        defaultJobOptions: {
          attempts: 2,
          backoff: { type: 'fixed', delay: 2000 },
          removeOnComplete: true,
          removeOnFail: { count: 500 },
        },
      },
      {
        name: QUEUE_NAMES.CAMPAIGN_SEND,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 10_000 },
          removeOnComplete: { count: 500 },
          removeOnFail: false,
        },
      },
      {
        name: QUEUE_NAMES.INTEGRATION_SYNC,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: true,
          removeOnFail: { count: 100 },
        },
      },
      {
        name: QUEUE_NAMES.SCHEDULED_JOBS,
        defaultJobOptions: {
          attempts: 2,
          backoff: { type: 'fixed', delay: 5000 },
          removeOnComplete: true,
          removeOnFail: { count: 100 },
        },
      },
    ),
    BullBoardModule.forRoot({
      route: '/admin/queues',
      adapter: ExpressAdapter,
    }),
    BullBoardModule.forFeature(
      { name: QUEUE_NAMES.WA_MESSAGES, adapter: BullMQAdapter },
      { name: QUEUE_NAMES.TRIGGER_CHECK, adapter: BullMQAdapter },
      { name: QUEUE_NAMES.CAMPAIGN_SEND, adapter: BullMQAdapter },
      { name: QUEUE_NAMES.INTEGRATION_SYNC, adapter: BullMQAdapter },
      { name: QUEUE_NAMES.SCHEDULED_JOBS, adapter: BullMQAdapter },
    ),
  ],
  providers: [
    WaMessageProcessor,
    TriggerCheckProcessor,
    CampaignSendProcessor,
    IntegrationSyncProcessor,
  ],
  exports: [BullModule],
})
export class QueueModule {}
