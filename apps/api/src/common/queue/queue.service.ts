import { Injectable, Logger } from '@nestjs/common';

export interface WelcomeTriggerPayload {
  customerId: string;
  tenantId: string;
  phoneE164: string;
}

/**
 * Placeholder queue — logs jobs to console.
 * Will be replaced by BullMQ in Prompt 21.
 */
@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  enqueueWelcomeTrigger(payload: WelcomeTriggerPayload): Promise<void> {
    this.logger.log(
      `[QUEUE] welcome_trigger enqueued — customerId=${payload.customerId} tenantId=${payload.tenantId}`,
    );
    return Promise.resolve();
  }
}
