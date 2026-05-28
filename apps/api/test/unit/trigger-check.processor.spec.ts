import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TriggerCheckProcessor } from '../../src/queue/processors/trigger-check.processor';
import { TenantsService } from '../../src/modules/tenants/tenants.service';
import { Customer } from '../../src/modules/customers/entities/customer.entity';
import { TriggerType, WaVerificationStatus } from '@pingloyal/types';
import type { Job } from 'bullmq';

jest.mock('bullmq', () => ({
  Worker: jest
    .fn()
    .mockImplementation(() => ({ on: jest.fn(), close: jest.fn() })),
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    getJob: jest.fn(),
    close: jest.fn(),
  })),
  QueueEvents: jest
    .fn()
    .mockImplementation(() => ({ on: jest.fn(), close: jest.fn() })),
}));

jest.mock('@sentry/node', () => ({
  withScope: jest.fn(),
  captureException: jest.fn(),
}));

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-tc-1',
    data: { tenantId: 't1', customerId: 'c1', transactionId: 'tx1' },
    attemptsMade: 1,
    opts: { attempts: 2 },
    ...overrides,
  } as unknown as Job;
}

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'c1',
    tenantId: 't1',
    fullName: 'Amara Okafor',
    phoneE164: '+2348012345678',
    waOptedIn: true,
    pointsBalance: 800,
    nudgeSentAt: null,
    rewardSentAt: null,
    isActive: true,
    ...overrides,
  } as unknown as Customer;
}

function makeTenant(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1',
    waVerificationStatus: WaVerificationStatus.VERIFIED,
    pointsThreshold: 1000,
    pointsEarnRate: 1,
    rewardValue: 500,
    businessName: 'TestStore',
    ...overrides,
  };
}

describe('TriggerCheckProcessor', () => {
  let processor: TriggerCheckProcessor;
  let mockWaQueue: { add: jest.Mock };
  let mockCustomerRepo: { findOne: jest.Mock; update: jest.Mock };
  let mockTenantService: { findOne: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockWaQueue = { add: jest.fn().mockResolvedValue({ id: 'queued-job' }) };
    mockCustomerRepo = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };
    mockTenantService = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TriggerCheckProcessor,
        {
          provide: getQueueToken('wa-messages'),
          useValue: mockWaQueue,
        },
        {
          provide: getRepositoryToken(Customer),
          useValue: mockCustomerRepo,
        },
        { provide: TenantsService, useValue: mockTenantService },
      ],
    }).compile();

    processor = module.get(TriggerCheckProcessor);
  });

  it('T1 — returns early when customer not found', async () => {
    mockCustomerRepo.findOne.mockResolvedValue(null);
    mockTenantService.findOne.mockResolvedValue(makeTenant());

    await expect(processor.process(makeJob())).resolves.toBeUndefined();
    expect(mockWaQueue.add).not.toHaveBeenCalled();
  });

  it('T2 — returns early when tenant findOne throws', async () => {
    mockCustomerRepo.findOne.mockResolvedValue(makeCustomer());
    mockTenantService.findOne.mockRejectedValue(new Error('Tenant not found'));

    await expect(processor.process(makeJob())).resolves.toBeUndefined();
    expect(mockWaQueue.add).not.toHaveBeenCalled();
  });

  it('T3 — returns early when customer waOptedIn is false', async () => {
    mockCustomerRepo.findOne.mockResolvedValue(
      makeCustomer({ waOptedIn: false }),
    );
    mockTenantService.findOne.mockResolvedValue(makeTenant());

    await expect(processor.process(makeJob())).resolves.toBeUndefined();
    expect(mockWaQueue.add).not.toHaveBeenCalled();
  });

  it('T4 — returns early when tenant WA is not verified', async () => {
    mockCustomerRepo.findOne.mockResolvedValue(makeCustomer());
    mockTenantService.findOne.mockResolvedValue(
      makeTenant({ waVerificationStatus: WaVerificationStatus.PENDING }),
    );

    await expect(processor.process(makeJob())).resolves.toBeUndefined();
    expect(mockWaQueue.add).not.toHaveBeenCalled();
  });

  it('T5 — does not enqueue when pct < 0.8 (700/1000 = 70%)', async () => {
    mockCustomerRepo.findOne.mockResolvedValue(
      makeCustomer({ pointsBalance: 700 }),
    );
    mockTenantService.findOne.mockResolvedValue(makeTenant());

    await processor.process(makeJob());

    expect(mockWaQueue.add).not.toHaveBeenCalled();
  });

  it('T6 — enqueues THRESHOLD_NUDGE at 80% with correct amountToGoal, updates nudgeSentAt', async () => {
    mockCustomerRepo.findOne.mockResolvedValue(
      makeCustomer({ pointsBalance: 800, nudgeSentAt: null }),
    );
    mockTenantService.findOne.mockResolvedValue(
      makeTenant({ pointsThreshold: 1000, pointsEarnRate: 1 }),
    );

    await processor.process(makeJob());

    expect(mockWaQueue.add).toHaveBeenCalledWith(
      'send',
      expect.objectContaining({
        type: TriggerType.THRESHOLD_NUDGE,
        tenantId: 't1',
        customerId: 'c1',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({ amountToGoal: '200' }),
      }),
    );
    expect(mockCustomerRepo.update).toHaveBeenCalledWith('c1', {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      nudgeSentAt: expect.any(Date),
    });
  });

  it('T7 — skips THRESHOLD_NUDGE when nudgeSentAt is within 24h', async () => {
    const recentNudge = new Date(Date.now() - 12 * 60 * 60 * 1000);
    mockCustomerRepo.findOne.mockResolvedValue(
      makeCustomer({ pointsBalance: 800, nudgeSentAt: recentNudge }),
    );
    mockTenantService.findOne.mockResolvedValue(makeTenant());

    await processor.process(makeJob());

    expect(mockWaQueue.add).not.toHaveBeenCalled();
    expect(mockCustomerRepo.update).not.toHaveBeenCalled();
  });

  it('T8 — amountToGoal rounds up to nearest ₦100 (150 points needed × earnRate 1 → ₦200)', async () => {
    mockCustomerRepo.findOne.mockResolvedValue(
      makeCustomer({ pointsBalance: 850, nudgeSentAt: null }),
    );
    mockTenantService.findOne.mockResolvedValue(
      makeTenant({ pointsThreshold: 1000, pointsEarnRate: 1 }),
    );

    await processor.process(makeJob());

    // pointsNeeded=150, earnRate=1 → Math.ceil((150*1)/100)*100 = 200
    expect(mockWaQueue.add).toHaveBeenCalledWith(
      'send',
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({ amountToGoal: '200' }),
      }),
    );
  });

  it('T9 — enqueues REWARD_UNLOCKED at 100%, updates rewardSentAt', async () => {
    mockCustomerRepo.findOne.mockResolvedValue(
      makeCustomer({ pointsBalance: 1000, rewardSentAt: null }),
    );
    mockTenantService.findOne.mockResolvedValue(makeTenant());

    await processor.process(makeJob());

    expect(mockWaQueue.add).toHaveBeenCalledWith(
      'send',
      expect.objectContaining({
        type: TriggerType.REWARD_UNLOCKED,
        tenantId: 't1',
        customerId: 'c1',
      }),
    );
    expect(mockCustomerRepo.update).toHaveBeenCalledWith('c1', {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      rewardSentAt: expect.any(Date),
    });
  });

  it('T10 — skips REWARD_UNLOCKED when rewardSentAt is within 30 days', async () => {
    const recentReward = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    mockCustomerRepo.findOne.mockResolvedValue(
      makeCustomer({ pointsBalance: 1000, rewardSentAt: recentReward }),
    );
    mockTenantService.findOne.mockResolvedValue(makeTenant());

    await processor.process(makeJob());

    expect(mockWaQueue.add).not.toHaveBeenCalled();
  });

  it('T11 — enqueues THRESHOLD_NUDGE when nudgeSentAt is > 24h ago (cooldown expired)', async () => {
    const oldNudge = new Date(Date.now() - 25 * 60 * 60 * 1000);
    mockCustomerRepo.findOne.mockResolvedValue(
      makeCustomer({ pointsBalance: 800, nudgeSentAt: oldNudge }),
    );
    mockTenantService.findOne.mockResolvedValue(makeTenant());

    await processor.process(makeJob());

    expect(mockWaQueue.add).toHaveBeenCalledWith(
      'send',
      expect.objectContaining({ type: TriggerType.THRESHOLD_NUDGE }),
    );
  });

  it('T12 — enqueues REWARD_UNLOCKED when rewardSentAt is > 30 days ago (cooldown expired)', async () => {
    const oldReward = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    mockCustomerRepo.findOne.mockResolvedValue(
      makeCustomer({ pointsBalance: 1200, rewardSentAt: oldReward }),
    );
    mockTenantService.findOne.mockResolvedValue(makeTenant());

    await processor.process(makeJob());

    expect(mockWaQueue.add).toHaveBeenCalledWith(
      'send',
      expect.objectContaining({ type: TriggerType.REWARD_UNLOCKED }),
    );
  });

  it('T13 — onFailed() logs queue=trigger-check and jobId', () => {
    const logSpy = jest
      .spyOn(processor['logger'], 'error')
      .mockImplementation(() => {});
    const job = makeJob({ id: 'tc-fail-1' });
    const err = new Error('some error');

    processor.onFailed(job, err);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('queue=trigger-check'),
      err.stack,
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('jobId=tc-fail-1'),
      err.stack,
    );
  });
});
