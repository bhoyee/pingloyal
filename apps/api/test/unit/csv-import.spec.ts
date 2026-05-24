import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  ImportService,
  IMPORT_PROCESS_EVENT,
} from '../../src/modules/customers/import.service';
import { CustomerSource, PointsLedgerReason } from '@pingloyal/types';

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

const qbMock = {
  insert: jest.fn().mockReturnThis(),
  into: jest.fn().mockReturnThis(),
  values: jest.fn().mockReturnThis(),
  execute: jest.fn().mockResolvedValue({ identifiers: [], raw: [], generatedMaps: [] }),
};

const emMock = {
  createQueryBuilder: jest.fn().mockReturnValue(qbMock),
  query: jest.fn().mockResolvedValue([]),
};

const dataSourceMock = {
  transaction: jest
    .fn()
    .mockImplementation(
      async (cb: (em: typeof emMock) => Promise<void>) => cb(emMock),
    ),
};

const customerRepoMock = {
  find: jest.fn().mockResolvedValue([]),
};

const redisMock = {
  get: jest.fn().mockResolvedValue(null),
  setex: jest.fn().mockResolvedValue('OK'),
};

const emitterMock = {
  emit: jest.fn(),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'customers.csv',
    encoding: '7bit',
    mimetype: 'text/csv',
    size: 100,
    buffer: Buffer.from('data'),
    stream: null as any,
    destination: '',
    filename: '',
    path: '',
    ...overrides,
  };
}

function makeService(): ImportService {
  return new ImportService(
    customerRepoMock as any,
    dataSourceMock as any,
    redisMock as any,
    emitterMock as any,
  );
}

function makePayload(rows: Record<string, string>[]) {
  mockCsvParse.mockReturnValue(rows);
  return {
    jobId: 'job-001',
    tenantId: 'tenant-001',
    buffer: Buffer.from(''),
  };
}

const INITIAL_JOB_JSON = JSON.stringify({
  status: 'pending',
  total: 0,
  inserted: 0,
  updated: 0,
  skipped: 0,
  errors: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  redisMock.get.mockResolvedValue(INITIAL_JOB_JSON);
  redisMock.setex.mockResolvedValue('OK');
  customerRepoMock.find.mockResolvedValue([]);
  emMock.query.mockResolvedValue([]);
  qbMock.execute.mockResolvedValue({ identifiers: [], raw: [], generatedMaps: [] });
});

// ── startImport ───────────────────────────────────────────────────────────────

describe('startImport', () => {
  it('T42 — throws BadRequestException when no file provided', async () => {
    const service = makeService();
    await expect(
      service.startImport('tenant-1', undefined as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('T43 — throws BadRequestException for wrong MIME type', async () => {
    const service = makeService();
    const file = makeFile({ mimetype: 'image/png' });
    await expect(service.startImport('tenant-1', file)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('T44 — throws BadRequestException when file exceeds 5 MB', async () => {
    const service = makeService();
    const file = makeFile({ size: 6 * 1024 * 1024 });
    await expect(service.startImport('tenant-1', file)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('T45 — stores pending job in Redis, emits event, returns jobId', async () => {
    redisMock.get.mockResolvedValue(null);
    const service = makeService();
    const file = makeFile();

    const result = await service.startImport('tenant-1', file);

    expect(result.status).toBe('pending');
    expect(typeof result.jobId).toBe('string');
    expect(result.message).toBeTruthy();
    expect(redisMock.setex).toHaveBeenCalledWith(
      expect.stringContaining('import:tenant-1:'),
      86_400,
      expect.stringContaining('"status":"pending"'),
    );
    expect(emitterMock.emit).toHaveBeenCalledWith(
      IMPORT_PROCESS_EVENT,
      expect.objectContaining({ jobId: result.jobId, tenantId: 'tenant-1' }),
    );
  });
});

// ── getJobStatus ──────────────────────────────────────────────────────────────

describe('getJobStatus', () => {
  it('T46 — throws NotFoundException when job key absent from Redis', async () => {
    redisMock.get.mockResolvedValue(null);
    const service = makeService();
    await expect(service.getJobStatus('tenant-1', 'no-such-job')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('T47 — returns parsed status from Redis', async () => {
    const stored = {
      status: 'done',
      total: 10,
      inserted: 8,
      updated: 2,
      skipped: 0,
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

// ── processImport — validation ────────────────────────────────────────────────

describe('processImport — row validation', () => {
  it('T48 — records error and skips row with missing full_name', async () => {
    mockNormalisePhone.mockReturnValue('+2348011111111');
    const service = makeService();
    const payload = makePayload([{ phone: '08011111111' }]);

    await service.processImport(payload);

    const finalCall = redisMock.setex.mock.calls.at(-1);
    const finalJob = JSON.parse(finalCall[2] as string);
    expect(finalJob.status).toBe('done');
    expect(finalJob.skipped).toBe(1);
    expect(finalJob.errors[0]).toMatchObject({ row: 2, reason: 'full_name is required' });
  });

  it('T49 — records error and skips row with missing phone', async () => {
    const service = makeService();
    const payload = makePayload([{ full_name: 'Ada Okonkwo' }]);

    await service.processImport(payload);

    const finalCall = redisMock.setex.mock.calls.at(-1);
    const finalJob = JSON.parse(finalCall[2] as string);
    expect(finalJob.skipped).toBe(1);
    expect(finalJob.errors[0]).toMatchObject({ row: 2, reason: 'phone is required' });
  });

  it('T50 — records error and skips row with invalid phone', async () => {
    mockNormalisePhone.mockImplementation(() => {
      throw new PhoneNormalisationError('Cannot normalise phone number: "bad"');
    });
    const service = makeService();
    const payload = makePayload([{ full_name: 'Ada', phone: 'bad' }]);

    await service.processImport(payload);

    const finalCall = redisMock.setex.mock.calls.at(-1);
    const finalJob = JSON.parse(finalCall[2] as string);
    expect(finalJob.skipped).toBe(1);
    expect(finalJob.errors[0].reason).toContain('Cannot normalise');
  });
});

// ── processImport — upsert logic ──────────────────────────────────────────────

describe('processImport — upsert logic', () => {
  it('T51 — inserts new customer with correct fields', async () => {
    mockNormalisePhone.mockReturnValue('+2348012345678');
    customerRepoMock.find.mockResolvedValue([]); // no existing

    const service = makeService();
    const payload = makePayload([
      { full_name: 'Ada Okonkwo', phone: '08012345678', points_balance: '0', wa_opted_in: 'true' },
    ]);

    await service.processImport(payload);

    expect(qbMock.insert).toHaveBeenCalled();
    const insertedValues: Array<Record<string, unknown>> = qbMock.values.mock.calls[0][0];
    const first = insertedValues[0];
    expect(first.fullName).toBe('Ada Okonkwo');
    expect(first.phoneE164).toBe('+2348012345678');
    expect(first.waOptedIn).toBe(true);
    expect(first.source).toBe(CustomerSource.CSV_IMPORT);

    const finalJob = JSON.parse(redisMock.setex.mock.calls.at(-1)[2] as string);
    expect(finalJob.status).toBe('done');
    expect(finalJob.inserted).toBe(1);
    expect(finalJob.updated).toBe(0);
  });

  it('T52 — updates existing customer; does not overwrite points or wa_opted_in', async () => {
    mockNormalisePhone.mockReturnValue('+2348012345678');
    customerRepoMock.find.mockResolvedValue([{ phoneE164: '+2348012345678' }]);

    const service = makeService();
    const payload = makePayload([
      {
        full_name: 'Ada Updated',
        phone: '08012345678',
        points_balance: '999',
        wa_opted_in: 'true',
      },
    ]);

    await service.processImport(payload);

    // Should NOT call queryBuilder insert
    expect(qbMock.execute).not.toHaveBeenCalled();

    // Should call raw UPDATE query
    const updateCalls = emMock.query.mock.calls.filter(
      ([sql]: [string]) => sql.includes('UPDATE customers') && sql.includes('unnest'),
    );
    expect(updateCalls.length).toBeGreaterThan(0);
    const [sql, params] = updateCalls[0] as [string, unknown[][]];
    expect(sql).not.toContain('points_balance');
    expect(sql).not.toContain('wa_opted_in');
    // The names array is params[1]
    expect((params[1] as string[])[0]).toBe('Ada Updated');

    const finalJob = JSON.parse(redisMock.setex.mock.calls.at(-1)[2] as string);
    expect(finalJob.updated).toBe(1);
    expect(finalJob.inserted).toBe(0);
  });
});

// ── processImport — ledger seeding ────────────────────────────────────────────

describe('processImport — ledger seeding', () => {
  it('T53 — seeds import_seed ledger for new customer with points_balance > 0', async () => {
    mockNormalisePhone.mockReturnValue('+2348012345678');
    customerRepoMock.find.mockResolvedValue([]);

    const service = makeService();
    const payload = makePayload([
      { full_name: 'Ada', phone: '08012345678', points_balance: '150' },
    ]);

    await service.processImport(payload);

    const ledgerCalls = emMock.query.mock.calls.filter(
      ([sql]: [string]) => sql.includes('points_ledger'),
    );
    expect(ledgerCalls.length).toBe(1);
    const [, params] = ledgerCalls[0] as [string, string[]];
    expect(params[3]).toBe(150); // delta
    expect(params[4]).toBe(PointsLedgerReason.IMPORT_SEED);
    expect(params[5]).toBe(150); // balance_after
  });

  it('T54 — does NOT seed ledger for existing (updated) customer', async () => {
    mockNormalisePhone.mockReturnValue('+2348012345678');
    customerRepoMock.find.mockResolvedValue([{ phoneE164: '+2348012345678' }]);

    const service = makeService();
    const payload = makePayload([
      { full_name: 'Ada', phone: '08012345678', points_balance: '200' },
    ]);

    await service.processImport(payload);

    const ledgerCalls = emMock.query.mock.calls.filter(
      ([sql]: [string]) => sql.includes('points_ledger'),
    );
    expect(ledgerCalls).toHaveLength(0);
  });
});

// ── processImport — failure paths ─────────────────────────────────────────────

describe('processImport — failure paths', () => {
  it('T55 — sets status=failed when CSV cannot be parsed', async () => {
    mockCsvParse.mockImplementation(() => {
      throw new Error('unexpected end of file');
    });
    const service = makeService();
    await service.processImport({ jobId: 'j1', tenantId: 't1', buffer: Buffer.from('') });

    const finalJob = JSON.parse(redisMock.setex.mock.calls.at(-1)[2] as string);
    expect(finalJob.status).toBe('failed');
    expect(finalJob.errors[0].reason).toContain('CSV parse error');
  });

  it('T56 — sets status=failed when CSV has more than 5,000 data rows', async () => {
    mockCsvParse.mockReturnValue(new Array(5_001).fill({ full_name: 'X', phone: '123' }));
    const service = makeService();
    await service.processImport({ jobId: 'j1', tenantId: 't1', buffer: Buffer.from('') });

    const finalJob = JSON.parse(redisMock.setex.mock.calls.at(-1)[2] as string);
    expect(finalJob.status).toBe('failed');
    expect(finalJob.errors[0].reason).toContain('5001');
  });
});

// ── buildTemplate ─────────────────────────────────────────────────────────────

describe('buildTemplate', () => {
  it('T57 — returns a Buffer with comment header and required CSV columns', () => {
    const service = makeService();
    const buf = service.buildTemplate();
    expect(buf).toBeInstanceOf(Buffer);
    const text = buf.toString('utf-8');
    expect(text).toContain('full_name,phone');
    expect(text.startsWith('#')).toBe(true);
  });
});
