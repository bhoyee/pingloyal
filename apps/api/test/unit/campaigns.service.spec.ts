import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { CampaignsService } from '../../src/modules/campaigns/campaigns.service';
import { Campaign } from '../../src/modules/campaigns/entities/campaign.entity';
import { CampaignLog } from '../../src/modules/campaigns/entities/campaign-log.entity';
import { Customer } from '../../src/modules/customers/entities/customer.entity';
import { Subscription } from '../../src/modules/billing/entities/subscription.entity';
import { TenantsService } from '../../src/modules/tenants/tenants.service';
import { REDIS_CLIENT } from '../../src/common/redis/redis.constants';
import {
  CampaignLogStatus,
  CampaignStatus,
  WaVerificationStatus,
} from '@pingloyal/types';

jest.mock('bullmq', () => ({
  Worker: jest
    .fn()
    .mockImplementation(() => ({ on: jest.fn(), close: jest.fn() })),
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    getJobs: jest.fn(),
    close: jest.fn(),
  })),
  QueueEvents: jest
    .fn()
    .mockImplementation(() => ({ on: jest.fn(), close: jest.fn() })),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-uuid-1';
const CAMPAIGN_ID = 'campaign-uuid-1';
const USER_ID = 'user-uuid-1';

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: CAMPAIGN_ID,
    tenantId: TENANT_ID,
    name: 'Test Campaign',
    messageBody: 'Hello {{firstName}}, great offer!',
    segmentRules: {},
    status: CampaignStatus.DRAFT,
    scheduledAt: null,
    sentAt: null,
    totalRecipients: 0,
    sentCount: 0,
    deliveredCount: 0,
    failedCount: 0,
    createdBy: null,
    campaignLogs: [],
    deletedAt: null,
    deletedBy: null,
    deletionReason: null,
    tenant: null as never,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeTenant(overrides: Record<string, unknown> = {}) {
  return {
    id: TENANT_ID,
    businessName: 'TestStore',
    waVerificationStatus: WaVerificationStatus.VERIFIED,
    marketingWalletBalance: 10_000,
    lapsedDays: 60,
    ...overrides,
  };
}

function makeSubscription(marketingRate = 130) {
  return { tenantId: TENANT_ID, marketingRate };
}

function makeQueryBuilder(countResult = '5', sampleCustomers: object[] = []) {
  const qb: Record<string, jest.Mock> = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    clone: jest.fn(),
    getRawOne: jest.fn().mockResolvedValue({ count: countResult }),
    getMany: jest.fn().mockResolvedValue(sampleCustomers),
  };
  // clone returns a new builder with its own getRawOne/getMany
  qb.clone.mockImplementation(() => ({
    ...qb,
    clone: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({ count: countResult }),
    getMany: jest.fn().mockResolvedValue(sampleCustomers),
  }));
  return qb;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('CampaignsService', () => {
  let service: CampaignsService;
  let mockCampaignRepo: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let mockCampaignLogRepo: {
    createQueryBuilder: jest.Mock;
    count: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
  };
  let mockCustomerRepo: { createQueryBuilder: jest.Mock };
  let mockSubscriptionRepo: { findOne: jest.Mock };
  let mockCampaignSendQueue: { add: jest.Mock };
  let mockScheduledJobsQueue: { add: jest.Mock; getJobs: jest.Mock };
  let mockRedis: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let mockTenantsService: { findOne: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockCampaignRepo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({}),
      }),
    };
    mockCampaignLogRepo = {
      createQueryBuilder: jest.fn().mockReturnValue({
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({}),
      }),
      count: jest.fn().mockResolvedValue(0),
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };
    mockCustomerRepo = { createQueryBuilder: jest.fn() };
    mockSubscriptionRepo = {
      findOne: jest.fn().mockResolvedValue(makeSubscription()),
    };
    mockCampaignSendQueue = { add: jest.fn().mockResolvedValue({ id: 'q1' }) };
    mockScheduledJobsQueue = {
      add: jest.fn().mockResolvedValue({ id: 'q2' }),
      getJobs: jest.fn().mockResolvedValue([]),
    };
    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };
    mockTenantsService = { findOne: jest.fn().mockResolvedValue(makeTenant()) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignsService,
        { provide: getRepositoryToken(Campaign), useValue: mockCampaignRepo },
        {
          provide: getRepositoryToken(CampaignLog),
          useValue: mockCampaignLogRepo,
        },
        { provide: getRepositoryToken(Customer), useValue: mockCustomerRepo },
        {
          provide: getRepositoryToken(Subscription),
          useValue: mockSubscriptionRepo,
        },
        {
          provide: getQueueToken('campaign-send'),
          useValue: mockCampaignSendQueue,
        },
        {
          provide: getQueueToken('scheduled-jobs'),
          useValue: mockScheduledJobsQueue,
        },
        { provide: REDIS_CLIENT, useValue: mockRedis },
        { provide: TenantsService, useValue: mockTenantsService },
      ],
    }).compile();

    service = module.get(CampaignsService);
  });

  // ── T1: Create campaign → status=draft ────────────────────────────────────

  it('T1 — create() returns a draft campaign', async () => {
    const expected = makeCampaign();
    mockCampaignRepo.create.mockReturnValue(expected);
    mockCampaignRepo.save.mockResolvedValue(expected);

    const result = await service.create(
      TENANT_ID,
      { name: 'Test', messageBody: 'Body message here!', segmentRules: {} },
      USER_ID,
    );

    expect(result.status).toBe(CampaignStatus.DRAFT);
    expect(mockCampaignRepo.save).toHaveBeenCalledTimes(1);
  });

  // ── T2: Update sent campaign → 400 ────────────────────────────────────────

  it('T2 — update() throws 400 when campaign status is sent', async () => {
    mockCampaignRepo.findOne.mockResolvedValue(
      makeCampaign({ status: CampaignStatus.SENT }),
    );

    await expect(
      service.update(TENANT_ID, CAMPAIGN_ID, { name: 'New Name' }),
    ).rejects.toThrow(BadRequestException);
  });

  // ── T3: Delete sent campaign → 400 ────────────────────────────────────────

  it('T3 — remove() throws 400 when campaign status is sent', async () => {
    mockCampaignRepo.findOne.mockResolvedValue(
      makeCampaign({ status: CampaignStatus.SENT }),
    );

    await expect(
      service.remove(TENANT_ID, CAMPAIGN_ID, USER_ID),
    ).rejects.toThrow(BadRequestException);
  });

  // ── T4: Send already-sending campaign → 400 ───────────────────────────────

  it('T4 — send() throws 400 when campaign is already sending', async () => {
    mockCampaignRepo.findOne.mockResolvedValue(
      makeCampaign({ status: CampaignStatus.SENDING }),
    );

    await expect(service.send(TENANT_ID, CAMPAIGN_ID)).rejects.toThrow(
      BadRequestException,
    );
  });

  // ── T5: Send with empty audience → 400 ────────────────────────────────────

  it('T5 — send() throws 400 when audience count is 0', async () => {
    mockCampaignRepo.findOne.mockResolvedValue(makeCampaign());
    mockCustomerRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder('0'));

    await expect(service.send(TENANT_ID, CAMPAIGN_ID)).rejects.toThrow(
      BadRequestException,
    );
  });

  // ── T6: Send with empty wallet → 400 ──────────────────────────────────────

  it('T6 — send() throws 400 when marketing wallet balance is 0', async () => {
    mockCampaignRepo.findOne.mockResolvedValue(makeCampaign());
    mockCustomerRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder('10'));
    mockTenantsService.findOne.mockResolvedValue(
      makeTenant({ marketingWalletBalance: 0 }),
    );

    await expect(service.send(TENANT_ID, CAMPAIGN_ID)).rejects.toThrow(
      BadRequestException,
    );
  });

  // ── T7: Send with low wallet → success + warning ──────────────────────────

  it('T7 — send() succeeds with warning when wallet below estimated cost', async () => {
    mockCampaignRepo.findOne.mockResolvedValue(makeCampaign());
    // 100 recipients × ₦130 = ₦13,000 estimated; wallet = ₦5,000
    mockCustomerRepo.createQueryBuilder.mockReturnValue(
      makeQueryBuilder('100'),
    );
    mockTenantsService.findOne.mockResolvedValue(
      makeTenant({ marketingWalletBalance: 5_000 }),
    );

    const result = await service.send(TENANT_ID, CAMPAIGN_ID);

    expect(result.totalRecipients).toBe(100);
    expect(result.warning).toBeDefined();
    expect(mockCampaignSendQueue.add).toHaveBeenCalledTimes(1);
  });

  // ── T8: Send with sufficient wallet → success, no warning ─────────────────

  it('T8 — send() succeeds without warning when wallet is sufficient', async () => {
    mockCampaignRepo.findOne.mockResolvedValue(makeCampaign());
    // 10 recipients × ₦130 = ₦1,300; wallet = ₦50,000
    mockCustomerRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder('10'));
    mockTenantsService.findOne.mockResolvedValue(
      makeTenant({ marketingWalletBalance: 50_000 }),
    );

    const result = await service.send(TENANT_ID, CAMPAIGN_ID);

    expect(result.warning).toBeUndefined();
    expect(mockCampaignSendQueue.add).toHaveBeenCalledTimes(1);
  });

  // ── T9: Send with WA not connected → 400 ──────────────────────────────────

  it('T9 — send() throws 400 when WA is not verified', async () => {
    mockCampaignRepo.findOne.mockResolvedValue(makeCampaign());
    mockTenantsService.findOne.mockResolvedValue(
      makeTenant({ waVerificationStatus: WaVerificationStatus.PENDING }),
    );

    await expect(service.send(TENANT_ID, CAMPAIGN_ID)).rejects.toThrow(
      BadRequestException,
    );
  });

  // ── T10: Audience preview with tierIds ────────────────────────────────────

  it('T10 — audiencePreview() applies tier filter via andWhere', async () => {
    const qb = makeQueryBuilder('3', [{ fullName: 'Alice' }]);
    mockCustomerRepo.createQueryBuilder.mockReturnValue(qb);

    const result = await service.audiencePreview(TENANT_ID, {
      tierIds: ['tier-uuid-1'],
    });

    expect(result.count).toBe(3);
    const andWhereArgs = qb.andWhere.mock.calls.map((c: string[]) => c[0]);
    expect(andWhereArgs.some((a: string) => a.includes('tierId'))).toBe(true);
  });

  // ── T11: Audience preview with activityStatus=inactive ────────────────────

  it('T11 — audiencePreview() applies inactive activity filter', async () => {
    const qb = makeQueryBuilder('7');
    mockCustomerRepo.createQueryBuilder.mockReturnValue(qb);

    await service.audiencePreview(TENANT_ID, { activityStatus: 'inactive' });

    const andWhereArgs = qb.andWhere.mock.calls.map((c: string[]) => c[0]);
    expect(andWhereArgs.some((a: string) => a.includes('lastPurchaseAt'))).toBe(
      true,
    );
  });

  // ── T12: Audience preview cached for 60s ──────────────────────────────────

  it('T12 — audiencePreview() returns cached result on second call', async () => {
    const cached = JSON.stringify({ count: 42, sampleNames: ['Bob'] });
    mockRedis.get.mockResolvedValue(cached);

    const result = await service.audiencePreview(TENANT_ID, {});

    expect(result.count).toBe(42);
    expect(mockCustomerRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  // ── T13: Schedule with past date → 400 ────────────────────────────────────

  it('T13 — schedule() throws 400 when scheduledAt is in the past', async () => {
    mockCampaignRepo.findOne.mockResolvedValue(makeCampaign());
    const pastDate = new Date(Date.now() - 60_000).toISOString();

    await expect(
      service.schedule(TENANT_ID, CAMPAIGN_ID, { scheduledAt: pastDate }),
    ).rejects.toThrow(BadRequestException);
  });

  // ── T14: Schedule with 3-minute lead → 400 ────────────────────────────────

  it('T14 — schedule() throws 400 when scheduledAt is only 3 minutes away', async () => {
    mockCampaignRepo.findOne.mockResolvedValue(makeCampaign());
    const tooSoon = new Date(Date.now() + 3 * 60 * 1000).toISOString();

    await expect(
      service.schedule(TENANT_ID, CAMPAIGN_ID, { scheduledAt: tooSoon }),
    ).rejects.toThrow(BadRequestException);
  });

  // ── T15: Cancel scheduled campaign → cancelled ────────────────────────────

  it('T15 — cancel() sets campaign status to cancelled', async () => {
    mockCampaignRepo.findOne.mockResolvedValue(
      makeCampaign({ status: CampaignStatus.SCHEDULED }),
    );

    const result = await service.cancel(TENANT_ID, CAMPAIGN_ID);

    expect(result.message).toBe('Campaign cancelled');
    expect(mockCampaignRepo.update).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      expect.objectContaining({ status: CampaignStatus.CANCELLED }),
    );
  });

  // ── T16: Cancel sending campaign → 400 ────────────────────────────────────

  it('T16 — cancel() throws 400 when campaign is already sending', async () => {
    mockCampaignRepo.findOne.mockResolvedValue(
      makeCampaign({ status: CampaignStatus.SENDING }),
    );

    await expect(service.cancel(TENANT_ID, CAMPAIGN_ID)).rejects.toThrow(
      BadRequestException,
    );
  });

  // ── handleDeliveryStatusEvent ──────────────────────────────────────────────

  it("T17 — 'delivered' event marks a sent log delivered and increments deliveredCount", async () => {
    mockCampaignLogRepo.findOne.mockResolvedValue({
      id: 'log-1',
      status: CampaignLogStatus.SENT,
      campaign: { id: CAMPAIGN_ID },
    });

    await service.handleDeliveryStatusEvent('wamid.abc123', 'delivered');

    expect(mockCampaignLogRepo.update).toHaveBeenCalledWith(
      'log-1',
      expect.objectContaining({ status: CampaignLogStatus.DELIVERED }),
    );
    expect(mockCampaignRepo.createQueryBuilder).toHaveBeenCalled();
  });

  it("T18 — 'failed' event marks a sent log failed with reason and increments failedCount", async () => {
    mockCampaignLogRepo.findOne.mockResolvedValue({
      id: 'log-2',
      status: CampaignLogStatus.SENT,
      campaign: { id: CAMPAIGN_ID },
    });

    await service.handleDeliveryStatusEvent(
      'wamid.def456',
      'failed',
      'invalid number',
    );

    expect(mockCampaignLogRepo.update).toHaveBeenCalledWith(
      'log-2',
      expect.objectContaining({
        status: CampaignLogStatus.FAILED,
        errorMessage: 'invalid number',
      }),
    );
  });

  it('T19 — event for unknown waMessageId is a no-op', async () => {
    mockCampaignLogRepo.findOne.mockResolvedValue(null);

    await service.handleDeliveryStatusEvent('wamid.unknown', 'delivered');

    expect(mockCampaignLogRepo.update).not.toHaveBeenCalled();
  });

  it("T20 — 'delivered' event is ignored for a log already marked delivered (idempotent)", async () => {
    mockCampaignLogRepo.findOne.mockResolvedValue({
      id: 'log-3',
      status: CampaignLogStatus.DELIVERED,
      campaign: { id: CAMPAIGN_ID },
    });

    await service.handleDeliveryStatusEvent('wamid.ghi789', 'read');

    expect(mockCampaignLogRepo.update).not.toHaveBeenCalled();
  });
});
