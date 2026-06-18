import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TemplateRequestsService } from '../../src/modules/template-requests/template-requests.service';
import { TemplateRequest } from '../../src/modules/template-requests/entities/template-request.entity';
import { MailerService } from '../../src/common/mailer/mailer.service';

const TENANT_ID = 'tenant-1';

function makeRequest(overrides: Partial<TemplateRequest> = {}): TemplateRequest {
  return {
    id: 'req-1',
    tenantId: TENANT_ID,
    name: 'Birthday Promo',
    useCase: 'Send personalised birthday offer to customers',
    createdAt: new Date('2026-01-01'),
    ...overrides,
  } as TemplateRequest;
}

const mockRepo = {
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
};

const mockMailer = {
  sendTemplateRequestNotification: jest.fn().mockResolvedValue(undefined),
};

async function buildService() {
  const mod = await Test.createTestingModule({
    providers: [
      TemplateRequestsService,
      { provide: getRepositoryToken(TemplateRequest), useValue: mockRepo },
      { provide: MailerService, useValue: mockMailer },
    ],
  }).compile();
  return mod.get(TemplateRequestsService);
}

beforeEach(() => jest.clearAllMocks());

describe('TemplateRequestsService', () => {
  describe('create', () => {
    it('saves and returns the new template request', async () => {
      const req = makeRequest();
      mockRepo.create.mockReturnValue(req);
      mockRepo.save.mockResolvedValue(req);
      const svc = await buildService();
      const result = await svc.create(TENANT_ID, 'My Store', {
        name: 'Birthday Promo',
        useCase: 'Send personalised birthday offer to customers',
      });
      expect(result).toEqual(req);
      expect(mockRepo.save).toHaveBeenCalled();
    });

    it('fires notification email without awaiting (does not throw if mailer fails)', async () => {
      const req = makeRequest();
      mockRepo.create.mockReturnValue(req);
      mockRepo.save.mockResolvedValue(req);
      mockMailer.sendTemplateRequestNotification.mockRejectedValueOnce(new Error('email down'));
      const svc = await buildService();
      await expect(
        svc.create(TENANT_ID, 'My Store', { name: 'Birthday Promo', useCase: 'test' }),
      ).resolves.toEqual(req);
    });
  });

  describe('findAll', () => {
    it('returns all template requests for the tenant', async () => {
      const req = makeRequest();
      mockRepo.find.mockResolvedValue([req]);
      const svc = await buildService();
      const result = await svc.findAll(TENANT_ID);
      expect(result).toEqual([req]);
      expect(mockRepo.find).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID },
        order: { createdAt: 'DESC' },
      });
    });

    it('returns empty array when no requests exist', async () => {
      mockRepo.find.mockResolvedValue([]);
      const svc = await buildService();
      const result = await svc.findAll(TENANT_ID);
      expect(result).toEqual([]);
    });
  });
});
