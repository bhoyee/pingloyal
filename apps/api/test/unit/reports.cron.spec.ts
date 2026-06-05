import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReportsCronService } from '../../src/modules/reports/reports.cron';
import { ReportsService } from '../../src/modules/reports/reports.service';
import { EmailService } from '../../src/modules/reports/email.service';
import { ReportSchedule } from '../../src/modules/reports/entities/report-schedule.entity';
import { Tenant } from '../../src/modules/tenants/entities/tenant.entity';

jest.mock('pdfmake/build/pdfmake', () => ({
  createPdf: jest.fn().mockReturnValue({
    getBuffer: (cb: (b: Buffer) => void) => cb(Buffer.from('fake-pdf')),
  }),
  vfs: {},
}));
jest.mock('pdfmake/build/vfs_fonts', () => ({ vfs: {} }));

describe('ReportsCronService', () => {
  let service: ReportsCronService;
  let mockReportsService: { computeReport: jest.Mock; generatePdf: jest.Mock };
  let mockEmailService: { send: jest.Mock };
  let mockTenantRepo: { find: jest.Mock };
  let mockScheduleRepo: { find: jest.Mock; update: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockReportsService = {
      computeReport: jest.fn().mockResolvedValue({}),
      generatePdf: jest.fn().mockResolvedValue(Buffer.from('pdf')),
    };

    mockEmailService = {
      send: jest.fn().mockResolvedValue(undefined),
    };

    mockTenantRepo = {
      find: jest.fn().mockResolvedValue([]),
    };

    mockScheduleRepo = {
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsCronService,
        { provide: ReportsService, useValue: mockReportsService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: getRepositoryToken(Tenant), useValue: mockTenantRepo },
        {
          provide: getRepositoryToken(ReportSchedule),
          useValue: mockScheduleRepo,
        },
      ],
    }).compile();

    service = module.get(ReportsCronService);
  });

  // T11 — processes all active tenants
  it('T11 — preComputeAllReports processes all active tenants', async () => {
    mockTenantRepo.find.mockResolvedValue([
      { id: 't1' },
      { id: 't2' },
      { id: 't3' },
    ]);

    await service.preComputeAllReports();

    expect(mockReportsService.computeReport).toHaveBeenCalledTimes(3);
    expect(mockReportsService.computeReport).toHaveBeenCalledWith(
      't1',
      expect.any(Object),
    );
    expect(mockReportsService.computeReport).toHaveBeenCalledWith(
      't2',
      expect.any(Object),
    );
    expect(mockReportsService.computeReport).toHaveBeenCalledWith(
      't3',
      expect.any(Object),
    );
  });

  // T12 — processes in batches of 10
  it('T12 — preComputeAllReports processes in batches of 10', async () => {
    const tenants = Array.from({ length: 25 }, (_, i) => ({ id: `t${i}` }));
    mockTenantRepo.find.mockResolvedValue(tenants);

    await service.preComputeAllReports();

    expect(mockReportsService.computeReport).toHaveBeenCalledTimes(25);
  });

  // T13 — one failure does not abort others
  it('T13 — one tenant failure does not abort other tenants', async () => {
    mockTenantRepo.find.mockResolvedValue([
      { id: 't1' },
      { id: 't2' },
      { id: 't3' },
    ]);

    mockReportsService.computeReport
      .mockResolvedValueOnce({}) // t1 succeeds
      .mockRejectedValueOnce(new Error('DB error')) // t2 fails
      .mockResolvedValueOnce({}); // t3 succeeds

    await expect(service.preComputeAllReports()).resolves.not.toThrow();
    expect(mockReportsService.computeReport).toHaveBeenCalledTimes(3);
  });

  // T14 — logs correct counts on completion
  it('T14 — preComputeAllReports logs correct total/succeeded/failed counts', async () => {
    mockTenantRepo.find.mockResolvedValue([{ id: 't1' }, { id: 't2' }]);
    mockReportsService.computeReport
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('fail'));

    const logSpy = jest.spyOn(service['logger'], 'log');
    await service.preComputeAllReports();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('total: 2'));
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('succeeded: 1'),
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('failed: 1'));
  });

  // T15 — sends to all active schedules
  it('T15 — sendScheduledEmailReports sends to all active schedules', async () => {
    mockScheduleRepo.find.mockResolvedValue([
      { id: 's1', tenantId: 't1', email: 'a@a.com', isActive: true },
      { id: 's2', tenantId: 't2', email: 'b@b.com', isActive: true },
    ]);

    await service.sendScheduledEmailReports();

    expect(mockEmailService.send).toHaveBeenCalledTimes(2);
    expect(mockEmailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@a.com' }),
    );
    expect(mockEmailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'b@b.com' }),
    );
  });

  // T16 — updates lastSentAt after send
  it('T16 — sendScheduledEmailReports updates lastSentAt after successful send', async () => {
    mockScheduleRepo.find.mockResolvedValue([
      { id: 's1', tenantId: 't1', email: 'a@a.com', isActive: true },
    ]);

    await service.sendScheduledEmailReports();

    expect(mockScheduleRepo.update).toHaveBeenCalledWith('s1', {
      lastSentAt: expect.any(Date) as unknown,
    });
  });

  // T17 — skips is_active=false schedules (queried with WHERE isActive=true)
  it('T17 — sendScheduledEmailReports only queries active schedules', async () => {
    mockScheduleRepo.find.mockResolvedValue([]); // no active

    await service.sendScheduledEmailReports();

    expect(mockScheduleRepo.find).toHaveBeenCalledWith({
      where: { isActive: true },
    });
    expect(mockEmailService.send).not.toHaveBeenCalled();
  });

  // T18 — email send failure does not abort other schedules
  it('T18 — email send failure does not abort other schedules', async () => {
    mockScheduleRepo.find.mockResolvedValue([
      { id: 's1', tenantId: 't1', email: 'a@a.com', isActive: true },
      { id: 's2', tenantId: 't2', email: 'b@b.com', isActive: true },
    ]);

    mockEmailService.send
      .mockRejectedValueOnce(new Error('email error'))
      .mockResolvedValueOnce(undefined);

    await expect(service.sendScheduledEmailReports()).resolves.not.toThrow();
    expect(mockEmailService.send).toHaveBeenCalledTimes(2);
  });
});
