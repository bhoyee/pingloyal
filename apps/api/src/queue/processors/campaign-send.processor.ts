import { Inject, Logger, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import * as Sentry from '@sentry/node';
import { CampaignLogStatus } from '@pingloyal/types';
import { TenantsService } from '../../modules/tenants/tenants.service';
import { BspService } from '../../modules/whatsapp/bsp.service';
import { CampaignsService } from '../../modules/campaigns/campaigns.service';
import { Campaign } from '../../modules/campaigns/entities/campaign.entity';
import { CampaignLog } from '../../modules/campaigns/entities/campaign-log.entity';
import { Customer } from '../../modules/customers/entities/customer.entity';
import { TierConfig } from '../../modules/tenants/entities/tier-config.entity';

interface CampaignSendJobPayload {
  tenantId: string;
  campaignId: string;
  customerId: string;
}

interface FanOutJobPayload {
  tenantId: string;
  campaignId: string;
}

@Processor('campaign-send')
export class CampaignSendProcessor extends WorkerHost {
  private readonly logger = new Logger(CampaignSendProcessor.name);

  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepo: Repository<Campaign>,
    @InjectRepository(CampaignLog)
    private readonly campaignLogRepo: Repository<CampaignLog>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(TierConfig)
    private readonly tierConfigRepo: Repository<TierConfig>,
    private readonly tenantService: TenantsService,
    private readonly bspService: BspService,
    @Inject(forwardRef(() => CampaignsService))
    private readonly campaignsService: CampaignsService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    // Fan-out job from send() endpoint (no customerId)
    if (
      !('customerId' in job.data) ||
      !(job.data as CampaignSendJobPayload).customerId
    ) {
      const { tenantId, campaignId } = job.data as FanOutJobPayload;
      await this.campaignsService.dispatch(tenantId, campaignId);
      return;
    }

    await this.processPerRecipient(job.data as CampaignSendJobPayload);
  }

  private async processPerRecipient(
    payload: CampaignSendJobPayload,
  ): Promise<void> {
    const { tenantId, campaignId, customerId } = payload;

    // Step 1 — Load required data in parallel
    const [customer, campaign, tenant] = await Promise.all([
      this.customerRepo.findOne({ where: { id: customerId, tenantId } }),
      this.campaignRepo.findOne({ where: { id: campaignId, tenantId } }),
      this.tenantService.findOne(tenantId).catch(() => null),
    ]);

    if (!customer || !campaign || !tenant) {
      this.logger.warn(
        `Campaign send skipped — data not found: ` +
          `campaignId=${campaignId} customerId=${customerId}`,
      );
      return;
    }

    // Step 2 — Find campaign log
    const campaignLog = await this.campaignLogRepo.findOne({
      where: {
        campaign: { id: campaignId },
        customer: { id: customerId },
        tenantId,
        status: CampaignLogStatus.QUEUED,
      },
    });

    if (!campaignLog) {
      this.logger.warn(
        `Campaign log not found or already processed: ` +
          `campaignId=${campaignId} customerId=${customerId}`,
      );
      return;
    }

    // Step 3 — Verify customer is still opted in
    if (!customer.waOptedIn) {
      await this.campaignLogRepo.update(campaignLog.id, {
        status: CampaignLogStatus.FAILED,
        errorMessage: 'customer_not_opted_in',
        failedAt: new Date(),
      });
      await this.campaignRepo
        .createQueryBuilder()
        .update(Campaign)
        .set({ failedCount: () => 'failed_count + 1' })
        .where('id = :id AND tenant_id = :tenantId', {
          id: campaignId,
          tenantId,
        })
        .execute();
      await this.campaignsService.checkCampaignCompletion(
        campaignId,
        tenantId,
        campaign.totalRecipients,
      );
      return;
    }

    // Step 4 — Variable substitution
    const tierLabel = await this.getTierLabel(customer.tierId, tenantId);
    const vars: Record<string, string> = {
      firstName: customer.fullName.split(' ')[0],
      fullName: customer.fullName,
      points: customer.pointsBalance.toString(),
      tier: tierLabel ?? 'Valued Customer',
      businessName: tenant.businessName,
      rewardValue: tenant.rewardValue.toString(),
    };

    let message = campaign.messageBody;
    for (const [key, value] of Object.entries(vars)) {
      message = message.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }

    // Step 5 — Send via BspService using pingloyal_campaign template
    let result: { messageId: string };
    try {
      result = await this.bspService.sendMessage({
        customerPhone: customer.phoneE164,
        templateName: 'pingloyal_campaign',
        templateParams: [message],
        tenantGupshupApiKey: tenant.gupshupApiKey!,
        tenantAppId: tenant.gupshupAppId!,
        tenantPhoneNumber: tenant.waPhoneNumber!,
      });
    } catch (err: unknown) {
      // Step 6 — BSP error: update log, increment failedCount, re-throw for retry
      const errMsg =
        err instanceof Error ? err.message.slice(0, 200) : String(err);

      await this.campaignLogRepo.update(campaignLog.id, {
        status: CampaignLogStatus.FAILED,
        errorMessage: errMsg,
        failedAt: new Date(),
      });
      await this.campaignRepo
        .createQueryBuilder()
        .update(Campaign)
        .set({ failedCount: () => 'failed_count + 1' })
        .where('id = :id AND tenant_id = :tenantId', {
          id: campaignId,
          tenantId,
        })
        .execute();
      await this.campaignsService.checkCampaignCompletion(
        campaignId,
        tenantId,
        campaign.totalRecipients,
      );
      throw err;
    }

    // Step 5 (success) — Update log and increment sentCount atomically
    await this.campaignLogRepo.update(campaignLog.id, {
      status: CampaignLogStatus.SENT,
      waMessageId: result.messageId,
      sentAt: new Date(),
    });
    await this.campaignRepo
      .createQueryBuilder()
      .update(Campaign)
      .set({ sentCount: () => 'sent_count + 1' })
      .where('id = :id AND tenant_id = :tenantId', { id: campaignId, tenantId })
      .execute();

    await this.campaignsService.checkCampaignCompletion(
      campaignId,
      tenantId,
      campaign.totalRecipients,
    );
  }

  private async getTierLabel(
    tierId: string | null,
    tenantId: string,
  ): Promise<string | null> {
    if (!tierId) return null;
    const tier = await this.tierConfigRepo.findOne({
      where: { id: tierId, tenantId },
    });
    return tier?.tierLabel ?? null;
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error): void {
    this.logger.error(
      `Job failed: queue=campaign-send jobId=${job.id} ` +
        `attempts=${job.attemptsMade}/${String(job.opts.attempts ?? 3)} ` +
        `error=${err.message}`,
      err.stack,
    );
    if (process.env.SENTRY_DSN) {
      Sentry.withScope((scope) => {
        scope.setExtra('queue', 'campaign-send');
        scope.setExtra('jobId', job.id);
        scope.setExtra('jobData', JSON.stringify(job.data).slice(0, 500));
        scope.setExtra('attempts', job.attemptsMade);
        Sentry.captureException(err);
      });
    }
  }

  @OnWorkerEvent('stalled')
  onStalled(jobId: string): void {
    this.logger.warn(`Job stalled: queue=campaign-send jobId=${jobId}`);
  }
}
