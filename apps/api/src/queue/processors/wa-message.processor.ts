import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import * as Sentry from '@sentry/node';
import {
  CampaignLogStatus,
  SkipReason,
  TriggerStatus,
  TriggerType,
  WaVerificationStatus,
} from '@pingloyal/types';
import { TenantsService } from '../../modules/tenants/tenants.service';
import { BspService } from '../../modules/whatsapp/bsp.service';
import { WalletService } from '../../modules/billing/wallet.service';
import { UtilityTrackingService } from '../../modules/billing/utility-tracking.service';
import { MessageBuilderService } from '../message-builder.service';
import { Customer } from '../../modules/customers/entities/customer.entity';
import { TriggerLog } from '../../modules/triggers/entities/trigger-log.entity';
import { Campaign } from '../../modules/campaigns/entities/campaign.entity';
import { CampaignLog } from '../../modules/campaigns/entities/campaign-log.entity';

interface WaMessageJobPayload {
  type: TriggerType;
  tenantId: string;
  customerId: string | null;
  data: Record<string, string>;
  campaignLogId?: string;
  campaignId?: string;
}

const MARKETING_TYPES = new Set<TriggerType>([
  TriggerType.BIRTHDAY,
  TriggerType.LAPSED_WINBACK,
  TriggerType.CAMPAIGN_MESSAGE,
]);

const UTILITY_TYPES = new Set<TriggerType>([
  TriggerType.WELCOME,
  TriggerType.PURCHASE_CONFIRMATION,
  TriggerType.THRESHOLD_NUDGE,
  TriggerType.REWARD_UNLOCKED,
]);

const OWNER_ALERT_TYPES = new Set<TriggerType>([
  TriggerType.WALLET_LOW_BALANCE,
  TriggerType.WALLET_ZERO,
]);

// Default marketing message cost in kobo until tenant subscription exposes a rate
const DEFAULT_MARKETING_RATE = 130;

@Processor('wa-messages')
export class WaMessageProcessor extends WorkerHost {
  private readonly logger = new Logger(WaMessageProcessor.name);

  constructor(
    private readonly tenantService: TenantsService,
    private readonly bspService: BspService,
    private readonly walletService: WalletService,
    private readonly utilityTrackingService: UtilityTrackingService,
    private readonly messageBuilder: MessageBuilderService,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(TriggerLog)
    private readonly triggerLogRepo: Repository<TriggerLog>,
    @InjectRepository(Campaign)
    private readonly campaignRepo: Repository<Campaign>,
    @InjectRepository(CampaignLog)
    private readonly campaignLogRepo: Repository<CampaignLog>,
  ) {
    super();
  }

  async process(job: Job<WaMessageJobPayload>): Promise<void> {
    const { type, tenantId, customerId, data, campaignLogId, campaignId } =
      job.data;

    // Step 1 — Load tenant
    let tenant: Awaited<ReturnType<TenantsService['findOne']>>;
    try {
      tenant = await this.tenantService.findOne(tenantId);
    } catch {
      this.logger.warn(
        `WA job skipped — tenant not found: tenantId=${tenantId} type=${type}`,
      );
      return;
    }

    // Step 2 — Determine recipient
    if (OWNER_ALERT_TYPES.has(type)) {
      // TODO: Owner phone not stored on users table yet — wallet alerts deferred
      // until owner profile is extended with a phone field.
      this.logger.warn(
        `Owner phone not available — wallet alert skipped: type=${type} tenantId=${tenantId}`,
      );
      return;
    }

    if (!customerId) {
      this.logger.warn(
        `WA job missing customerId: type=${type} tenantId=${tenantId}`,
      );
      return;
    }

    const customer = await this.customerRepo.findOne({
      where: { id: customerId, tenantId, isActive: true },
    });

    // Step 3 — HARD GATE: wa_opted_in check
    if (!customer) {
      this.logger.warn(
        `WA job skipped — customer not found: customerId=${customerId} tenantId=${tenantId}`,
      );
      return;
    }

    if (!customer.waOptedIn) {
      await this.logTrigger(
        tenantId,
        customerId,
        type,
        TriggerStatus.SKIPPED,
        SkipReason.NOT_OPTED_IN,
      );
      return;
    }

    // Step 4 — Verify tenant WhatsApp connected
    if (tenant.waVerificationStatus !== WaVerificationStatus.VERIFIED) {
      await this.logTrigger(
        tenantId,
        customerId,
        type,
        TriggerStatus.SKIPPED,
        SkipReason.WA_NOT_CONNECTED,
      );
      return;
    }

    // Step 5 — Wallet gate for MARKETING_TYPES
    const isMarketing = MARKETING_TYPES.has(type);
    const marketingRate = DEFAULT_MARKETING_RATE;
    let walletDeducted = false;

    if (isMarketing) {
      const walletResult = await this.walletService.deductMarketing(
        tenantId,
        type,
        marketingRate,
        `${type} — ${customer.fullName}`,
        campaignLogId ?? null,
      );

      if (!walletResult.success) {
        await this.logTrigger(
          tenantId,
          customerId,
          type,
          TriggerStatus.SKIPPED,
          SkipReason.WALLET_EMPTY,
        );
        if (campaignLogId && campaignId) {
          await this.campaignLogRepo.update(campaignLogId, {
            status: CampaignLogStatus.FAILED,
            errorMessage: 'wallet_empty',
            failedAt: new Date(),
          });
          await this.campaignRepo.increment(
            { id: campaignId },
            'failedCount',
            1,
          );
        }
        return;
      }

      walletDeducted = true;
    }

    // Step 6 — Build message
    const built = this.messageBuilder.build(type, customer, tenant, data);

    // Raw-message types (CAMPAIGN_MESSAGE, BALANCE_BOT_REPLY) need a separate
    // BSP path not yet implemented — deferred to Prompt 28.
    if (built.templateName === null) {
      this.logger.warn(
        `Raw message send deferred — type=${type} tenantId=${tenantId} customerId=${customerId}`,
      );
      if (walletDeducted) {
        await this.walletService.creditWallet(
          tenantId,
          marketingRate,
          'refund_deferred_send',
        );
      }
      return;
    }

    // Step 7 — Send via BspService
    let result: { messageId: string };
    try {
      result = await this.bspService.sendMessage({
        customerPhone: customer.phoneE164,
        templateName: built.templateName,
        templateParams: built.variables,
        tenantGupshupApiKey: tenant.gupshupApiKey!,
        tenantAppId: tenant.gupshupAppId!,
        tenantPhoneNumber: tenant.waPhoneNumber!,
      });
    } catch (err: unknown) {
      // Step 9 — BSP error: log, refund if marketing, re-throw for BullMQ retry
      const errMsg =
        err instanceof Error
          ? err.message.slice(0, 100)
          : String(err).slice(0, 100);

      await this.logTrigger(
        tenantId,
        customerId,
        type,
        TriggerStatus.FAILED,
        errMsg,
      );

      if (walletDeducted) {
        await this.walletService.creditWallet(
          tenantId,
          marketingRate,
          'refund_failed_send',
        );
      }

      if (campaignLogId && campaignId) {
        await this.campaignLogRepo.update(campaignLogId, {
          status: CampaignLogStatus.FAILED,
          errorMessage: errMsg,
          failedAt: new Date(),
        });
        await this.campaignRepo.increment({ id: campaignId }, 'failedCount', 1);
      }

      throw err;
    }

    // Step 8 — Success
    await this.logTrigger(
      tenantId,
      customerId,
      type,
      TriggerStatus.SENT,
      null,
      result.messageId,
    );

    if (campaignLogId && campaignId) {
      await this.campaignLogRepo.update(campaignLogId, {
        status: CampaignLogStatus.SENT,
        waMessageId: result.messageId,
        sentAt: new Date(),
      });
      await this.campaignRepo.increment({ id: campaignId }, 'sentCount', 1);
    }

    // Track utility usage — fire-and-forget; never fails the job
    if (UTILITY_TYPES.has(type)) {
      this.utilityTrackingService
        .trackUtilityMessage(tenantId)
        .catch((err) =>
          this.logger.error(
            `Utility tracking failed for tenant ${tenantId}`,
            err,
          ),
        );
    }
  }

  private async logTrigger(
    tenantId: string,
    customerId: string | null,
    type: TriggerType,
    status: TriggerStatus,
    skipReason?: SkipReason | string | null,
    waMessageId?: string,
  ): Promise<void> {
    const log = this.triggerLogRepo.create({
      tenantId,
      triggerType: type,
      status,
      skipReason: (skipReason ?? null) as SkipReason | null,
      waMessageId: waMessageId ?? null,
    });
    if (customerId) {
      log.customer = { id: customerId } as unknown as Customer;
    }
    await this.triggerLogRepo.save(log);
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
