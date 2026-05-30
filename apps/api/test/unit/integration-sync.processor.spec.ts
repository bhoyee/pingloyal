import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IntegrationSyncProcessor } from '../../src/queue/processors/integration-sync.processor';
import { Integration } from '../../src/modules/integrations/entities/integration.entity';
import { Customer } from '../../src/modules/customers/entities/customer.entity';
import { ProductCategory } from '../../src/modules/tenants/entities/product-category.entity';
import { TransactionsService } from '../../src/modules/transactions/transactions.service';
import { IntegrationSyncStatus } from '@pingloyal/types';
import type { Job } from 'bullmq';

jest.mock('@pingloyal/utils', () => ({
  decrypt: jest.fn((v: string) => v.replace('enc:', '')),
  normalisePhone: jest.fn(() => '+2348012345678'),
  PhoneNormalisationError: class extends Error {},
}));

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

// ── Global fetch mock ─────────────────────────────────────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-1';
const INTEGRATION_ID = 'integ-1';

function makeIntegrationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INTEGRATION_ID,
    tenantId: TENANT_ID,
    endpointUrl: 'https://pos.example.com/api/transactions',
    apiKeyEncrypted: 'enc:secret-key',
    webhookSecret: null,
    pollIntervalMins: 15,
    fieldMapping: {
      phone: 'customer_phone',
      amount: 'sale_amount',
      transactionId: 'tx_id',
    },
    syncStatus: IntegrationSyncStatus.ACTIVE,
    lastSyncCursor: null,
    pointsEarnRate: 100,
    pointsThreshold: 1000,
    lapsedDays: 60,
    ...overrides,
  };
}

function makeCustomer(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cust-1',
    tenantId: TENANT_ID,
    fullName: 'Adaeze Obi',
    phoneE164: '+2348012345678',
    waOptedIn: false,
    ...overrides,
  };
}

function makeJob(): Job {
  return {
    id: 'job-1',
    data: { integrationId: INTEGRATION_ID, tenantId: TENANT_ID },
    attemptsMade: 1,
    opts: { attempts: 3 },
  } as unknown as Job;
}

function mockSuccessResponse(body: unknown) {
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  });
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('IntegrationSyncProcessor', () => {
  let processor: IntegrationSyncProcessor;
  let mockManagerQuery: jest.Mock;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockIntegrationRepo: Record<string, any>;
  let mockCustomerRepo: Record<string, jest.Mock>;
  let mockCategoryRepo: Record<string, jest.Mock>;
  let mockTxService: { create: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockManagerQuery = jest.fn().mockResolvedValue([makeIntegrationRow()]);

    mockIntegrationRepo = {
      manager: { query: mockManagerQuery },
      update: jest.fn().mockResolvedValue(undefined),
      create: jest.fn((d: unknown) => d),
      save: jest.fn().mockResolvedValue(makeCustomer()),
      findOne: jest.fn().mockResolvedValue(null),
    };
    mockCustomerRepo = {
      findOne: jest.fn().mockResolvedValue(makeCustomer()),
      create: jest.fn((d: unknown) => d),
      save: jest.fn().mockResolvedValue(makeCustomer()),
      update: jest.fn().mockResolvedValue(undefined),
    };
    mockCategoryRepo = { findOne: jest.fn().mockResolvedValue(null) };
    mockTxService = {
      create: jest
        .fn()
        .mockResolvedValue({ pointsEarned: 50, alreadyProcessed: false }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntegrationSyncProcessor,
        {
          provide: getRepositoryToken(Integration),
          useValue: mockIntegrationRepo,
        },
        { provide: getRepositoryToken(Customer), useValue: mockCustomerRepo },
        {
          provide: getRepositoryToken(ProductCategory),
          useValue: mockCategoryRepo,
        },
        { provide: TransactionsService, useValue: mockTxService },
      ],
    }).compile();

    processor = module.get(IntegrationSyncProcessor);
  });

  // T1: Successful API pull ─────────────────────────────────────────────────

  it('T1 — fetches transactions and creates them via TransactionsService', async () => {
    mockSuccessResponse([
      { customer_phone: '08012345678', sale_amount: '5000', tx_id: 'TX-1' },
    ]);

    await processor.process(makeJob());

    expect(mockTxService.create).toHaveBeenCalledTimes(1);
    expect(mockIntegrationRepo.update).toHaveBeenCalledWith(
      INTEGRATION_ID,
      expect.objectContaining({ syncStatus: IntegrationSyncStatus.ACTIVE }),
    );
  });

  // T2: API 401 → marked as error, not retried ──────────────────────────────

  it('T2 — API 401 marks integration as error without rethrowing', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 });

    await expect(processor.process(makeJob())).resolves.toBeUndefined();
    expect(mockIntegrationRepo.update).toHaveBeenCalledWith(
      INTEGRATION_ID,
      expect.objectContaining({ syncStatus: IntegrationSyncStatus.ERROR }),
    );
    expect(mockTxService.create).not.toHaveBeenCalled();
  });

  // T3: API 429 → re-thrown for BullMQ retry ────────────────────────────────

  it('T3 — API 429 re-throws for BullMQ retry', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 429 });

    await expect(processor.process(makeJob())).rejects.toThrow('429');
  });

  // T4: API 500 → re-thrown for retry ──────────────────────────────────────

  it('T4 — API 500 re-throws for BullMQ retry', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    await expect(processor.process(makeJob())).rejects.toThrow('500');
  });

  // T5: Empty response → no error, lastSyncedAt updated ────────────────────

  it('T5 — empty transaction array updates lastSyncedAt without error', async () => {
    mockSuccessResponse([]);

    await processor.process(makeJob());

    expect(mockTxService.create).not.toHaveBeenCalled();
    expect(mockIntegrationRepo.update).toHaveBeenCalledWith(
      INTEGRATION_ID,
      expect.objectContaining({
        syncStatus: IntegrationSyncStatus.ACTIVE,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        lastSyncedAt: expect.any(Date),
      }),
    );
  });

  // T6: { transactions: [...] } shape ───────────────────────────────────────

  it('T6 — extracts transactions from { transactions: [...] } shape', async () => {
    mockSuccessResponse({
      transactions: [
        { customer_phone: '08012345678', sale_amount: '5000', tx_id: 'T6' },
      ],
    });

    await processor.process(makeJob());

    expect(mockTxService.create).toHaveBeenCalledTimes(1);
  });

  // T7: { data: [...] } shape ───────────────────────────────────────────────

  it('T7 — extracts transactions from { data: [...] } shape', async () => {
    mockSuccessResponse({
      data: [
        { customer_phone: '08012345678', sale_amount: '5000', tx_id: 'T7' },
      ],
    });

    await processor.process(makeJob());

    expect(mockTxService.create).toHaveBeenCalledTimes(1);
  });

  // T8: Raw array shape ─────────────────────────────────────────────────────

  it('T8 — handles raw array response shape', async () => {
    mockSuccessResponse([
      { customer_phone: '08012345678', sale_amount: '5000', tx_id: 'T8' },
    ]);

    await processor.process(makeJob());

    expect(mockTxService.create).toHaveBeenCalledTimes(1);
  });

  // T9: Unknown response shape → empty, logs warning ────────────────────────

  it('T9 — unknown response shape returns empty without error', async () => {
    mockSuccessResponse({ unknown_key: 'something' });

    await processor.process(makeJob());

    expect(mockTxService.create).not.toHaveBeenCalled();
    expect(mockIntegrationRepo.update).toHaveBeenCalledWith(
      INTEGRATION_ID,
      expect.objectContaining({ syncStatus: IntegrationSyncStatus.ACTIVE }),
    );
  });

  // T10: Cursor updated after successful sync ────────────────────────────────

  it('T10 — cursor updated to externalTransactionId after successful sync', async () => {
    mockSuccessResponse([
      { customer_phone: '08012345678', sale_amount: '5000', tx_id: 'TXN-999' },
    ]);

    await processor.process(makeJob());

    expect(mockIntegrationRepo.update).toHaveBeenCalledWith(
      INTEGRATION_ID,
      expect.objectContaining({ lastSyncCursor: 'TXN-999' }),
    );
  });

  // T11: Cursor not updated if all transactions failed ──────────────────────

  it('T11 — cursor not updated when all transactions fail', async () => {
    const { normalisePhone } = await import('@pingloyal/utils');
    const { PhoneNormalisationError } = await import('@pingloyal/utils');
    // Use mockImplementationOnce so it reverts after one call
    (normalisePhone as jest.Mock).mockImplementationOnce(() => {
      throw new PhoneNormalisationError('bad phone');
    });

    mockSuccessResponse([
      { customer_phone: 'INVALID', sale_amount: '5000', tx_id: 'TX-FAIL' },
    ]);

    await processor.process(makeJob());

    // lastSyncCursor should NOT be the failed transaction's id
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const updateCall = mockIntegrationRepo.update.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(updateCall[1].lastSyncCursor).not.toBe('TX-FAIL');
  });

  // T12: Individual failure does not abort batch ─────────────────────────────

  it('T12 — individual transaction failure does not abort remaining batch', async () => {
    mockTxService.create
      .mockRejectedValueOnce(new Error('DB error on first'))
      .mockResolvedValue({ pointsEarned: 50 });

    mockSuccessResponse([
      { customer_phone: '08012345678', sale_amount: '5000', tx_id: 'TX-A' },
      { customer_phone: '08012345678', sale_amount: '3000', tx_id: 'TX-B' },
    ]);

    await processor.process(makeJob());

    // Second transaction should still be processed
    expect(mockTxService.create).toHaveBeenCalledTimes(2);
  });

  // T13: syncStatus = 'paused' → returns early ──────────────────────────────

  it('T13 — paused integration returns early without fetching', async () => {
    mockManagerQuery.mockResolvedValue([
      makeIntegrationRow({ syncStatus: 'paused' }),
    ]);

    await processor.process(makeJob());

    expect(mockFetch).not.toHaveBeenCalled();
  });

  // T14: Field mapping applied correctly ────────────────────────────────────

  it('T14 — field mapping applied correctly, correct amount passed to create()', async () => {
    mockManagerQuery.mockResolvedValue([
      makeIntegrationRow({
        fieldMapping: {
          phone: 'phone',
          amount: 'total_amount',
          transactionId: 'ref',
        },
      }),
    ]);
    mockSuccessResponse([
      { phone: '08012345678', total_amount: '7500.50', ref: 'REF-1' },
    ]);

    await processor.process(makeJob());

    const callArgs = mockTxService.create.mock.calls[0] as [
      string,
      null,
      { amount: string },
    ];
    expect(callArgs[2].amount).toBe('7500.50');
  });
});
