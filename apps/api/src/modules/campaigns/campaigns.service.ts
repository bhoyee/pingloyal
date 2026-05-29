import { createHash } from 'crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { CampaignStatus, WaVerificationStatus } from '@pingloyal/types';
import { REDIS_CLIENT } from '../../common/redis/redis.constants';
import { TenantsService } from '../tenants/tenants.service';
import { Campaign } from './entities/campaign.entity';
import { Subscription } from '../billing/entities/subscription.entity';
import { Customer } from '../customers/entities/customer.entity';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { ScheduleCampaignDto } from './dto/schedule-campaign.dto';
import { SegmentRulesDto } from './dto/segment-rules.dto';

const PREVIEW_CACHE_TTL_S = 60;
const SCHEDULE_MIN_LEAD_MS = 5 * 60 * 1000;

export interface AudiencePreviewResult {
  count: number;
  sampleNames: string[];
}

export interface SendCampaignResult {
  message: string;
  totalRecipients: number;
  estimatedCost: number;
  walletBalance: number;
  warning?: string;
}

export interface CampaignTemplate {
  id: string;
  name: string;
  body: string;
}

const TEMPLATES: CampaignTemplate[] = [
  {
    id: 'weekend-promo',
    name: 'Weekend Promo',
    body: 'Hi {{firstName}}! 🛍️ This weekend only, shop at {{businessName}} and earn DOUBLE points on every purchase. You currently have {{points}} points — a great opportunity to reach your reward faster!',
  },
  {
    id: 'vip-appreciation',
    name: 'VIP Appreciation',
    body: 'Hi {{firstName}}! 👑 As one of our {{tier}} members, we want to say thank you. Your loyalty means everything to {{businessName}}. You have earned {{points}} points — keep going!',
  },
  {
    id: 'new-arrival',
    name: 'New Arrival',
    body: 'Hi {{firstName}}! ✨ New items have just arrived at {{businessName}}. Come in this week and earn your loyalty points while exploring our latest products!',
  },
  {
    id: 'holiday-greeting',
    name: 'Holiday Greeting',
    body: "Season's greetings from {{businessName}}, {{firstName}}! 🎉 Wishing you and your family a wonderful holiday. As a thank you for your loyalty, enjoy DOUBLE points on all purchases this week!",
  },
  {
    id: 'eid-mubarak',
    name: 'Eid Mubarak',
    body: 'Eid Mubarak, {{firstName}}! 🌙 From all of us at {{businessName}}, we wish you and your family a joyful celebration. Come celebrate with us and earn your loyalty points!',
  },
  {
    id: 'flash-sale',
    name: 'Flash Sale',
    body: "FLASH SALE at {{businessName}}! ⚡ {{firstName}}, this offer ends in 24 hours. Come in today for exclusive deals and earn loyalty points on every purchase. Don't miss out!",
  },
  {
    id: 'category-promo',
    name: 'Category Promo',
    body: 'Hi {{firstName}}! 🎁 Based on your shopping history at {{businessName}}, we have a special offer just for you. Visit us this week for great deals and earn {{points}} points!',
  },
  {
    id: 'win-back-special',
    name: 'Win-Back Special',
    body: "We miss you, {{firstName}}! 💙 It's been a while since your last visit to {{businessName}}. Come back this week and we'll make it worth your while. Your {{points}} points are waiting!",
  },
];

@Injectable()
export class CampaignsService {
  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepo: Repository<Campaign>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    @InjectQueue('campaign-send')
    private readonly campaignSendQueue: Queue,
    @InjectQueue('scheduled-jobs')
    private readonly scheduledJobsQueue: Queue,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly tenantsService: TenantsService,
  ) {}

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async create(
    tenantId: string,
    dto: CreateCampaignDto,
    userId: string,
  ): Promise<Campaign> {
    const campaign = this.campaignRepo.create({
      tenantId,
      name: dto.name,
      messageBody: dto.messageBody,
      segmentRules: (dto.segmentRules as Record<string, unknown>) ?? {},
      status: CampaignStatus.DRAFT,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
      createdBy: { id: userId } as never,
    });
    return this.campaignRepo.save(campaign);
  }

  async findAll(tenantId: string): Promise<Campaign[]> {
    return this.campaignRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(tenantId: string, id: string): Promise<Campaign> {
    const campaign = await this.campaignRepo.findOne({
      where: { id, tenantId },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateCampaignDto,
  ): Promise<Campaign> {
    const campaign = await this.findOne(tenantId, id);
    if (campaign.status !== CampaignStatus.DRAFT) {
      throw new BadRequestException('Only draft campaigns can be edited');
    }
    Object.assign(campaign, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.messageBody !== undefined && { messageBody: dto.messageBody }),
      ...(dto.segmentRules !== undefined && {
        segmentRules: dto.segmentRules as Record<string, unknown>,
      }),
      ...(dto.scheduledAt !== undefined && {
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
      }),
    });
    return this.campaignRepo.save(campaign);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const campaign = await this.findOne(tenantId, id);
    if (campaign.status === CampaignStatus.SENT) {
      throw new BadRequestException('Sent campaigns cannot be deleted');
    }
    await this.campaignRepo.remove(campaign);
  }

  // ── Audience ──────────────────────────────────────────────────────────────

  buildAudienceQuery(
    tenantId: string,
    segmentRules: Partial<SegmentRulesDto>,
    lapsedDays: number,
  ): SelectQueryBuilder<Customer> {
    const qb = this.customerRepo
      .createQueryBuilder('c')
      .where('c.tenantId = :tenantId', { tenantId })
      .andWhere('c.waOptedIn = true')
      .andWhere('c.isActive = true');

    if (segmentRules.tierIds?.length) {
      qb.andWhere('c.tierId IN (:...tierIds)', {
        tierIds: segmentRules.tierIds,
      });
    }

    if (segmentRules.categoryIds?.length) {
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM transactions t
          WHERE t.customer_id = c.id
            AND t.tenant_id = :tenantId
            AND t.category_id IN (:...categoryIds)
        )`,
        { tenantId, categoryIds: segmentRules.categoryIds },
      );
    }

    if (segmentRules.minPoints !== undefined) {
      qb.andWhere('c.pointsBalance >= :minPoints', {
        minPoints: segmentRules.minPoints,
      });
    }

    if (segmentRules.activityStatus === 'active') {
      qb.andWhere(
        `c.lastPurchaseAt >= NOW() - (:lapsedDays * INTERVAL '1 day')`,
        { lapsedDays },
      );
    } else if (segmentRules.activityStatus === 'inactive') {
      qb.andWhere(
        `(c.lastPurchaseAt < NOW() - (:lapsedDays * INTERVAL '1 day') OR c.lastPurchaseAt IS NULL)`,
        { lapsedDays },
      );
    }

    return qb;
  }

  async audiencePreview(
    tenantId: string,
    segmentRules: Partial<SegmentRulesDto>,
  ): Promise<AudiencePreviewResult> {
    const sorted = JSON.stringify(
      segmentRules,
      Object.keys(segmentRules).sort(),
    );
    const hash = createHash('sha256')
      .update(tenantId + sorted)
      .digest('hex')
      .slice(0, 16);
    const cacheKey = `audience:preview:${hash}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as AudiencePreviewResult;

    const tenant = await this.tenantsService.findOne(tenantId);
    const qb = this.buildAudienceQuery(
      tenantId,
      segmentRules,
      tenant.lapsedDays,
    );

    const [countResult, samples] = await Promise.all([
      qb.clone().select('COUNT(*)', 'count').getRawOne<{ count: string }>(),
      qb.clone().select('c.fullName').orderBy('RANDOM()').limit(5).getMany(),
    ]);

    const result: AudiencePreviewResult = {
      count: parseInt(countResult?.count ?? '0', 10),
      sampleNames: samples.map((c) => c.fullName),
    };

    await this.redis.set(
      cacheKey,
      JSON.stringify(result),
      'EX',
      PREVIEW_CACHE_TTL_S,
    );
    return result;
  }

  // ── Send / Schedule / Cancel ──────────────────────────────────────────────

  async send(
    tenantId: string,
    campaignId: string,
  ): Promise<SendCampaignResult> {
    const campaign = await this.findOne(tenantId, campaignId);

    if (
      campaign.status === CampaignStatus.SENDING ||
      campaign.status === CampaignStatus.SENT ||
      campaign.status === CampaignStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Campaign cannot be sent in its current status',
      );
    }

    const tenant = await this.tenantsService.findOne(tenantId);

    if (tenant.waVerificationStatus !== WaVerificationStatus.VERIFIED) {
      throw new BadRequestException(
        'WhatsApp is not connected. Connect WhatsApp before sending campaigns.',
      );
    }

    const countResult = await this.buildAudienceQuery(
      tenantId,
      campaign.segmentRules,
      tenant.lapsedDays,
    )
      .select('COUNT(*)', 'count')
      .getRawOne<{ count: string }>();

    const count = parseInt(countResult?.count ?? '0', 10);
    if (count === 0) {
      throw new BadRequestException(
        'No customers match this segment. Adjust the filters and try again.',
      );
    }

    const subscription = await this.subscriptionRepo.findOne({
      where: { tenantId },
    });
    const marketingRate = Number(subscription?.marketingRate ?? 130);
    const estimatedCost = count * marketingRate;
    const walletBalance = Number(tenant.marketingWalletBalance);

    if (walletBalance <= 0) {
      throw new BadRequestException(
        'Marketing wallet is empty. Top up your wallet at /billing/wallet/topup before sending campaigns.',
      );
    }

    let warning: string | undefined;
    if (walletBalance < estimatedCost) {
      warning =
        'Wallet balance may be insufficient for all recipients. Some messages may not send. Top up to ensure full delivery.';
    }

    await this.campaignRepo.update(campaignId, {
      status: CampaignStatus.SENDING,
      totalRecipients: count,
      sentAt: new Date(),
    });

    await this.campaignSendQueue.add('process', { campaignId, tenantId });

    return {
      message: 'Campaign is sending',
      totalRecipients: count,
      estimatedCost,
      walletBalance,
      warning,
    };
  }

  async schedule(
    tenantId: string,
    campaignId: string,
    dto: ScheduleCampaignDto,
  ): Promise<{ message: string; scheduledAt: string }> {
    const campaign = await this.findOne(tenantId, campaignId);

    if (campaign.status !== CampaignStatus.DRAFT) {
      throw new BadRequestException('Only draft campaigns can be scheduled');
    }

    const scheduledAt = new Date(dto.scheduledAt);
    const delayMs = scheduledAt.getTime() - Date.now();
    if (delayMs < SCHEDULE_MIN_LEAD_MS) {
      throw new BadRequestException(
        'Scheduled time must be at least 5 minutes in the future',
      );
    }

    const tenant = await this.tenantsService.findOne(tenantId);
    if (tenant.waVerificationStatus !== WaVerificationStatus.VERIFIED) {
      throw new BadRequestException(
        'WhatsApp is not connected. Connect WhatsApp before scheduling campaigns.',
      );
    }

    await this.campaignRepo.update(campaignId, {
      status: CampaignStatus.SCHEDULED,
      scheduledAt,
    });

    await this.scheduledJobsQueue.add(
      'send-campaign',
      { campaignId, tenantId },
      { delay: delayMs },
    );

    return { message: 'Campaign scheduled', scheduledAt: dto.scheduledAt };
  }

  async cancel(
    tenantId: string,
    campaignId: string,
  ): Promise<{ message: string }> {
    const campaign = await this.findOne(tenantId, campaignId);

    if (campaign.status !== CampaignStatus.SCHEDULED) {
      throw new BadRequestException(
        'Only scheduled campaigns can be cancelled',
      );
    }

    await this.campaignRepo.update(campaignId, {
      status: CampaignStatus.CANCELLED,
    });

    // Remove the delayed job from the scheduled-jobs queue
    const jobs = await this.scheduledJobsQueue.getJobs(['delayed']);
    for (const job of jobs) {
      if ((job.data as { campaignId?: string }).campaignId === campaignId) {
        await job.remove();
        break;
      }
    }

    return { message: 'Campaign cancelled' };
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  async stats(tenantId: string, campaignId: string) {
    const campaign = await this.findOne(tenantId, campaignId);
    const subscription = await this.subscriptionRepo.findOne({
      where: { tenantId },
    });
    const marketingRate = Number(subscription?.marketingRate ?? 130);
    const deliveryRate =
      campaign.sentCount > 0
        ? Math.round((campaign.deliveredCount / campaign.sentCount) * 100)
        : 0;

    return {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      totalRecipients: campaign.totalRecipients,
      sentCount: campaign.sentCount,
      deliveredCount: campaign.deliveredCount,
      failedCount: campaign.failedCount,
      deliveryRate,
      estimatedCost: campaign.sentCount * marketingRate,
      createdAt: campaign.createdAt,
      scheduledAt: campaign.scheduledAt,
      sentAt: campaign.sentAt,
    };
  }

  // ── Templates ─────────────────────────────────────────────────────────────

  getTemplates(): CampaignTemplate[] {
    return TEMPLATES;
  }
}
