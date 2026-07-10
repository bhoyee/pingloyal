import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  FileImportService,
  FILE_IMPORT_PROCESS_EVENT,
  type FileImportJobStatus,
} from '../../src/modules/integrations/file-import.service';
import {
  IntegrationConnectionType,
  IntegrationSyncStatus,
  CustomerSource,
  TransactionSource,
} from '@pingloyal/types';

// ── Module mocks (hoisted) ────────────────────────────────────────────────────

jest.mock('csv-parse/sync', () => ({ parse: jest.fn() }));

jest.mock('@pingloyal/utils', () => ({
  normalisePhone: jest.fn(),
  PhoneNormalisationError: class PhoneNormalisationError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'PhoneNormalisationError';
    }
  },
}));

// ── Lazy references to the mocked functions ───────────────────────────────────

import { parse as csvParse } from 'csv-parse/sync';
import { normalisePhone, PhoneNormalisationError } from '@pingloyal/utils';

const mockCsvParse = csvParse as jest.Mock;
const mockNormalisePhone = normalisePhone as jest.Mock;

// ── Shared infrastructure mocks ───────────────────────────────────────────────

const integrationRepoMock = {
  findOne: jest.fn(),
  update: jest.fn().mockResolvedValue({ affected: 1 }),
};

const customerRepoMock = {
  findOne: jest.fn(),
  create: jest.fn((x: Record<string, unknown>) => x),
  save: jest.fn(),
  update: jest.fn().mockResolvedValue({ affected: 1 }),
};

const categoryRepoMock = {
  findOne: jest.fn(),
};

const txServiceMock = {
  create: jest.fn(),
};

const redisMock = {
  get: jest.fn<Promise<string | null>, [key: string]>(),
  setex: jest.fn<Promise<'OK'>, [key: string, ttl: number, value: string]>(),
};

const emitterMock = {
  emit: jest.fn<boolean, [event: string, payload: unknown]>(),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFile(
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'transactions.csv',
    encoding: '7bit',
    mimetype: 'text/csv',
    size: 100,
    buffer: Buffer.from('data'),
    stream: null as never,
    destination: '',
    filename: '',
    path: '',
    ...overrides,
  };
}

function makeService(): FileImportService {
  return new FileImportService(
    integrationRepoMock as never,
    customerRepoMock as never,
    categoryRepoMock as never,
    txServiceMock as never,
    redisMock as never,
    emitterMock as never,
  );
}

const FIELD_MAPPING = {
  phone: 'phone',
  amount: 'amount',
  customerName: 'customer_name',
  categorySlug: 'category_slug',
  transactionId: 'transaction_id',
  occurredAt: 'occurred_at',
};

function makeIntegration(overrides: Record<string, unknown> = {}) {
  return {
    id: 'integ-1',
    tenantId: 'tenant-001',
    connectionType: IntegrationConnectionType.FILE_EXPORT,
    fieldMapping: FIELD_MAPPING,
    ...overrides,
  };
}

function makePayload(rows: Record<string, string>[]) {
  mockCsvParse.mockReturnValue(rows);
  return {
    jobId: 'job-001',
    tenantId: 'tenant-001',
    integrationId: 'integ-1',
    buffer: Buffer.from(''),
  };
}

/** Extracts the FileImportJobStatus written in the most-recent redis.setex call. */
function lastJobUpdate(): FileImportJobStatus {
  const calls = redisMock.setex.mock.calls;
  const last = calls[calls.length - 1];
  return JSON.parse(last[2]) as FileImportJobStatus;
}

const INITIAL_JOB_JSON = JSON.stringify({
  status: 'processing',
  total: 0,
  processed: 0,
  failed: 0,
  errors: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  redisMock.get.mockResolvedValue(INITIAL_JOB_JSON);
  redisMock.setex.mockResolvedValue('OK');
  integrationRepoMock.findOne.mockResolvedValue(makeIntegration());
  customerRepoMock.findOne.mockResolvedValue(null);
  customerRepoMock.save.mockImplementation((c: Record<string, unknown>) =>
    Promise.resolve({ id: 'cust-1', fullName: 'Unknown', ...c }),
  );
  categoryRepoMock.findOne.mockResolvedValue(null);
  txServiceMock.create.mockResolvedValue({ pointsEarned: 5 });
});

// ── uploadFile ─────────────────────────────────────────────────────────────────

describe('uploadFile', () => {
  it('throws BadRequestException when no file provided', async () => {
    const service = makeService();
    await expect(
      service.uploadFile('tenant-1', undefined as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException for wrong MIME type', async () => {
    const service = makeService();
    const file = makeFile({ mimetype: 'image/png' });
    await expect(service.uploadFile('tenant-1', file)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException when file exceeds 5 MB', async () => {
    const service = makeService();
    const file = makeFile({ size: 6 * 1024 * 1024 });
    await expect(service.uploadFile('tenant-1', file)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException when no integration is saved for the tenant', async () => {
    integrationRepoMock.findOne.mockResolvedValue(null);
    const service = makeService();
    await expect(service.uploadFile('tenant-1', makeFile())).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException when saved integration is not connectionType=file_export', async () => {
    integrationRepoMock.findOne.mockResolvedValue(
      makeIntegration({ connectionType: IntegrationConnectionType.WEBHOOK }),
    );
    const service = makeService();
    await expect(service.uploadFile('tenant-1', makeFile())).rejects.toThrow(
      BadRequestException,
    );
  });

  it('stores pending job in Redis, emits event, returns jobId', async () => {
    const service = makeService();
    const result = await service.uploadFile('tenant-1', makeFile());

    expect(result.status).toBe('pending');
    expect(typeof result.jobId).toBe('string');
    expect(redisMock.setex).toHaveBeenCalledWith(
      expect.stringContaining('file-import:tenant-1:'),
      86_400,
      expect.stringContaining('"status":"pending"'),
    );
    expect(emitterMock.emit).toHaveBeenCalledWith(
      FILE_IMPORT_PROCESS_EVENT,
      expect.objectContaining({
        jobId: result.jobId,
        tenantId: 'tenant-1',
        integrationId: 'integ-1',
      }),
    );
  });
});

// ── getJobStatus ──────────────────────────────────────────────────────────────

describe('getJobStatus', () => {
  it('throws NotFoundException when job key absent from Redis', async () => {
    redisMock.get.mockResolvedValue(null);
    const service = makeService();
    await expect(
      service.getJobStatus('tenant-1', 'no-such-job'),
    ).rejects.toThrow(NotFoundException);
  });

  it('returns parsed status from Redis', async () => {
    const stored: FileImportJobStatus = {
      status: 'done',
      total: 10,
      processed: 9,
      failed: 1,
      errors: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T01:00:00.000Z',
    };
    redisMock.get.mockResolvedValue(JSON.stringify(stored));
    const service = makeService();
    const status = await service.getJobStatus('tenant-1', 'job-abc');
    expect(status).toMatchObject(stored);
  });
});

// ── buildTemplate ─────────────────────────────────────────────────────────────

describe('buildTemplate', () => {
  it('returns a Buffer with comment header and configured column names', () => {
    const service = makeService();
    const buf = service.buildTemplate(FIELD_MAPPING);
    expect(buf).toBeInstanceOf(Buffer);
    const text = buf.toString('utf-8');
    expect(text).toContain('phone,amount,customer_name');
    expect(text.startsWith('#')).toBe(true);
  });

  it('falls back to default column names when fieldMapping is empty', () => {
    const service = makeService();
    const buf = service.buildTemplate({} as never);
    const text = buf.toString('utf-8');
    expect(text).toContain(
      'phone,amount,customer_name,category_slug,transaction_id,occurred_at',
    );
  });
});

// ── processFile — validation ───────────────────────────────────────────────────

describe('processFile — row validation', () => {
  it('records error and skips row with missing phone', async () => {
    const service = makeService();
    const payload = makePayload([{ amount: '500' }]);

    await service.processFile(payload);

    const job = lastJobUpdate();
    expect(job.status).toBe('done');
    expect(job.processed).toBe(0);
    expect(job.failed).toBe(1);
    expect(job.errors[0]).toMatchObject({ row: 2 });
    expect(job.errors[0].reason).toContain('phone field not found');
  });

  it('records error and skips row with invalid phone', async () => {
    mockNormalisePhone.mockImplementation(() => {
      throw new PhoneNormalisationError('Cannot normalise phone number: "bad"');
    });
    const service = makeService();
    const payload = makePayload([{ phone: 'bad', amount: '500' }]);

    await service.processFile(payload);

    const job = lastJobUpdate();
    expect(job.failed).toBe(1);
    expect(job.errors[0].reason).toContain('Cannot normalise');
  });

  it('records error and skips row with invalid amount', async () => {
    mockNormalisePhone.mockReturnValue('+2348012345678');
    const service = makeService();
    const payload = makePayload([{ phone: '08012345678', amount: 'abc' }]);

    await service.processFile(payload);

    const job = lastJobUpdate();
    expect(job.failed).toBe(1);
    expect(job.errors[0].reason).toContain('amount field invalid');
  });

  it('records error and skips row with zero/negative amount', async () => {
    mockNormalisePhone.mockReturnValue('+2348012345678');
    const service = makeService();
    const payload = makePayload([{ phone: '08012345678', amount: '0' }]);

    await service.processFile(payload);

    const job = lastJobUpdate();
    expect(job.failed).toBe(1);
    expect(job.errors[0].reason).toContain('amount field invalid');
  });
});

// ── processFile — transaction creation ────────────────────────────────────────

describe('processFile — transaction creation', () => {
  it('creates a new customer and a transaction with TransactionSource.FILE_IMPORT', async () => {
    mockNormalisePhone.mockReturnValue('+2348012345678');
    customerRepoMock.findOne.mockResolvedValue(null);

    const service = makeService();
    const payload = makePayload([
      {
        phone: '08012345678',
        amount: '5000',
        customer_name: 'Adaeze Obi',
      },
    ]);

    await service.processFile(payload);

    expect(customerRepoMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-001',
        fullName: 'Adaeze Obi',
        phoneE164: '+2348012345678',
        source: CustomerSource.CONNECTED_SYNC,
      }),
    );
    expect(txServiceMock.create).toHaveBeenCalledWith(
      'tenant-001',
      null,
      expect.objectContaining({ customerId: 'cust-1', amount: '5000.00' }),
      TransactionSource.FILE_IMPORT,
    );

    const job = lastJobUpdate();
    expect(job.status).toBe('done');
    expect(job.processed).toBe(1);
    expect(job.failed).toBe(0);
  });

  it('updates an existing "Unknown" customer name when customer_name is provided', async () => {
    mockNormalisePhone.mockReturnValue('+2348012345678');
    customerRepoMock.findOne.mockResolvedValue({
      id: 'cust-existing',
      fullName: 'Unknown',
      phoneE164: '+2348012345678',
    });

    const service = makeService();
    const payload = makePayload([
      { phone: '08012345678', amount: '1200', customer_name: 'Bola' },
    ]);

    await service.processFile(payload);

    expect(customerRepoMock.update).toHaveBeenCalledWith('cust-existing', {
      fullName: 'Bola',
    });
    expect(txServiceMock.create).toHaveBeenCalledWith(
      'tenant-001',
      null,
      expect.objectContaining({ customerId: 'cust-existing' }),
      TransactionSource.FILE_IMPORT,
    );
  });

  it('resolves categoryId from categorySlug when a matching category exists', async () => {
    mockNormalisePhone.mockReturnValue('+2348012345678');
    customerRepoMock.findOne.mockResolvedValue({
      id: 'cust-1',
      fullName: 'Ada',
      phoneE164: '+2348012345678',
    });
    categoryRepoMock.findOne.mockResolvedValue({
      id: 'cat-1',
      slug: 'groceries',
    });

    const service = makeService();
    const payload = makePayload([
      { phone: '08012345678', amount: '1000', category_slug: 'groceries' },
    ]);

    await service.processFile(payload);

    expect(txServiceMock.create).toHaveBeenCalledWith(
      'tenant-001',
      null,
      expect.objectContaining({ categoryId: 'cat-1' }),
      TransactionSource.FILE_IMPORT,
    );
  });

  it('uses the externalTransactionId-based idempotency key when transaction_id is mapped', async () => {
    mockNormalisePhone.mockReturnValue('+2348012345678');
    customerRepoMock.findOne.mockResolvedValue({
      id: 'cust-1',
      fullName: 'Ada',
      phoneE164: '+2348012345678',
    });

    const service = makeService();
    const payload = makePayload([
      { phone: '08012345678', amount: '1000', transaction_id: 'TXN-42' },
    ]);

    await service.processFile(payload);

    expect(txServiceMock.create).toHaveBeenCalledWith(
      'tenant-001',
      null,
      expect.objectContaining({
        idempotencyKey: 'fileimport_tenant-001_TXN-42',
      }),
      TransactionSource.FILE_IMPORT,
    );
  });

  it('derives a deterministic hash-based idempotency key when no transaction_id is mapped', async () => {
    mockNormalisePhone.mockReturnValue('+2348012345678');
    customerRepoMock.findOne.mockResolvedValue({
      id: 'cust-1',
      fullName: 'Ada',
      phoneE164: '+2348012345678',
    });

    const service = makeService();
    const row = { phone: '08012345678', amount: '1000' };

    await service.processFile(makePayload([row]));
    const firstKey = (
      txServiceMock.create.mock.calls[0] as [
        string,
        null,
        { idempotencyKey: string },
        TransactionSource,
      ]
    )[2].idempotencyKey;

    txServiceMock.create.mockClear();
    await service.processFile(makePayload([row]));
    const secondKey = (
      txServiceMock.create.mock.calls[0] as [
        string,
        null,
        { idempotencyKey: string },
        TransactionSource,
      ]
    )[2].idempotencyKey;

    expect(firstKey).toBe(secondKey);
    expect(firstKey).toContain('fileimport_tenant-001_');
  });
});

// ── processFile — integration status side effects ─────────────────────────────

describe('processFile — integration status updates', () => {
  it('marks the integration ACTIVE with lastSyncedAt after a successful run', async () => {
    mockNormalisePhone.mockReturnValue('+2348012345678');
    customerRepoMock.findOne.mockResolvedValue({
      id: 'cust-1',
      fullName: 'Ada',
      phoneE164: '+2348012345678',
    });

    const service = makeService();
    await service.processFile(
      makePayload([{ phone: '08012345678', amount: '1000' }]),
    );

    expect(integrationRepoMock.update).toHaveBeenCalledWith(
      'integ-1',
      expect.objectContaining({
        syncStatus: IntegrationSyncStatus.ACTIVE,
        errorMessage: null,
      }),
    );
  });

  it('continues processing remaining rows when one row throws unexpectedly', async () => {
    mockNormalisePhone.mockReturnValue('+2348012345678');
    customerRepoMock.findOne.mockResolvedValue({
      id: 'cust-1',
      fullName: 'Ada',
      phoneE164: '+2348012345678',
    });
    txServiceMock.create
      .mockRejectedValueOnce(new Error('db write failed'))
      .mockResolvedValueOnce({ pointsEarned: 1 });

    const service = makeService();
    await service.processFile(
      makePayload([
        { phone: '08012345678', amount: '1000' },
        { phone: '08099999999', amount: '2000' },
      ]),
    );

    const job = lastJobUpdate();
    expect(job.processed).toBe(1);
    expect(job.failed).toBe(1);
    expect(job.errors[0].reason).toContain('db write failed');
  });
});

// ── processFile — failure paths ────────────────────────────────────────────────

describe('processFile — failure paths', () => {
  it('sets status=failed when the integration no longer exists', async () => {
    integrationRepoMock.findOne.mockResolvedValue(null);
    const service = makeService();
    await service.processFile(
      makePayload([{ phone: '08012345678', amount: '1000' }]),
    );

    const job = lastJobUpdate();
    expect(job.status).toBe('failed');
    expect(job.errors[0].reason).toContain('no longer exists');
  });

  it('sets status=failed when CSV cannot be parsed', async () => {
    mockCsvParse.mockImplementation(() => {
      throw new Error('unexpected end of file');
    });
    const service = makeService();
    await service.processFile({
      jobId: 'j1',
      tenantId: 'tenant-001',
      integrationId: 'integ-1',
      buffer: Buffer.from(''),
    });

    const job = lastJobUpdate();
    expect(job.status).toBe('failed');
    expect(job.errors[0].reason).toContain('CSV parse error');
  });

  it('sets status=failed when CSV has more than 5,000 data rows', async () => {
    const rows = new Array(5_001)
      .fill(null)
      .map(() => ({ phone: '08012345678', amount: '100' })) as Record<
      string,
      string
    >[];
    mockCsvParse.mockReturnValue(rows);
    const service = makeService();
    await service.processFile({
      jobId: 'j1',
      tenantId: 'tenant-001',
      integrationId: 'integ-1',
      buffer: Buffer.from(''),
    });

    const job = lastJobUpdate();
    expect(job.status).toBe('failed');
    expect(job.errors[0].reason).toContain('5001');
  });
});
