import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { R2Service } from '../../src/modules/storage/r2.service';

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  PutObjectCommand: jest
    .fn()
    .mockImplementation((input: unknown) => ({ input })),
  DeleteObjectCommand: jest
    .fn()
    .mockImplementation((input: unknown) => ({ input })),
}));

import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const mockConfig = {
  getOrThrow: jest.fn((key: string) => {
    const cfg: Record<string, string> = {
      R2_ACCOUNT_ID: 'test-account',
      R2_BUCKET: 'test-bucket',
      R2_ACCESS_KEY: 'access-key',
      R2_SECRET_KEY: 'secret-key',
    };
    return cfg[key] ?? '';
  }),
};

describe('R2Service', () => {
  let service: R2Service;

  // Use beforeAll so the S3Client constructor call is not wiped by clearAllMocks
  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [R2Service, { provide: ConfigService, useValue: mockConfig }],
    }).compile();
    service = module.get(R2Service);
  });

  beforeEach(() => {
    mockSend.mockReset();
    mockSend.mockResolvedValue({});
    (PutObjectCommand as unknown as jest.Mock).mockClear();
    (DeleteObjectCommand as unknown as jest.Mock).mockClear();
  });

  // ── 18. uploadFile sends PutObjectCommand and returns CDN URL ────────────────
  it('uploadFile sends PutObjectCommand and returns CDN URL', async () => {
    const url = await service.uploadFile({
      key: 'qr-codes/tenant-1/123.png',
      buffer: Buffer.from('png-data'),
      contentType: 'image/png',
      cacheControl: 'public, max-age=31536000',
    });

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(PutObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'test-bucket',
        Key: 'qr-codes/tenant-1/123.png',
        ContentType: 'image/png',
      }),
    );
    expect(url).toBe(
      'https://test-bucket.test-account.r2.cloudflarestorage.com/qr-codes/tenant-1/123.png',
    );
  });

  // ── 19. uploadFile CDN URL uses correct bucket + accountId format ────────────
  it('uploadFile CDN URL format is bucket.accountId.r2.cloudflarestorage.com/key', async () => {
    const url = await service.uploadFile({
      key: 'logos/tenant-2/logo.png',
      buffer: Buffer.from('img'),
      contentType: 'image/png',
    });

    expect(url).toMatch(
      /^https:\/\/test-bucket\.test-account\.r2\.cloudflarestorage\.com\//,
    );
    expect(url).toContain('logos/tenant-2/logo.png');
  });

  // ── 20. deleteFile sends DeleteObjectCommand with correct key ────────────────
  it('deleteFile sends DeleteObjectCommand with correct key', async () => {
    await service.deleteFile('qr-codes/tenant-1/old.png');

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(DeleteObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'test-bucket',
        Key: 'qr-codes/tenant-1/old.png',
      }),
    );
  });

  // ── 21. S3Client is constructed with R2 endpoint and forcePathStyle ──────────
  it('S3Client is constructed with R2 endpoint and forcePathStyle', () => {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
    const { S3Client } = jest.requireMock('@aws-sdk/client-s3');
    const callArgs = S3Client.mock.calls[0];
    expect(callArgs[0]).toMatchObject({
      endpoint: 'https://test-account.r2.cloudflarestorage.com',
      region: 'auto',
      forcePathStyle: true,
    });
    /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
  });
});
