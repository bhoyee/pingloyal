import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReportsController } from '../../src/modules/reports/reports.controller';
import { ReportsService } from '../../src/modules/reports/reports.service';
import { ReportSchedule } from '../../src/modules/reports/entities/report-schedule.entity';
import type { RequestUser } from '@pingloyal/types';
import { PlanTier, UserRole } from '@pingloyal/types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('pdfmake/build/pdfmake', () => ({
  createPdf: jest.fn().mockReturnValue({
    getBuffer: (cb: (b: Buffer) => void) => cb(Buffer.from('fake-pdf')),
  }),
  vfs: {},
}));
jest.mock('pdfmake/build/vfs_fonts', () => ({ vfs: {} }));

const TENANT_ID = 'tenant-uuid';

function makeUser(overrides: Partial<RequestUser> = {}): RequestUser {
  return {
    userId: 'user-1',
    tenantId: TENANT_ID,
    role: UserRole.OWNER,
    planTier: PlanTier.STARTER,
    ...overrides,
  };
}

function makeReq(user = makeUser()) {
  return { user };
}

const MOCK_REPORT = {
  period: {
    type: 'this_month',
    start: new Date(),
    end: new Date(),
    durationDays: 15,
  },
  generatedAt: new Date().toISOString(),
  loyalty: {
    totalCustomers: 50,
    activeCustomers: 35,
    inactiveCustomers: 15,
    newCustomersThisMonth: 5,
    retentionRate: 40,
    avgVisitsPerCustomer: 2,
    weeklyNewCustomers: [],
    vsLastPeriod: { totalCustomers: 45, activeRate: 70 },
  },
  points: {
    issued: 1000,
    redeemed: 100,
    redemptionRate: 10,
    avgPointsPerCustomer: 20,
    nearRewardCount: 5,
    dailyIssued: [],
  },
  whatsapp: {
    totalSent: 50,
    deliveryRate: 90,
    botInteractions: 5,
    triggerBreakdown: {},
  },
  wallet: {
    totalSpend: 2000,
    spendByType: {},
    costPerReach: 40,
    estimatedRoi: 1.5,
  },
  content: {
    bestCampaign: null,
    busiestDayOfWeek: [],
    topCustomers: [],
    categoryBreakdown: [],
  },
};

describe('ReportsController', () => {
  let controller: ReportsController;
  let mockReportsService: Record<string, jest.Mock>;
  let mockScheduleRepo: Record<string, jest.Mock>;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockReportsService = {
      getReport: jest.fn().mockResolvedValue(MOCK_REPORT),
      computeReport: jest.fn().mockResolvedValue(MOCK_REPORT),
      generatePdf: jest.fn().mockResolvedValue(Buffer.from('pdf')),
      generateExcel: jest.fn().mockResolvedValue(Buffer.from('xlsx')),
    };

    mockScheduleRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation((d: unknown) => Promise.resolve(d)),
      create: jest.fn().mockImplementation((d: unknown) => d),
      update: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [
        { provide: ReportsService, useValue: mockReportsService },
        {
          provide: getRepositoryToken(ReportSchedule),
          useValue: mockScheduleRepo,
        },
      ],
    }).compile();

    controller = module.get(ReportsController);
  });

  // T1 — GET /summary calls getReport
  it('T1 — GET /summary with period=this_month calls getReport', async () => {
    const result = await controller.getSummary(makeReq(), {
      period: 'this_month',
    });
    expect(mockReportsService.getReport).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ type: 'this_month' }),
    );
    expect(result).toEqual(MOCK_REPORT);
  });

  // T2 — custom period without start/end → 400
  it('T2 — GET /summary with period=custom and no start/end → BadRequestException', async () => {
    await expect(
      controller.getSummary(makeReq(), { period: 'custom' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      controller.getSummary(makeReq(), { period: 'custom' }),
    ).rejects.toThrow('start and end are required');
  });

  // T3 — start >= end → 400
  it('T3 — GET /summary with start >= end → BadRequestException', async () => {
    await expect(
      controller.getSummary(makeReq(), {
        period: 'custom',
        start: '2026-05-31',
        end: '2026-05-01',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // T4 — POST /refresh calls computeReport (bypasses cache)
  it('T4 — POST /refresh calls computeReport', async () => {
    const result = await controller.refresh(makeReq(), {
      period: 'this_month',
    });
    expect(mockReportsService.computeReport).toHaveBeenCalledTimes(1);
    expect(result).toEqual(MOCK_REPORT);
  });

  // T5 — GET /pdf sets Content-Type application/pdf
  it('T5 — GET /pdf sets Content-Type header to application/pdf', async () => {
    const mockRes = {
      setHeader: jest.fn(),
      end: jest.fn(),
    };
    await controller.downloadPdf(
      makeReq(),
      { period: 'this_month' },
      mockRes as never,
    );
    expect(mockRes.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/pdf',
    );
    expect(mockRes.end).toHaveBeenCalledWith(Buffer.from('pdf'));
  });

  // T6 — GET /excel sets correct Content-Type
  it('T6 — GET /excel sets spreadsheet Content-Type header', async () => {
    const mockRes = { setHeader: jest.fn(), end: jest.fn() };
    await controller.downloadExcel(
      makeReq(),
      { period: 'this_month' },
      mockRes as never,
    );
    expect(mockRes.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  });

  // T7 — POST /schedule upserts and returns message
  it('T7 — POST /schedule creates schedule and returns confirmation message', async () => {
    const result = await controller.createSchedule(makeReq(), {
      email: 'owner@store.com',
      frequency: 'monthly',
    });
    expect(mockScheduleRepo.save).toHaveBeenCalled();
    expect(result.message).toContain('owner@store.com');
  });

  // T8 — GET /schedule returns null when no schedule
  it('T8 — GET /schedule returns null when no schedule set', async () => {
    mockScheduleRepo.findOne.mockResolvedValue(null);
    const result = await controller.getSchedule(makeReq());
    expect(result).toBeNull();
  });

  // T9 — GET /schedule returns schedule when set
  it('T9 — GET /schedule returns existing schedule', async () => {
    const existing = {
      id: 's1',
      tenantId: TENANT_ID,
      email: 'x@x.com',
      isActive: true,
    };
    mockScheduleRepo.findOne.mockResolvedValue(existing);
    const result = await controller.getSchedule(makeReq());
    expect(result).toEqual(existing);
  });

  // T10 — DELETE /schedule sets is_active = false
  it('T10 — DELETE /schedule sets isActive=false and returns confirmation', async () => {
    const result = await controller.deleteSchedule(makeReq());
    expect(mockScheduleRepo.update).toHaveBeenCalledWith(
      { tenantId: TENANT_ID },
      { isActive: false },
    );
    expect(result.message).toContain('cancelled');
  });
});
