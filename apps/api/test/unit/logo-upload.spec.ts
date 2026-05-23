import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { REDIS_CLIENT } from '../../src/common/redis/redis.constants';
import { Tenant } from '../../src/modules/tenants/entities/tenant.entity';
import { ProductCategory } from '../../src/modules/tenants/entities/product-category.entity';
import { TierConfig } from '../../src/modules/tenants/entities/tier-config.entity';
import { R2Service } from '../../src/modules/storage/r2.service';
import { TenantsService } from '../../src/modules/tenants/tenants.service';

// jest.mock is hoisted — factory must not reference outer const/let variables
jest.mock('sharp', () => jest.fn());

import sharp from 'sharp';

const mockTenantRepo = { findOne: jest.fn(), update: jest.fn() };
const mockCategoryRepo = { find: jest.fn() };
const mockTierRepo = { find: jest.fn() };
const mockDataSource = { transaction: jest.fn() };
const mockRedis = {
  get: jest.fn().mockResolvedValue(null),
  setex: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
};
const mockR2 = {
  uploadFile: jest
    .fn()
    .mockResolvedValue('https://cdn.example.com/logos/t1/logo.png'),
  deleteFile: jest.fn().mockResolvedValue(undefined),
};
const mockConfig = {
  getOrThrow: jest.fn().mockReturnValue('https://app.pingloyal.com'),
};

describe('TenantsService – logo upload', () => {
  let service: TenantsService;
  let mockSharpInstance: {
    resize: jest.Mock;
    png: jest.Mock;
    toBuffer: jest.Mock;
  };

  beforeEach(async () => {
    mockSharpInstance = {
      resize: jest.fn().mockReturnThis(),
      png: jest.fn().mockReturnThis(),
      toBuffer: jest.fn().mockResolvedValue(Buffer.from('processed-png')),
    };
    (sharp as unknown as jest.Mock).mockReturnValue(mockSharpInstance);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsService,
        { provide: getRepositoryToken(Tenant), useValue: mockTenantRepo },
        {
          provide: getRepositoryToken(ProductCategory),
          useValue: mockCategoryRepo,
        },
        { provide: getRepositoryToken(TierConfig), useValue: mockTierRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: REDIS_CLIENT, useValue: mockRedis },
        { provide: R2Service, useValue: mockR2 },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get(TenantsService);
    jest.clearAllMocks();

    // Re-apply after clearAllMocks
    mockSharpInstance.resize.mockReturnThis();
    mockSharpInstance.png.mockReturnThis();
    mockSharpInstance.toBuffer.mockResolvedValue(Buffer.from('processed-png'));
    (sharp as unknown as jest.Mock).mockReturnValue(mockSharpInstance);
    mockR2.uploadFile.mockResolvedValue(
      'https://cdn.example.com/logos/t1/logo.png',
    );
    mockRedis.del.mockResolvedValue(1);
  });

  const makeFile = (
    overrides: Partial<{ mimetype: string; size: number; buffer: Buffer }> = {},
  ) => ({
    mimetype: 'image/png',
    size: 512 * 1024,
    buffer: Buffer.from('fake-image'),
    ...overrides,
  });

  // ── 27. throws BadRequestException for unsupported MIME type ─────────────────
  it('throws BadRequestException for unsupported MIME type', async () => {
    await expect(
      service.uploadLogo('tenant-1', makeFile({ mimetype: 'image/gif' })),
    ).rejects.toThrow(BadRequestException);
  });

  // ── 28. throws PayloadTooLargeException when file exceeds 2 MB ───────────────
  it('throws PayloadTooLargeException when file exceeds 2 MB', async () => {
    await expect(
      service.uploadLogo('tenant-1', makeFile({ size: 3 * 1024 * 1024 })),
    ).rejects.toThrow(PayloadTooLargeException);
  });

  // ── 29. processes image with sharp (resize 400×400, png quality 90) ──────────
  it('processes image with sharp resize and png options', async () => {
    await service.uploadLogo('tenant-1', makeFile());

    expect(sharp).toHaveBeenCalledWith(expect.any(Buffer));
    expect(mockSharpInstance.resize).toHaveBeenCalledWith(400, 400, {
      fit: 'inside',
      withoutEnlargement: true,
    });
    expect(mockSharpInstance.png).toHaveBeenCalledWith({ quality: 90 });
  });

  // ── 30. uploads to R2 key logos/{tenantId}/logo.png ──────────────────────────
  it('uploads to R2 at key logos/{tenantId}/logo.png', async () => {
    await service.uploadLogo('tenant-1', makeFile());

    expect(mockR2.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'logos/tenant-1/logo.png',
        contentType: 'image/png',
      }),
    );
  });

  // ── 31. updates tenant.logoUrl and returns it ─────────────────────────────────
  it('updates tenant.logoUrl and returns logoUrl in response', async () => {
    const result = await service.uploadLogo('tenant-1', makeFile());

    expect(mockTenantRepo.update).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        logoUrl: 'https://cdn.example.com/logos/t1/logo.png',
      }),
    );
    expect(result.logoUrl).toBe('https://cdn.example.com/logos/t1/logo.png');
  });
});
