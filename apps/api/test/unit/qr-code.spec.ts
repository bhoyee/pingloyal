import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { REDIS_CLIENT } from '../../src/common/redis/redis.constants';
import { Tenant } from '../../src/modules/tenants/entities/tenant.entity';
import { ProductCategory } from '../../src/modules/tenants/entities/product-category.entity';
import { TierConfig } from '../../src/modules/tenants/entities/tier-config.entity';
import { User } from '../../src/modules/auth/entities/user.entity';
import { R2Service } from '../../src/modules/storage/r2.service';
import { TenantsService } from '../../src/modules/tenants/tenants.service';

jest.mock('qrcode', () => ({
  toBuffer: jest.fn().mockResolvedValue(Buffer.from('fake-qr-png')),
}));

import * as QRCode from 'qrcode';

const mockTenantRepo = { findOne: jest.fn(), update: jest.fn() };
const mockCategoryRepo = { find: jest.fn() };
const mockTierRepo = { find: jest.fn() };
const mockUserRepo = { findOne: jest.fn() };
const mockDataSource = { transaction: jest.fn() };
const mockRedis = {
  get: jest.fn().mockResolvedValue(null),
  setex: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
};
const mockR2 = {
  uploadFile: jest
    .fn()
    .mockResolvedValue('https://cdn.example.com/qr-codes/t1/123.png'),
  deleteFile: jest.fn().mockResolvedValue(undefined),
};
const mockConfig = {
  getOrThrow: jest.fn((key: string) => {
    if (key === 'FRONTEND_URL') return 'https://app.pingloyal.com';
    return '';
  }),
};

describe('TenantsService – QR code', () => {
  let service: TenantsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsService,
        { provide: getRepositoryToken(Tenant), useValue: mockTenantRepo },
        {
          provide: getRepositoryToken(ProductCategory),
          useValue: mockCategoryRepo,
        },
        { provide: getRepositoryToken(TierConfig), useValue: mockTierRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: REDIS_CLIENT, useValue: mockRedis },
        { provide: R2Service, useValue: mockR2 },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get(TenantsService);
    jest.clearAllMocks();
    mockR2.uploadFile.mockResolvedValue(
      'https://cdn.example.com/qr-codes/t1/123.png',
    );
    (QRCode.toBuffer as jest.Mock).mockResolvedValue(
      Buffer.from('fake-qr-png'),
    );
  });

  const tenant = {
    id: 'tenant-1',
    slug: 'my-store',
    qrCodeUrl: null,
  };

  // ── 22. returns existing URL without regenerating when force=false ────────────
  it('returns existing qrCodeUrl without regenerating when force=false', async () => {
    mockTenantRepo.findOne.mockResolvedValue({
      ...tenant,
      qrCodeUrl: 'https://cdn.example.com/qr-codes/tenant-1/old.png',
    });

    const result = await service.getOrGenerateQrCode('tenant-1', false);

    expect(result.qrCodeUrl).toBe(
      'https://cdn.example.com/qr-codes/tenant-1/old.png',
    );
    expect(QRCode.toBuffer).not.toHaveBeenCalled();
    expect(mockR2.uploadFile).not.toHaveBeenCalled();
  });

  // ── 23. generates QR when no existing URL ────────────────────────────────────
  it('generates and uploads QR when no existing URL', async () => {
    mockTenantRepo.findOne.mockResolvedValue({ ...tenant, qrCodeUrl: null });
    mockRedis.del.mockResolvedValue(1);

    const result = await service.getOrGenerateQrCode('tenant-1', false);

    expect(QRCode.toBuffer).toHaveBeenCalledWith(
      'https://app.pingloyal.com/register/my-store',
      expect.objectContaining({ type: 'png', width: 400 }),
    );
    expect(mockR2.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'image/png' }),
    );
    expect(result.qrCodeUrl).toContain('https://');
    expect(result.registrationUrl).toBe(
      'https://app.pingloyal.com/register/my-store',
    );
  });

  // ── 24. force=true deletes old file and regenerates ──────────────────────────
  it('force=true deletes old R2 file and regenerates', async () => {
    mockTenantRepo.findOne.mockResolvedValue({
      ...tenant,
      qrCodeUrl:
        'https://test-bucket.test-account.r2.cloudflarestorage.com/qr-codes/tenant-1/old.png',
    });
    mockRedis.del.mockResolvedValue(1);

    await service.getOrGenerateQrCode('tenant-1', true);

    expect(mockR2.deleteFile).toHaveBeenCalledWith('qr-codes/tenant-1/old.png');
    expect(QRCode.toBuffer).toHaveBeenCalled();
    expect(mockR2.uploadFile).toHaveBeenCalled();
  });

  // ── 25. throws NotFoundException when tenant not found ───────────────────────
  it('throws NotFoundException when tenant does not exist', async () => {
    mockTenantRepo.findOne.mockResolvedValue(null);

    await expect(service.getOrGenerateQrCode('ghost-tenant')).rejects.toThrow(
      NotFoundException,
    );
  });

  // ── 26. updates tenant.qrCodeUrl after upload ────────────────────────────────
  it('updates tenant.qrCodeUrl after upload', async () => {
    mockTenantRepo.findOne.mockResolvedValue({ ...tenant, qrCodeUrl: null });
    mockRedis.del.mockResolvedValue(1);

    await service.getOrGenerateQrCode('tenant-1', false);

    expect(mockTenantRepo.update).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        qrCodeUrl: expect.stringContaining('https://') as string,
      }),
    );
  });
});
