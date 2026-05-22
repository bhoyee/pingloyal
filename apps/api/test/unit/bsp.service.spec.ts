import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import {
  BspService,
  SendMessageParams,
} from '../../src/modules/whatsapp/bsp.service';
import { WaBspException } from '../../src/modules/whatsapp/exceptions/wa-bsp.exception';

jest.mock('@pingloyal/utils', () => ({
  decrypt: jest.fn().mockReturnValue('decrypted-plain-api-key'),
  encrypt: jest.fn(),
}));

import { decrypt } from '@pingloyal/utils';

const mockConfig = {
  getOrThrow: jest.fn().mockReturnValue('https://api.gupshup.io/sm/api/v1'),
};

const mockFetch = jest.fn();

const baseParams: SendMessageParams = {
  customerPhone: '+2348012345678',
  templateName: 'welcome_loyalty',
  templateParams: ['John', '500'],
  tenantGupshupApiKey: 'encrypted:key:value',
  tenantAppId: 'my-app-id',
  tenantPhoneNumber: '+2348099999999',
};

describe('BspService', () => {
  let service: BspService;
  let logSpy: jest.SpyInstance;

  beforeAll(() => {
    global.fetch = mockFetch;
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BspService, { provide: ConfigService, useValue: mockConfig }],
    }).compile();

    service = module.get(BspService);
    logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    jest.clearAllMocks();
    // Re-apply default mock after clearAllMocks
    (decrypt as jest.Mock).mockReturnValue('decrypted-plain-api-key');
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  const successResponse = { status: 'submitted', messageId: 'msg-abc-123' };

  // ── 12. decrypts apiKey before making HTTP call ──────────────────────────────
  it('sendMessage decrypts apiKey before making HTTP call', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      json: () => Promise.resolve(successResponse),
    });

    await service.sendMessage(baseParams);

    expect(decrypt).toHaveBeenCalledWith('encrypted:key:value');
    // The Authorization/apikey header in fetch call must use decrypted key
    const fetchHeaders = (
      mockFetch.mock.calls[0] as [string, { headers: Record<string, string> }]
    )[1].headers;
    expect(fetchHeaders.apikey).toBe('decrypted-plain-api-key');
  });

  // ── 13. uses URLSearchParams format (not JSON body) ──────────────────────────
  it('sendMessage uses URLSearchParams format (not JSON body)', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      json: () => Promise.resolve(successResponse),
    });

    await service.sendMessage(baseParams);

    const [, fetchOpts] = mockFetch.mock.calls[0] as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(fetchOpts.headers['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    );
    // Body is a URL-encoded string, not JSON
    expect(fetchOpts.body).not.toMatch(/^\{/);
    expect(fetchOpts.body).toContain('channel=whatsapp');
  });

  // ── 14. logs with masked phone number (not full E.164) ───────────────────────
  it('sendMessage logs with masked phone number (not full E.164)', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      json: () => Promise.resolve(successResponse),
    });
    logSpy = jest.spyOn(Logger.prototype, 'log');

    await service.sendMessage(baseParams);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const logMsg = logSpy.mock.calls[0]?.[0] as string;
    expect(logMsg).toBeDefined();
    expect(logMsg).toContain('****'); // masked
    expect(logMsg).not.toContain('+2348012345678'); // full phone not in log
  });

  // ── 15. throws WaBspException on Gupshup 401 ────────────────────────────────
  it('sendMessage throws WaBspException on Gupshup 401', async () => {
    mockFetch.mockResolvedValue({
      status: 401,
      json: () => Promise.resolve({}),
    });

    await expect(service.sendMessage(baseParams)).rejects.toThrow(
      WaBspException,
    );
    await expect(service.sendMessage(baseParams)).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  // ── 16. throws WaBspException on Gupshup 429 (for BullMQ retry) ─────────────
  it('sendMessage throws WaBspException on Gupshup 429 (for retry)', async () => {
    mockFetch.mockResolvedValue({
      status: 429,
      json: () => Promise.resolve({}),
    });

    await expect(service.sendMessage(baseParams)).rejects.toThrow(
      WaBspException,
    );
    await expect(service.sendMessage(baseParams)).rejects.toMatchObject({
      statusCode: 429,
    });
  });

  // ── 17. never logs the decrypted API key ─────────────────────────────────────
  it('sendMessage never logs the decrypted API key', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      json: () => Promise.resolve(successResponse),
    });
    const allLogCalls: string[] = [];
    logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation((msg: unknown) => {
        allLogCalls.push(String(msg));
      });

    await service.sendMessage(baseParams);

    const combined = allLogCalls.join(' ');
    expect(combined).not.toContain('decrypted-plain-api-key');
    expect(combined).not.toContain('encrypted:key:value');
  });
});
