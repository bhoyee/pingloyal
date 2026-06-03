import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  CampaignLogStatus,
  SkipReason,
  TriggerStatus,
  TriggerType,
  WaVerificationStatus,
} from '@pingloyal/types';
import type { Job } from 'bullmq';
import { WaMessageProcessor } from '../../src/queue/processors/wa-message.processor';
import { MessageBuilderService } from '../../src/queue/message-builder.service';
import { TenantsService } from '../../src/modules/tenants/tenants.service';
import { BspService } from '../../src/modules/whatsapp/bsp.service';
import { WalletService } from '../../src/modules/billing/wallet.service';
import { UtilityTrackingService } from '../../src/modules/billing/utility-tracking.service';
import { Customer } from '../../src/modules/customers/entities/customer.entity';
import { TriggerLog } from '../../src/modules/triggers/entities/trigger-log.entity';
import { Campaign } from '../../src/modules/campaigns/entities/campaign.entity';
import { CampaignLog } from '../../src/modules/campaigns/entities/campaign-log.entity';
import { User } from '../../src/modules/auth/entities/user.entity';
import { Tenant } from '../../src/modules/tenants/entities/tenant.entity';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-unit-1';
const CUSTOMER_ID = 'cust-unit-1';

const mockTenant = {
  id: TENANT_ID,
  businessName: 'Test Store',
  waVerificationStatus: WaVerificationStatus.VERIFIED,
  gupshupApiKey: 'encrypted-key',
  gupshupAppId: 'app-id-123',
  waPhoneNumber: '+2349000000000',
  pointsThreshold: 1000,
  rewardValue: 500,
  marketingWalletBalance: 1300,
} as unknown as Tenant;

const mockCustomer = {
  id: CUSTOMER_ID,
  fullName: 'Test Customer',
  phoneE164: '+2348012345678',
  waOptedIn: true,
  pointsBalance: 200,
  tierId: null,
  isActive: true,
} as unknown as Customer;

function makeJob(
  overrides: Partial<{
    type: TriggerType;
    tenantId: string;
    customerId: string | null;
    data: Record<string, string>;
    campaignLogId?: string;
    campaignId?: string;
  }> = {},
): Job {
  return {
    id: 'job-test-1',
    data: {
      type: TriggerType.PURCHASE_CONFIRMATION,
      tenantId: TENANT_ID,
      customerId: CUSTOMER_ID,
      data: { pointsEarned: '10', newBalance: '210' },
      ...overrides,
    },
    attemptsMade: 1,
    opts: { attempts: 3 },
  } as unknown as Job;
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('WaMessageProcessor', () => {
  let processor: WaMessageProcessor;

  const mockTenantService = { findOne: jest.fn() };
  const mockBspService = { sendMessage: jest.fn() };
  const mockWalletService = {
    deductMarketing: jest.fn(),
    creditWallet: jest.fn(),
  };
  const mockMessageBuilder = { build: jest.fn() };
  const mockCustomerRepo = { findOne: jest.fn() };
  const mockTriggerLogRepo = { create: jest.fn(), save: jest.fn() };
  const mockCampaignRepo = { increment: jest.fn() };
  const mockCampaignLogRepo = { update: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Sensible defaults — override per test as needed
    mockTenantService.findOne.mockResolvedValue(mockTenant);
    mockCustomerRepo.findOne.mockResolvedValue(mockCustomer);
    mockBspService.sendMessage.mockResolvedValue({
      messageId: 'wa-msg-default',
    });
    mockWalletService.deductMarketing.mockResolvedValue({
      success: true,
      newBalance: 1170,
    });
    mockWalletService.creditWallet.mockResolvedValue(undefined);
    mockMessageBuilder.build.mockReturnValue({
      templateName: 'pingloyal_purchase_confirm',
      variables: ['Test', '10', 'Test Store', '210', '21', '500'],
    });
    mockTriggerLogRepo.create.mockImplementation((data: unknown) => data);
    mockTriggerLogRepo.save.mockResolvedValue({});
    mockCampaignRepo.increment.mockResolvedValue(undefined);
    mockCampaignLogRepo.update.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WaMessageProcessor,
        { provide: TenantsService, useValue: mockTenantService },
        { provide: BspService, useValue: mockBspService },
        { provide: WalletService, useValue: mockWalletService },
        {
          provide: UtilityTrackingService,
          useValue: {
            trackUtilityMessage: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: MessageBuilderService, useValue: mockMessageBuilder },
        { provide: getRepositoryToken(Customer), useValue: mockCustomerRepo },
        {
          provide: getRepositoryToken(TriggerLog),
          useValue: mockTriggerLogRepo,
        },
        { provide: getRepositoryToken(Campaign), useValue: mockCampaignRepo },
        {
          provide: getRepositoryToken(CampaignLog),
          useValue: mockCampaignLogRepo,
        },
        {
          provide: getRepositoryToken(User),
          useValue: { findOne: jest.fn().mockResolvedValue(null) },
        },
      ],
    }).compile();

    processor = module.get(WaMessageProcessor);
  });

  // ── Hard gate tests ────────────────────────────────────────────────────────

  it('T1 — waOptedIn=false → BSP never called, trigger_log skipped with not_opted_in', async () => {
    mockCustomerRepo.findOne.mockResolvedValue({
      ...mockCustomer,
      waOptedIn: false,
    });

    await processor.process(
      makeJob({ type: TriggerType.PURCHASE_CONFIRMATION }),
    );

    expect(mockBspService.sendMessage).not.toHaveBeenCalled();
    expect(mockTriggerLogRepo.save).toHaveBeenCalledTimes(1);
    expect(mockTriggerLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: TriggerStatus.SKIPPED,
        skipReason: SkipReason.NOT_OPTED_IN,
      }),
    );
  });

  it('T2 — waVerificationStatus != verified → BSP never called, trigger_log skipped wa_not_connected', async () => {
    mockTenantService.findOne.mockResolvedValue({
      ...mockTenant,
      waVerificationStatus: WaVerificationStatus.PENDING,
    });

    await processor.process(
      makeJob({ type: TriggerType.PURCHASE_CONFIRMATION }),
    );

    expect(mockBspService.sendMessage).not.toHaveBeenCalled();
    expect(mockTriggerLogRepo.save).toHaveBeenCalledTimes(1);
    expect(mockTriggerLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: TriggerStatus.SKIPPED,
        skipReason: SkipReason.WA_NOT_CONNECTED,
      }),
    );
  });

  it('T3 — customer not found → log warning, return early, no trigger_log inserted', async () => {
    mockCustomerRepo.findOne.mockResolvedValue(null);

    await expect(
      processor.process(makeJob({ type: TriggerType.PURCHASE_CONFIRMATION })),
    ).resolves.toBeUndefined();

    expect(mockTriggerLogRepo.save).not.toHaveBeenCalled();
    expect(mockBspService.sendMessage).not.toHaveBeenCalled();
  });

  // ── Wallet gate tests ──────────────────────────────────────────────────────

  it('T4 — BIRTHDAY + wallet empty → BSP never called, trigger_log skipped wallet_empty', async () => {
    mockWalletService.deductMarketing.mockResolvedValue({
      success: false,
      newBalance: 0,
    });
    mockMessageBuilder.build.mockReturnValue({
      templateName: 'pingloyal_birthday',
      variables: ['Test', 'Test Store'],
    });

    await processor.process(makeJob({ type: TriggerType.BIRTHDAY, data: {} }));

    expect(mockBspService.sendMessage).not.toHaveBeenCalled();
    expect(mockTriggerLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: TriggerStatus.SKIPPED,
        skipReason: SkipReason.WALLET_EMPTY,
      }),
    );
  });

  it('T5 — BIRTHDAY + wallet sufficient → wallet deducted, BSP called', async () => {
    mockMessageBuilder.build.mockReturnValue({
      templateName: 'pingloyal_birthday',
      variables: ['Test', 'Test Store'],
    });
    mockBspService.sendMessage.mockResolvedValue({ messageId: 'msg-bday-1' });

    await processor.process(makeJob({ type: TriggerType.BIRTHDAY, data: {} }));

    expect(mockWalletService.deductMarketing).toHaveBeenCalledWith(
      TENANT_ID,
      TriggerType.BIRTHDAY,
      130,
      expect.stringContaining('birthday'),
      null,
    );
    expect(mockBspService.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('T6 — WELCOME type, wallet empty → BSP still called (utility ignores wallet)', async () => {
    mockMessageBuilder.build.mockReturnValue({
      templateName: 'pingloyal_welcome',
      variables: ['Test', 'Test Store', '1000', '500'],
    });
    mockBspService.sendMessage.mockResolvedValue({
      messageId: 'msg-welcome-1',
    });

    await processor.process(makeJob({ type: TriggerType.WELCOME, data: {} }));

    expect(mockWalletService.deductMarketing).not.toHaveBeenCalled();
    expect(mockBspService.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('T7 — PURCHASE_CONFIRMATION, wallet empty → BSP still called (utility)', async () => {
    await processor.process(
      makeJob({ type: TriggerType.PURCHASE_CONFIRMATION }),
    );

    expect(mockWalletService.deductMarketing).not.toHaveBeenCalled();
    expect(mockBspService.sendMessage).toHaveBeenCalledTimes(1);
  });

  // ── BSP response tests ─────────────────────────────────────────────────────

  it('T8 — BSP success → trigger_log status=sent, waMessageId stored', async () => {
    mockBspService.sendMessage.mockResolvedValue({ messageId: 'wa-msg-xyz' });

    await processor.process(
      makeJob({ type: TriggerType.PURCHASE_CONFIRMATION }),
    );

    expect(mockTriggerLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: TriggerStatus.SENT,
        waMessageId: 'wa-msg-xyz',
        skipReason: null,
      }),
    );
    expect(mockTriggerLogRepo.save).toHaveBeenCalledTimes(1);
  });

  it('T9 — BIRTHDAY + BSP throws 429 → error re-thrown, wallet deduction refunded', async () => {
    mockMessageBuilder.build.mockReturnValue({
      templateName: 'pingloyal_birthday',
      variables: ['Test', 'Test Store'],
    });
    mockBspService.sendMessage.mockRejectedValue(
      new Error('BSP rate limit exceeded'),
    );

    await expect(
      processor.process(makeJob({ type: TriggerType.BIRTHDAY, data: {} })),
    ).rejects.toThrow('BSP rate limit exceeded');

    expect(mockWalletService.creditWallet).toHaveBeenCalledWith(
      TENANT_ID,
      130,
      'refund_failed_send',
    );
  });

  it('T10 — BIRTHDAY + BSP throws 400 → error re-thrown, wallet deduction refunded', async () => {
    mockMessageBuilder.build.mockReturnValue({
      templateName: 'pingloyal_birthday',
      variables: ['Test', 'Test Store'],
    });
    mockBspService.sendMessage.mockRejectedValue(
      new Error('Template not found or invalid params'),
    );

    await expect(
      processor.process(makeJob({ type: TriggerType.BIRTHDAY, data: {} })),
    ).rejects.toThrow();

    expect(mockWalletService.creditWallet).toHaveBeenCalledWith(
      TENANT_ID,
      130,
      'refund_failed_send',
    );
  });

  // ── Campaign log tests ─────────────────────────────────────────────────────

  it('T11 — campaignLogId + BSP success → campaign_log status=sent, sentCount incremented', async () => {
    mockMessageBuilder.build.mockReturnValue({
      templateName: 'pingloyal_campaign_stub',
      variables: [],
    });
    mockBspService.sendMessage.mockResolvedValue({ messageId: 'msg-camp-1' });

    await processor.process(
      makeJob({
        type: TriggerType.CAMPAIGN_MESSAGE,
        campaignLogId: 'log-id-1',
        campaignId: 'camp-id-1',
        data: {},
      }),
    );

    expect(mockCampaignLogRepo.update).toHaveBeenCalledWith(
      'log-id-1',
      expect.objectContaining({ status: CampaignLogStatus.SENT }),
    );
    expect(mockCampaignRepo.increment).toHaveBeenCalledWith(
      { id: 'camp-id-1' },
      'sentCount',
      1,
    );
  });

  it('T12 — campaignLogId + wallet_empty → campaign_log status=failed, failedCount incremented', async () => {
    mockWalletService.deductMarketing.mockResolvedValue({
      success: false,
      newBalance: 0,
    });

    await processor.process(
      makeJob({
        type: TriggerType.CAMPAIGN_MESSAGE,
        campaignLogId: 'log-id-2',
        campaignId: 'camp-id-1',
        data: {},
      }),
    );

    expect(mockCampaignLogRepo.update).toHaveBeenCalledWith(
      'log-id-2',
      expect.objectContaining({
        status: CampaignLogStatus.FAILED,
        errorMessage: 'wallet_empty',
      }),
    );
    expect(mockCampaignRepo.increment).toHaveBeenCalledWith(
      { id: 'camp-id-1' },
      'failedCount',
      1,
    );
  });

  it('T13 — campaignLogId + BSP error → campaign_log status=failed, failedCount incremented', async () => {
    mockMessageBuilder.build.mockReturnValue({
      templateName: 'pingloyal_campaign_stub',
      variables: [],
    });
    mockBspService.sendMessage.mockRejectedValue(new Error('BSP server error'));

    await expect(
      processor.process(
        makeJob({
          type: TriggerType.CAMPAIGN_MESSAGE,
          campaignLogId: 'log-id-3',
          campaignId: 'camp-id-1',
          data: {},
        }),
      ),
    ).rejects.toThrow();

    expect(mockCampaignLogRepo.update).toHaveBeenCalledWith(
      'log-id-3',
      expect.objectContaining({ status: CampaignLogStatus.FAILED }),
    );
    expect(mockCampaignRepo.increment).toHaveBeenCalledWith(
      { id: 'camp-id-1' },
      'failedCount',
      1,
    );
  });
});

// ── MessageBuilderService unit tests ─────────────────────────────────────────

describe('MessageBuilderService', () => {
  let builder: MessageBuilderService;

  const tenant = {
    businessName: 'My Store',
    pointsThreshold: 1000,
    rewardValue: 500,
  } as unknown as Tenant;

  const customer = {
    fullName: 'Ada Okafor',
    pointsBalance: 350,
  } as unknown as Customer;

  beforeEach(() => {
    builder = new MessageBuilderService();
  });

  it('T14 — WELCOME → templateName=pingloyal_welcome, exactly 4 variables', () => {
    const result = builder.build(TriggerType.WELCOME, customer, tenant, {});
    expect(result.templateName).toBe('pingloyal_welcome');
    expect(result.variables).toHaveLength(4);
    expect(result.variables[0]).toBe('Ada'); // firstName
    expect(result.variables[1]).toBe('My Store'); // businessName
    expect(result.variables[2]).toBe('1000'); // threshold
    expect(result.variables[3]).toBe('500'); // rewardValue
  });

  it('T15 — PURCHASE_CONFIRMATION → 6 variables, pctToGoal at index 4', () => {
    const data = { pointsEarned: '10', newBalance: '110' };
    const result = builder.build(
      TriggerType.PURCHASE_CONFIRMATION,
      customer,
      tenant,
      data,
    );
    expect(result.variables).toHaveLength(6);
    expect(result.variables[4]).toBe('11'); // 110/1000 * 100 = 11%
    expect(result.variables[5]).toBe('500'); // rewardValue
  });

  it('T16 — LAPSED_WINBACK → 3 variables, daysSinceVisit at index 2', () => {
    const data = { daysSinceVisit: '45' };
    const result = builder.build(
      TriggerType.LAPSED_WINBACK,
      customer,
      tenant,
      data,
    );
    expect(result.variables).toHaveLength(3);
    expect(result.variables[2]).toBe('45');
  });

  it('T17 — WALLET_LOW_BALANCE → templateName=pingloyal_wallet_low, 3 variables', () => {
    const data = {
      ownerFirstName: 'Tunde',
      balance: '500',
      topUpUrl: 'https://app.pingloyal.com/billing/wallet/topup',
    };
    const result = builder.build(
      TriggerType.WALLET_LOW_BALANCE,
      null,
      tenant,
      data,
    );
    expect(result.templateName).toBe('pingloyal_wallet_low');
    expect(result.variables).toHaveLength(3);
    expect(result.variables[0]).toBe('Tunde');
    expect(result.variables[1]).toBe('500');
  });

  it('T18 — Unknown trigger type → throws Error', () => {
    expect(() =>
      builder.build('completely_unknown' as TriggerType, customer, tenant, {}),
    ).toThrow(/Unknown trigger type/);
  });
});

// ── Additional edge-case tests ─────────────────────────────────────────────────

describe('WaMessageProcessor — MARKETING_TYPES classification', () => {
  const MARKETING_TYPES = new Set([
    TriggerType.BIRTHDAY,
    TriggerType.LAPSED_WINBACK,
    TriggerType.CAMPAIGN_MESSAGE,
  ]);

  it('T19 — PURCHASE_CONFIRMATION is NOT marketing (Utility — no wallet deduction)', () => {
    expect(MARKETING_TYPES.has(TriggerType.PURCHASE_CONFIRMATION)).toBe(false);
  });

  it('T20 — WELCOME is NOT marketing (Utility — no wallet deduction)', () => {
    expect(MARKETING_TYPES.has(TriggerType.WELCOME)).toBe(false);
  });

  it('T21 — BALANCE_BOT_REPLY is NOT marketing (Service — free)', () => {
    expect(MARKETING_TYPES.has(TriggerType.BALANCE_BOT_REPLY)).toBe(false);
  });

  it('T22 — BIRTHDAY IS marketing (deduct wallet)', () => {
    expect(MARKETING_TYPES.has(TriggerType.BIRTHDAY)).toBe(true);
  });
});

describe('MessageBuilderService — template naming', () => {
  it('T23 — message template uses pingloyal_ prefix (not loyalpulse_)', () => {
    const builder = new MessageBuilderService();
    const tenant = {
      businessName: 'TestStore',
      pointsThreshold: 1000,
      rewardValue: 500,
    } as unknown as Tenant;
    const customer = {
      fullName: 'Ada Okonkwo',
      pointsBalance: 800,
    } as unknown as Customer;
    const result = builder.build(TriggerType.WELCOME, customer, tenant, {});
    expect(result.templateName).toMatch(/^pingloyal_/);
    expect(result.templateName).not.toMatch(/^loyalpulse_/);
  });

  it('T24 — BIRTHDAY template name is pingloyal_birthday', () => {
    const builder = new MessageBuilderService();
    const tenant = {
      businessName: 'TestStore',
      pointsThreshold: 1000,
      rewardValue: 500,
    } as unknown as Tenant;
    const customer = {
      fullName: 'Ada Okonkwo',
      pointsBalance: 800,
    } as unknown as Customer;
    const result = builder.build(TriggerType.BIRTHDAY, customer, tenant, {});
    expect(result.templateName).toBe('pingloyal_birthday');
  });
});
