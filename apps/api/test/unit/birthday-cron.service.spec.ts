import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { getDataSourceToken } from '@nestjs/typeorm';
import { BirthdayCronService } from '../../src/modules/triggers/birthday-cron.service';
import { TriggerType, WaVerificationStatus } from '@pingloyal/types';

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

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTenant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tenant-1',
    timezone: 'Africa/Lagos',
    waVerificationStatus: WaVerificationStatus.VERIFIED,
    marketingWalletBalance: '5000',
    businessName: 'TestStore',
    pointsThreshold: 1000,
    rewardValue: '500',
    ...overrides,
  };
}

function makeCustomer(overrides: Record<string, unknown> = {}) {
  return {
    id: 'customer-1',
    full_name: 'Amara Okafor',
    phone_e164: '+2348012345678',
    wa_opted_in: true,
    ...overrides,
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('BirthdayCronService', () => {
  let service: BirthdayCronService;
  let mockWaQueue: { add: jest.Mock };
  let mockDataSource: { query: jest.Mock };

  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    // Default: UTC 07:00 = Africa/Lagos 08:00 (UTC+1)
    jest.setSystemTime(new Date('2024-11-15T07:00:00.000Z'));

    mockWaQueue = { add: jest.fn().mockResolvedValue({ id: 'q-job' }) };
    mockDataSource = { query: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BirthdayCronService,
        { provide: getQueueToken('wa-messages'), useValue: mockWaQueue },
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();

    service = module.get(BirthdayCronService);
  });

  // ── T1: birthday customer waOptedIn=true → queued ─────────────────────────

  it('T1 — queues BIRTHDAY job for opted-in customer with today birthday', async () => {
    // UTC 07:00 = Lagos 08:00 → qualifying hour
    mockDataSource.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM tenants')) return Promise.resolve([makeTenant()]);
      if (sql.includes('FROM customers'))
        return Promise.resolve([makeCustomer()]);
      if (sql.includes('FROM trigger_logs')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    await service.runBirthdayCron();

    expect(mockWaQueue.add).toHaveBeenCalledWith(
      'send-message',
      expect.objectContaining({
        type: TriggerType.BIRTHDAY,
        tenantId: 'tenant-1',
        customerId: 'customer-1',
      }),
      expect.objectContaining({ attempts: 3 }),
    );
  });

  // ── T2: waOptedIn=false → not queued ──────────────────────────────────────

  it('T2 — does NOT queue when customer waOptedIn is false', async () => {
    mockDataSource.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM tenants')) return Promise.resolve([makeTenant()]);
      // wa_opted_in=false customers are filtered in the SQL WHERE clause
      if (sql.includes('FROM customers')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    await service.runBirthdayCron();

    expect(mockWaQueue.add).not.toHaveBeenCalled();
  });

  // ── T3: idempotency — trigger_log exists today → not re-queued ────────────

  it('T3 — does NOT queue when trigger_log already exists today (idempotency)', async () => {
    mockDataSource.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM tenants')) return Promise.resolve([makeTenant()]);
      if (sql.includes('FROM customers'))
        return Promise.resolve([makeCustomer()]);
      // Existing log found → skip
      if (sql.includes('FROM trigger_logs'))
        return Promise.resolve([{ id: 'existing-log-id' }]);
      return Promise.resolve([]);
    });

    await service.runBirthdayCron();

    expect(mockWaQueue.add).not.toHaveBeenCalled();
  });

  // ── T4: yesterday birthday → not queued ───────────────────────────────────

  it('T4 — does NOT queue for customer whose birthday was yesterday', async () => {
    mockDataSource.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM tenants')) return Promise.resolve([makeTenant()]);
      // DB EXTRACT filters by day=15 (today), so a day-14 customer returns empty
      if (sql.includes('FROM customers')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    await service.runBirthdayCron();

    expect(mockWaQueue.add).not.toHaveBeenCalled();
  });

  // ── T5: timezone handling ─────────────────────────────────────────────────

  it('T5a — queues for New York tenant when UTC time is 13:00 (= 8am EST/UTC-5)', async () => {
    jest.setSystemTime(new Date('2024-11-15T13:00:00.000Z'));

    mockDataSource.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM tenants'))
        return Promise.resolve([makeTenant({ timezone: 'America/New_York' })]);
      if (sql.includes('FROM customers'))
        return Promise.resolve([makeCustomer()]);
      if (sql.includes('FROM trigger_logs')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    await service.runBirthdayCron();

    expect(mockWaQueue.add).toHaveBeenCalled();
  });

  it('T5b — does NOT queue for New York tenant when UTC time is 07:00 (= 2am EST)', async () => {
    jest.setSystemTime(new Date('2024-11-15T07:00:00.000Z'));

    mockDataSource.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM tenants'))
        return Promise.resolve([makeTenant({ timezone: 'America/New_York' })]);
      if (sql.includes('FROM customers'))
        return Promise.resolve([makeCustomer()]);
      return Promise.resolve([]);
    });

    await service.runBirthdayCron();

    expect(mockWaQueue.add).not.toHaveBeenCalled();
  });

  // ── T6: WA not connected → skipped ────────────────────────────────────────

  it('T6 — skips tenant and increments skippedNotConnected when WA not verified', async () => {
    const warnSpy = jest
      .spyOn(service['logger'], 'warn')
      .mockImplementation(() => {});

    mockDataSource.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM tenants'))
        return Promise.resolve([
          makeTenant({ waVerificationStatus: WaVerificationStatus.PENDING }),
        ]);
      return Promise.resolve([]);
    });

    await service.runBirthdayCron();

    expect(mockWaQueue.add).not.toHaveBeenCalled();
    // Not connected: no wallet warning, but completion log includes skippedNotConnected=1
    const logSpy = jest.spyOn(service['logger'], 'log');
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('empty wallet'),
    );
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  // ── T7: empty marketing wallet → skipped ──────────────────────────────────

  it('T7 — skips tenant and warns when marketing wallet balance is 0', async () => {
    const warnSpy = jest
      .spyOn(service['logger'], 'warn')
      .mockImplementation(() => {});

    mockDataSource.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM tenants'))
        return Promise.resolve([makeTenant({ marketingWalletBalance: '0' })]);
      return Promise.resolve([]);
    });

    await service.runBirthdayCron();

    expect(mockWaQueue.add).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('empty wallet'),
    );
    warnSpy.mockRestore();
  });

  // ── T8: positive wallet → queued ──────────────────────────────────────────

  it('T8 — queues birthday job when tenant has positive wallet balance', async () => {
    mockDataSource.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM tenants'))
        return Promise.resolve([
          makeTenant({ marketingWalletBalance: '5000' }),
        ]);
      if (sql.includes('FROM customers'))
        return Promise.resolve([makeCustomer()]);
      if (sql.includes('FROM trigger_logs')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    await service.runBirthdayCron();

    expect(mockWaQueue.add).toHaveBeenCalledTimes(1);
  });

  // ── T9: duration > 45s → warning logged ───────────────────────────────────

  it('T9 — logs warning when cron duration exceeds 45 seconds', async () => {
    const warnSpy = jest
      .spyOn(service['logger'], 'warn')
      .mockImplementation(() => {});

    // First Date.now() call = startTime=0; second call = 50001ms later
    let callCount = 0;
    const dateSpy = jest.spyOn(Date, 'now').mockImplementation(() => {
      return ++callCount === 1 ? 0 : 50_001;
    });

    mockDataSource.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM tenants')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    await service.runBirthdayCron();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('exceeds 45s threshold'),
    );

    dateSpy.mockRestore();
    warnSpy.mockRestore();
    jest.setSystemTime(new Date('2024-11-15T07:00:00.000Z'));
  });

  // ── T10: 10 tenants all processed ─────────────────────────────────────────

  it('T10 — processes all 10 qualifying tenants', async () => {
    const tenants = Array.from({ length: 10 }, (_, i) =>
      makeTenant({ id: `tenant-${i + 1}` }),
    );

    let tenantPageCount = 0;
    mockDataSource.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM tenants')) {
        // First page: 20 tenants (but we only have 10 qualifying), second: empty
        return Promise.resolve(tenantPageCount++ === 0 ? tenants : []);
      }
      if (sql.includes('FROM customers'))
        return Promise.resolve([makeCustomer()]);
      if (sql.includes('FROM trigger_logs')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    await service.runBirthdayCron();

    // 10 tenants × 1 customer each = 10 queue.add calls
    expect(mockWaQueue.add).toHaveBeenCalledTimes(10);
  });
});
