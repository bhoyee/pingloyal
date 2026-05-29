import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CampaignSendProcessor } from '../../src/queue/processors/campaign-send.processor';
import { Campaign } from '../../src/modules/campaigns/entities/campaign.entity';
import { CampaignLog } from '../../src/modules/campaigns/entities/campaign-log.entity';
import { Customer } from '../../src/modules/customers/entities/customer.entity';
import { TierConfig } from '../../src/modules/tenants/entities/tier-config.entity';
import { TenantsService } from '../../src/modules/tenants/tenants.service';
import { BspService } from '../../src/modules/whatsapp/bsp.service';
import { CampaignsService } from '../../src/modules/campaigns/campaigns.service';
import { CampaignLogStatus, CampaignStatus } from '@pingloyal/types';
import type { Job } from 'bullmq';

jest.mock('bullmq', () => ({
  Worker: jest
    .fn()
    .mockImplementation(() => ({ on: jest.fn(), close: jest.fn() })),
  Queue: jest
    .fn()
    .mockImplementation(() => ({ add: jest.fn(), close: jest.fn() })),
  QueueEvents: jest
    .fn()
    .mockImplementation(() => ({ on: jest.fn(), close: jest.fn() })),
}));

jest.mock('@sentry/node', () => ({
  withScope: jest.fn(),
  captureException: jest.fn(),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-1';
const CAMPAIGN_ID = 'campaign-1';
const CUSTOMER_ID = 'customer-1';
const LOG_ID = 'log-1';

function makeJob(
  overrides: Partial<{
    tenantId: string;
    campaignId: string;
    customerId: string;
  }> = {},
): Job {
  return {
    id: 'job-1',
    name: 'send-campaign-message',
    data: {
      tenantId: TENANT_ID,
      campaignId: CAMPAIGN_ID,
      customerId: CUSTOMER_ID,
      ...overrides,
    },
    attemptsMade: 1,
    opts: { attempts: 3 },
  } as unknown as Job;
}

function makeCustomer(overrides: Record<string, unknown> = {}) {
  return {
    id: CUSTOMER_ID,
    tenantId: TENANT_ID,
    fullName: 'Amara Okafor',
    phoneE164: '+2348012345678',
    waOptedIn: true,
    pointsBalance: 500,
    tierId: null,
    ...overrides,
  };
}

function makeCampaign(
  messageBody = 'Hi {{firstName}}! Shop at {{businessName}}.',
) {
  return {
    id: CAMPAIGN_ID,
    tenantId: TENANT_ID,
    messageBody,
    totalRecipients: 10,
    sentCount: 5,
    status: CampaignStatus.SENDING,
  };
}

function makeTenant() {
  return {
    id: TENANT_ID,
    businessName: 'TestStore',
    waPhoneNumber: '+2348000000000',
    gupshupApiKey: 'encrypted-key',
    gupshupAppId: 'app-id',
    rewardValue: 500,
  };
}

function makeCampaignLog() {
  return {
    id: LOG_ID,
    tenantId: TENANT_ID,
    status: CampaignLogStatus.QUEUED,
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('CampaignSendProcessor', () => {
  let processor: CampaignSendProcessor;
  let mockCampaignRepo: Record<string, jest.Mock>;
  let mockCampaignLogRepo: Record<string, jest.Mock>;
  let mockCustomerRepo: Record<string, jest.Mock>;
  let mockTierConfigRepo: Record<string, jest.Mock>;
  let mockTenantsService: { findOne: jest.Mock };
  let mockBspService: { sendMessage: jest.Mock };
  let mockCampaignsService: {
    dispatch: jest.Mock;
    checkCampaignCompletion: jest.Mock;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const qbUpdate = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    mockCampaignRepo = {
      findOne: jest.fn().mockResolvedValue(makeCampaign()),
      update: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn().mockReturnValue(qbUpdate),
    };
    mockCampaignLogRepo = {
      findOne: jest.fn().mockResolvedValue(makeCampaignLog()),
      update: jest.fn().mockResolvedValue(undefined),
    };
    mockCustomerRepo = {
      findOne: jest.fn().mockResolvedValue(makeCustomer()),
    };
    mockTierConfigRepo = { findOne: jest.fn().mockResolvedValue(null) };
    mockTenantsService = { findOne: jest.fn().mockResolvedValue(makeTenant()) };
    mockBspService = {
      sendMessage: jest.fn().mockResolvedValue({ messageId: 'wa-msg-1' }),
    };
    mockCampaignsService = {
      dispatch: jest.fn().mockResolvedValue({}),
      checkCampaignCompletion: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignSendProcessor,
        { provide: getRepositoryToken(Campaign), useValue: mockCampaignRepo },
        {
          provide: getRepositoryToken(CampaignLog),
          useValue: mockCampaignLogRepo,
        },
        { provide: getRepositoryToken(Customer), useValue: mockCustomerRepo },
        {
          provide: getRepositoryToken(TierConfig),
          useValue: mockTierConfigRepo,
        },
        { provide: TenantsService, useValue: mockTenantsService },
        { provide: BspService, useValue: mockBspService },
        { provide: CampaignsService, useValue: mockCampaignsService },
      ],
    }).compile();

    processor = module.get(CampaignSendProcessor);
  });

  // ── T11: not opted in → failed, no BSP call ───────────────────────────────

  it('T11 — marks log as failed when customer waOptedIn is false, no BSP call', async () => {
    mockCustomerRepo.findOne.mockResolvedValue(
      makeCustomer({ waOptedIn: false }),
    );

    await processor.process(makeJob());

    expect(mockBspService.sendMessage).not.toHaveBeenCalled();
    expect(mockCampaignLogRepo.update).toHaveBeenCalledWith(
      LOG_ID,
      expect.objectContaining({ status: CampaignLogStatus.FAILED }),
    );
  });

  // ── T12: success → log=sent, sentCount++ ──────────────────────────────────

  it('T12 — marks log as sent and increments sentCount on success', async () => {
    await processor.process(makeJob());

    expect(mockBspService.sendMessage).toHaveBeenCalledTimes(1);
    expect(mockCampaignLogRepo.update).toHaveBeenCalledWith(
      LOG_ID,
      expect.objectContaining({
        status: CampaignLogStatus.SENT,
        waMessageId: 'wa-msg-1',
      }),
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const qb = mockCampaignRepo.createQueryBuilder();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(qb.set).toHaveBeenCalledWith(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      expect.objectContaining({ sentCount: expect.any(Function) }),
    );
  });

  // ── T13: BSP error → log=failed, failedCount++ ────────────────────────────

  it('T13 — marks log as failed and increments failedCount on BSP error', async () => {
    mockBspService.sendMessage.mockRejectedValue(new Error('rate limit'));

    await expect(processor.process(makeJob())).rejects.toThrow('rate limit');

    expect(mockCampaignLogRepo.update).toHaveBeenCalledWith(
      LOG_ID,
      expect.objectContaining({ status: CampaignLogStatus.FAILED }),
    );
  });

  // ── T14: BSP error → re-throws for BullMQ retry ───────────────────────────

  it('T14 — re-throws BSP error so BullMQ can retry', async () => {
    const err = new Error('BSP rate limit exceeded');
    mockBspService.sendMessage.mockRejectedValue(err);

    await expect(processor.process(makeJob())).rejects.toThrow(err);
  });

  // ── T15: {{firstName}} substitution ───────────────────────────────────────

  it('T15 — substitutes {{firstName}} with customer first name', async () => {
    mockCampaignRepo.findOne.mockResolvedValue(
      makeCampaign('Hi {{firstName}}!'),
    );
    mockCustomerRepo.findOne.mockResolvedValue(
      makeCustomer({ fullName: 'Amara Okafor' }),
    );

    await processor.process(makeJob());

    const [params] = mockBspService.sendMessage.mock.calls[0] as [
      { templateParams: string[] },
    ];
    expect(params.templateParams[0]).toContain('Amara');
    expect(params.templateParams[0]).not.toContain('{{firstName}}');
  });

  // ── T16: {{businessName}} substitution ────────────────────────────────────

  it('T16 — substitutes {{businessName}} with tenant business name', async () => {
    mockCampaignRepo.findOne.mockResolvedValue(
      makeCampaign('Shop at {{businessName}} today!'),
    );

    await processor.process(makeJob());

    const [params] = mockBspService.sendMessage.mock.calls[0] as [
      { templateParams: string[] },
    ];
    expect(params.templateParams[0]).toContain('TestStore');
    expect(params.templateParams[0]).not.toContain('{{businessName}}');
  });

  // ── T17: unknown variable left as-is ──────────────────────────────────────

  it('T17 — leaves unknown {{variable}} unchanged without throwing', async () => {
    mockCampaignRepo.findOne.mockResolvedValue(
      makeCampaign('Check {{unknownVar}} out!'),
    );

    await expect(processor.process(makeJob())).resolves.not.toThrow();

    const [params] = mockBspService.sendMessage.mock.calls[0] as [
      { templateParams: string[] },
    ];
    expect(params.templateParams[0]).toContain('{{unknownVar}}');
  });

  // ── T18: campaign log not found → warning, no error ───────────────────────

  it('T18 — logs warning and returns without error when campaign log not found', async () => {
    mockCampaignLogRepo.findOne.mockResolvedValue(null);
    const warnSpy = jest
      .spyOn(processor['logger'], 'warn')
      .mockImplementation(() => {});

    await expect(processor.process(makeJob())).resolves.not.toThrow();
    expect(mockBspService.sendMessage).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
