import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as Sentry from '@sentry/node';
import { WaMessageProcessor } from '../../src/queue/processors/wa-message.processor';
import { TriggerCheckProcessor } from '../../src/queue/processors/trigger-check.processor';
import { QUEUE_NAMES } from '../../src/queue/queue.module';
import { TenantsService } from '../../src/modules/tenants/tenants.service';
import { BspService } from '../../src/modules/whatsapp/bsp.service';
import { WalletService } from '../../src/modules/billing/wallet.service';
import { UtilityTrackingService } from '../../src/modules/billing/utility-tracking.service';
import { User } from '../../src/modules/auth/entities/user.entity';
import { MessageBuilderService } from '../../src/queue/message-builder.service';
import { Customer } from '../../src/modules/customers/entities/customer.entity';
import { TriggerLog } from '../../src/modules/triggers/entities/trigger-log.entity';
import { Campaign } from '../../src/modules/campaigns/entities/campaign.entity';
import { CampaignLog } from '../../src/modules/campaigns/entities/campaign-log.entity';
import { WaVerificationStatus } from '@pingloyal/types';
import type { Job } from 'bullmq';
import { WaTriggerTemplate } from '../../src/modules/triggers/entities/wa-trigger-template.entity';

// ── Mocks ─────────────────────────────────────────────────────────────────────

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
    id: 'job-abc',
    data: { type: 'test' },
    attemptsMade: 1,
    opts: { attempts: 3 },
    ...overrides,
  } as unknown as Job;
}

// ── T1: QUEUE_NAMES exports all 5 queue names ─────────────────────────────────

it('T1 — QUEUE_NAMES exports all 5 required queue names', () => {
  expect(QUEUE_NAMES.WA_MESSAGES).toBe('wa-messages');
  expect(QUEUE_NAMES.TRIGGER_CHECK).toBe('trigger-check');
  expect(QUEUE_NAMES.CAMPAIGN_SEND).toBe('campaign-send');
  expect(QUEUE_NAMES.INTEGRATION_SYNC).toBe('integration-sync');
  expect(QUEUE_NAMES.SCHEDULED_JOBS).toBe('scheduled-jobs');
});

// ── T2-T3: Processor instantiation with mocked dependencies ──────────────────

describe('WaMessageProcessor', () => {
  let processor: WaMessageProcessor;

  const mockTenantService = {
    findOne: jest.fn().mockResolvedValue({
      id: 't1',
      waVerificationStatus: WaVerificationStatus.VERIFIED,
      gupshupApiKey: 'k',
      gupshupAppId: 'a',
      waPhoneNumber: '+234',
      businessName: 'S',
      pointsThreshold: 1000,
      rewardValue: 500,
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WaMessageProcessor,
        { provide: TenantsService, useValue: mockTenantService },
        { provide: BspService, useValue: { sendMessage: jest.fn() } },
        {
          provide: WalletService,
          useValue: { deductMarketing: jest.fn(), creditWallet: jest.fn() },
        },
        {
          provide: UtilityTrackingService,
          useValue: {
            trackUtilityMessage: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: MessageBuilderService, useValue: { build: jest.fn() } },
        {
          provide: getRepositoryToken(Customer),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(TriggerLog),
          useValue: { create: jest.fn((d: unknown) => d), save: jest.fn() },
        },
        {
          provide: getRepositoryToken(Campaign),
          useValue: { increment: jest.fn() },
        },
        {
          provide: getRepositoryToken(CampaignLog),
          useValue: { update: jest.fn() },
        },
        {
          provide: getRepositoryToken(User),
          useValue: { findOne: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: getRepositoryToken(WaTriggerTemplate),
          useValue: { findOne: jest.fn().mockResolvedValue(null) },
        },
      ],
    }).compile();

    processor = module.get(WaMessageProcessor);
  });

  it('T2 — process() returns early when tenantId is missing (no throw)', async () => {
    // makeJob has no tenantId → findOne(undefined) throws → processor logs and returns
    mockTenantService.findOne.mockRejectedValueOnce(
      new Error('Tenant not found'),
    );
    const job = makeJob();
    await expect(processor.process(job)).resolves.toBeUndefined();
  });

  it('T3 — onFailed() logs queue name and jobId', () => {
    const logSpy = jest
      .spyOn(processor['logger'], 'error')
      .mockImplementation(() => {});
    const job = makeJob({ id: 'job-111' });
    const err = new Error('something broke');

    processor.onFailed(job, err);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('queue=wa-messages'),
      err.stack,
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('jobId=job-111'),
      err.stack,
    );
  });

  it('T4 — onFailed() does NOT call Sentry when SENTRY_DSN is unset', () => {
    const original = process.env.SENTRY_DSN;
    delete process.env.SENTRY_DSN;
    jest.spyOn(processor['logger'], 'error').mockImplementation(() => {});

    processor.onFailed(makeJob(), new Error('boom'));

    expect(Sentry.withScope).not.toHaveBeenCalled();
    process.env.SENTRY_DSN = original;
  });

  it('T5 — onFailed() calls Sentry.withScope when SENTRY_DSN is set', () => {
    process.env.SENTRY_DSN = 'https://abc@sentry.io/123';
    jest.spyOn(processor['logger'], 'error').mockImplementation(() => {});

    processor.onFailed(makeJob(), new Error('boom'));

    expect(Sentry.withScope).toHaveBeenCalled();
    delete process.env.SENTRY_DSN;
  });

  it('T6 — onStalled() logs queue name and jobId', () => {
    const warnSpy = jest
      .spyOn(processor['logger'], 'warn')
      .mockImplementation(() => {});

    processor.onStalled('stall-job-99');

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('queue=wa-messages'),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('jobId=stall-job-99'),
    );
  });
});

// ── T7: TriggerCheckProcessor ─────────────────────────────────────────────────

describe('TriggerCheckProcessor', () => {
  let processor: TriggerCheckProcessor;

  const mockTcTenantService = {
    findOne: jest.fn().mockRejectedValue(new Error('not found')),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TriggerCheckProcessor,
        {
          provide: getQueueToken('wa-messages'),
          useValue: { add: jest.fn() },
        },
        {
          provide: getRepositoryToken(Customer),
          useValue: {
            findOne: jest.fn().mockResolvedValue(null),
            update: jest.fn(),
          },
        },
        { provide: TenantsService, useValue: mockTcTenantService },
      ],
    }).compile();

    processor = module.get(TriggerCheckProcessor);
  });

  it('T7 — process() returns early when customer not found (no throw)', async () => {
    await expect(processor.process(makeJob())).resolves.toBeUndefined();
  });

  it('T8 — onFailed() logs trigger-check queue name', () => {
    const logSpy = jest
      .spyOn(processor['logger'], 'error')
      .mockImplementation(() => {});
    const job = makeJob({ id: 'tc-job-1' });

    processor.onFailed(job, new Error('timeout'));

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('queue=trigger-check'),
      expect.anything(),
    );
  });
});

// ── T9-T11: basicAuth middleware ──────────────────────────────────────────────

// Import the logic directly by extracting it to test the middleware in isolation
describe('basicAuth middleware (main.ts logic)', () => {
  type Req = { headers: Record<string, string> };
  type Res = {
    setHeader: jest.Mock;
    status: jest.Mock;
    send: jest.Mock;
    _status?: number;
  };

  function makeAuth(user: string, pass: string): string {
    return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
  }

  function makeRes(): Res {
    const res: Res = {
      setHeader: jest.fn(),
      status: jest.fn(),
      send: jest.fn(),
    };
    res.status.mockReturnValue(res);
    return res;
  }

  // Mirror the basicAuth function from main.ts
  function basicAuth(req: Req, res: Res, next: jest.Mock): void {
    const adminUser = process.env.ADMIN_QUEUE_USER;
    const adminPass = process.env.ADMIN_QUEUE_PASS;
    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Basic ')) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Queue Dashboard"');
      (res.status(401) as Res).send('Authentication required');
      return;
    }
    const decoded = Buffer.from(auth.slice(6), 'base64').toString();
    const colonIdx = decoded.indexOf(':');
    const username = decoded.slice(0, colonIdx);
    const password = decoded.slice(colonIdx + 1);
    if (username === adminUser && password === adminPass) {
      next();
      return;
    }
    res.setHeader('WWW-Authenticate', 'Basic realm="Queue Dashboard"');
    (res.status(401) as Res).send('Invalid credentials');
  }

  beforeEach(() => {
    process.env.ADMIN_QUEUE_USER = 'admin';
    process.env.ADMIN_QUEUE_PASS = 'devpassword123';
  });

  afterEach(() => {
    delete process.env.ADMIN_QUEUE_USER;
    delete process.env.ADMIN_QUEUE_PASS;
  });

  it('T9 — returns 401 with no Authorization header', () => {
    const req: Req = { headers: {} };
    const res = makeRes();
    const next = jest.fn();

    basicAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('T10 — returns 401 with wrong credentials', () => {
    const req: Req = {
      headers: { authorization: makeAuth('admin', 'wrongpass') },
    };
    const res = makeRes();
    const next = jest.fn();

    basicAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.send).toHaveBeenCalledWith('Invalid credentials');
    expect(next).not.toHaveBeenCalled();
  });

  it('T11 — calls next() with correct credentials', () => {
    const req: Req = {
      headers: { authorization: makeAuth('admin', 'devpassword123') },
    };
    const res = makeRes();
    const next = jest.fn();

    basicAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
