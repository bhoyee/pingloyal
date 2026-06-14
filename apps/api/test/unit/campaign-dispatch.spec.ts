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
import { CampaignStatus, WaVerificationStatus } from '@pingloyal/types';

jest.mock('bullmq', () => ({
  Worker: jest
    .fn()
    .mockImplementation(() => ({ on: jest.fn(), close: jest.fn() })),
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    addBulk: jest.fn(),
    getJobs: jest.fn(),
    close: jest.fn(),
  })),
  QueueEvents: jest
    .fn()
    .mockImplementation(() => ({ on: jest.fn(), close: jest.fn() })),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-1';
const CAMPAIGN_ID = 'campaign-1';

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: CAMPAIGN_ID,
    tenantId: TENANT_ID,
    name: 'Test',
    messageBody: 'Hi {{firstName}}!',
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
    marketingWalletBalance: 50_000,
    lapsedDays: 60,
    ...overrides,
  };
}

function makeQueryBuilder(customerIds: string[] = ['c1', 'c2', 'c3']) {
  const customers = customerIds.map((id) => ({ id }));
  return {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    clone: jest.fn().mockReturnThis(),
    getRawOne: jest
      .fn()
      .mockResolvedValue({ count: customerIds.length.toString() }),
    getMany: jest.fn().mockResolvedValue(customers),
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('CampaignsService.dispatch()', () => {
  let service: CampaignsService;
  let mockCampaignRepo: Record<string, jest.Mock>;
  let mockCampaignLogRepo: Record<string, jest.Mock>;
  let mockCustomerRepo: { createQueryBuilder: jest.Mock };
  let mockSubscriptionRepo: { findOne: jest.Mock };
  let mockCampaignSendQueue: { add: jest.Mock; addBulk: jest.Mock };
  let mockScheduledJobsQueue: { add: jest.Mock; getJobs: jest.Mock };
  let mockRedis: { get: jest.Mock; set: jest.Mock };
  let mockTenantsService: { findOne: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    const qbInsert = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
    };

    mockCampaignRepo = {
      findOne: jest.fn().mockResolvedValue(makeCampaign()),
      update: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn().mockReturnValue(qbInsert),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn(),
      create: jest.fn(),
      remove: jest.fn(),
    };
    mockCampaignLogRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qbInsert),
      count: jest.fn().mockResolvedValue(0),
    };
    mockCustomerRepo = { createQueryBuilder: jest.fn() };
    mockSubscriptionRepo = {
      findOne: jest.fn().mockResolvedValue({ marketingRate: 130 }),
    };
    mockCampaignSendQueue = {
      add: jest.fn().mockResolvedValue({}),
      addBulk: jest.fn().mockResolvedValue([]),
    };
    mockScheduledJobsQueue = {
      add: jest.fn().mockResolvedValue({}),
      getJobs: jest.fn().mockResolvedValue([]),
    };
    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
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

  // ── T1: empty wallet → 400 ────────────────────────────────────────────────

  it('T1 — throws 400 when marketing wallet balance is 0', async () => {
    mockCustomerRepo.createQueryBuilder.mockReturnValue(
      makeQueryBuilder(['c1']),
    );
    mockTenantsService.findOne.mockResolvedValue(
      makeTenant({ marketingWalletBalance: 0 }),
    );

    await expect(service.dispatch(TENANT_ID, CAMPAIGN_ID)).rejects.toThrow(
      BadRequestException,
    );
  });

  // ── T2: zero audience → 400 ───────────────────────────────────────────────

  it('T2 — throws 400 when audience count is 0', async () => {
    mockCustomerRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder([]));

    await expect(service.dispatch(TENANT_ID, CAMPAIGN_ID)).rejects.toThrow(
      BadRequestException,
    );
  });

  // ── T3: WA not connected → 400 ────────────────────────────────────────────

  it('T3 — throws 400 when WA is not verified', async () => {
    mockTenantsService.findOne.mockResolvedValue(
      makeTenant({ waVerificationStatus: WaVerificationStatus.PENDING }),
    );

    await expect(service.dispatch(TENANT_ID, CAMPAIGN_ID)).rejects.toThrow(
      BadRequestException,
    );
  });

  // ── T4: status=sent → 400 ─────────────────────────────────────────────────

  it('T4 — throws 400 when campaign status is sent', async () => {
    mockCampaignRepo.findOne.mockResolvedValue(
      makeCampaign({ status: CampaignStatus.SENT }),
    );

    await expect(service.dispatch(TENANT_ID, CAMPAIGN_ID)).rejects.toThrow(
      BadRequestException,
    );
  });

  // ── T5: status=sending → 400 ──────────────────────────────────────────────

  it('T5 — throws 400 when campaign status is already sending', async () => {
    mockCampaignRepo.findOne.mockResolvedValue(
      makeCampaign({ status: CampaignStatus.SENDING }),
    );

    await expect(service.dispatch(TENANT_ID, CAMPAIGN_ID)).rejects.toThrow(
      BadRequestException,
    );
  });

  // ── T6: success → status updated to sending ───────────────────────────────

  it('T6 — success: updates campaign status to sending', async () => {
    mockCustomerRepo.createQueryBuilder.mockReturnValue(
      makeQueryBuilder(['c1', 'c2']),
    );

    const result = await service.dispatch(TENANT_ID, CAMPAIGN_ID);

    expect(result.dispatched).toBe(true);
    expect(mockCampaignRepo.update).toHaveBeenCalledWith(
      { id: CAMPAIGN_ID, tenantId: TENANT_ID },
      expect.objectContaining({ status: CampaignStatus.SENDING }),
    );
  });

  // ── T7: creates correct number of campaign_log rows ───────────────────────

  it('T7 — inserts campaign_log rows for each customer', async () => {
    const ids = ['c1', 'c2', 'c3'];
    mockCustomerRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder(ids));

    await service.dispatch(TENANT_ID, CAMPAIGN_ID);

    expect(mockCampaignLogRepo.createQueryBuilder).toHaveBeenCalled();
    // execute() is called once (batch of 3 < 1000)
    const qbInstance = mockCampaignLogRepo.createQueryBuilder.mock.results[0]
      .value as { execute: jest.Mock };
    expect(qbInstance.execute).toHaveBeenCalledTimes(1);
  });

  // ── T8: uses addBulk not individual queue.add() ───────────────────────────

  it('T8 — uses addBulk instead of individual queue.add calls', async () => {
    mockCustomerRepo.createQueryBuilder.mockReturnValue(
      makeQueryBuilder(['c1', 'c2', 'c3']),
    );

    await service.dispatch(TENANT_ID, CAMPAIGN_ID);

    expect(mockCampaignSendQueue.addBulk).toHaveBeenCalledTimes(1);
    expect(mockCampaignSendQueue.add).not.toHaveBeenCalled();
  });

  // ── T9: low wallet → success with warning ────────────────────────────────

  it('T9 — succeeds with walletWarning when wallet below estimated cost', async () => {
    // 100 customers × ₦130 = ₦13,000; wallet = ₦5,000
    const ids = Array.from({ length: 100 }, (_, i) => `c${i}`);
    mockCustomerRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder(ids));
    mockTenantsService.findOne.mockResolvedValue(
      makeTenant({ marketingWalletBalance: 5_000 }),
    );

    const result = await service.dispatch(TENANT_ID, CAMPAIGN_ID);

    expect(result.dispatched).toBe(true);
    expect(result.walletWarning).not.toBeNull();
  });

  // ── T10: rate limiting delays ─────────────────────────────────────────────

  it('T10 — rate limiting: index-0 delay=0, index-80 delay=1000, index-160 delay=2000', async () => {
    const ids = Array.from({ length: 200 }, (_, i) => `c${i}`);
    mockCustomerRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder(ids));

    await service.dispatch(TENANT_ID, CAMPAIGN_ID);

    const [[bulkJobs]] = mockCampaignSendQueue.addBulk.mock.calls as [
      [Array<{ opts: { delay: number } }>],
    ];
    expect(bulkJobs[0].opts.delay).toBe(0);
    expect(bulkJobs[80].opts.delay).toBe(1000);
    expect(bulkJobs[160].opts.delay).toBe(2000);
  });
});
