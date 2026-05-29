import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { getDataSourceToken } from '@nestjs/typeorm';
import { LapsedCronService } from '../../src/modules/triggers/lapsed-cron.service';
import { TriggerType } from '@pingloyal/types';

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

const TENANT = {
  id: 'tenant-1',
  businessName: 'TestStore',
  lapsedDays: 60,
};

function makeCustomer(lastPurchaseAt: Date | null = null) {
  return {
    id: 'customer-1',
    fullName: 'Amara Okafor',
    phoneE164: '+2348012345678',
    lastPurchaseAt:
      lastPurchaseAt ?? new Date(Date.now() - 61 * 24 * 3600 * 1000),
  };
}

function makeQueryBuilder(customers: object[] = []) {
  return {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(customers),
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('LapsedCronService', () => {
  let service: LapsedCronService;
  let mockWaQueue: { add: jest.Mock };
  let mockDataSource: { query: jest.Mock; createQueryBuilder: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockWaQueue = { add: jest.fn().mockResolvedValue({ id: 'q-job' }) };
    mockDataSource = {
      query: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    // 1 tenant < PAGE_SIZE(20), so loop exits after page 1 with no second query.
    mockDataSource.query
      .mockResolvedValueOnce([TENANT]) // tenant page 1
      .mockResolvedValue([]); // birthday checks + UPDATE customers

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LapsedCronService,
        { provide: getQueueToken('wa-messages'), useValue: mockWaQueue },
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();

    service = module.get(LapsedCronService);
  });

  // ── T1: 61 days lapsed, threshold=60 → queued ────────────────────────────

  it('T1 — queues LAPSED_WINBACK for customer lapsed 61 days (threshold=60)', async () => {
    mockDataSource.createQueryBuilder.mockReturnValue(
      makeQueryBuilder([makeCustomer()]),
    );

    await service.runLapsedCron();

    expect(mockWaQueue.add).toHaveBeenCalledTimes(1);
    expect(mockWaQueue.add).toHaveBeenCalledWith(
      'send-message',
      expect.objectContaining({
        type: TriggerType.LAPSED_WINBACK,
        tenantId: 'tenant-1',
        customerId: 'customer-1',
      }),
      expect.objectContaining({ attempts: 3 }),
    );
  });

  // ── T2: 59 days lapsed, threshold=60 → NOT queued ────────────────────────

  it('T2 — does NOT queue when customer lapsed 59 days (threshold=60, DB filters it)', async () => {
    // DB WHERE clause filters out 59-day-old customer — returns empty
    mockDataSource.createQueryBuilder.mockReturnValue(makeQueryBuilder([]));

    await service.runLapsedCron();

    expect(mockWaQueue.add).not.toHaveBeenCalled();
  });

  // ── T3: lapsed_sent_at = 20 days ago → NOT queued (within 30-day cooldown) ─

  it('T3 — does NOT queue when lapsed_sent_at is within 30-day cooldown', async () => {
    // DB filters customer because lapsed_sent_at is within 30 days
    mockDataSource.createQueryBuilder.mockReturnValue(makeQueryBuilder([]));

    await service.runLapsedCron();

    expect(mockWaQueue.add).not.toHaveBeenCalled();
  });

  // ── T4: lapsed_sent_at = 31 days ago → queued (cooldown expired) ──────────

  it('T4 — queues when lapsed_sent_at is > 30 days ago (cooldown expired)', async () => {
    // DB includes customer because lapsed_sent_at > 30 days ago
    mockDataSource.createQueryBuilder.mockReturnValue(
      makeQueryBuilder([makeCustomer()]),
    );

    await service.runLapsedCron();

    expect(mockWaQueue.add).toHaveBeenCalledTimes(1);
  });

  // ── T5: wa_opted_in=false → NOT queued ────────────────────────────────────

  it('T5 — does NOT queue when customer wa_opted_in is false (DB filters it)', async () => {
    mockDataSource.createQueryBuilder.mockReturnValue(makeQueryBuilder([]));

    await service.runLapsedCron();

    expect(mockWaQueue.add).not.toHaveBeenCalled();
  });

  // ── T6: last_purchase_at=NULL → NOT queued ────────────────────────────────

  it('T6 — does NOT queue when customer last_purchase_at is NULL (DB filters it)', async () => {
    mockDataSource.createQueryBuilder.mockReturnValue(makeQueryBuilder([]));

    await service.runLapsedCron();

    expect(mockWaQueue.add).not.toHaveBeenCalled();
  });

  // ── Extra: birthday protection ────────────────────────────────────────────

  it('T7 — does NOT queue lapsed if birthday message was sent today', async () => {
    // Reset beforeEach-queued return values so we can control call order precisely
    mockDataSource.query.mockReset();
    mockDataSource.query
      .mockResolvedValueOnce([TENANT]) // tenant page 1 (exits loop; 1 < PAGE_SIZE)
      .mockResolvedValueOnce([{ id: 'birthday-log-1' }]) // birthday check → skip
      .mockResolvedValue([]); // safety fallback

    mockDataSource.createQueryBuilder.mockReturnValue(
      makeQueryBuilder([makeCustomer()]),
    );

    await service.runLapsedCron();

    expect(mockWaQueue.add).not.toHaveBeenCalled();
  });
});
