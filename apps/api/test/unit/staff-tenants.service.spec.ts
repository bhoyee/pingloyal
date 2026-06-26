import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PlanTier, SubscriptionStatus } from '@pingloyal/types';
import { StaffTenantsService } from '../../src/modules/tenants/staff-tenants.service';
import { Tenant } from '../../src/modules/tenants/entities/tenant.entity';
import { User } from '../../src/modules/auth/entities/user.entity';
import { Subscription } from '../../src/modules/billing/entities/subscription.entity';
import { WaTriggerTemplate } from '../../src/modules/triggers/entities/wa-trigger-template.entity';
import { SupportTicket } from '../../src/modules/support/entities/support-ticket.entity';
import { TemplateRequest } from '../../src/modules/template-requests/entities/template-request.entity';
import { AuthService } from '../../src/modules/auth/auth.service';
import { MailerService } from '../../src/common/mailer/mailer.service';
import { Country } from '../../src/modules/signup/dto/signup-register.dto';

describe('StaffTenantsService', () => {
  let service: StaffTenantsService;
  let mockTenantRepo: { findOne: jest.Mock; update: jest.Mock; createQueryBuilder: jest.Mock; findOneOrFail: jest.Mock };
  let mockUserRepo: { findOne: jest.Mock; find: jest.Mock; update: jest.Mock };
  let mockSubscriptionRepo: { findOne: jest.Mock };
  let mockWaTriggerTemplateRepo: { find: jest.Mock };
  let mockSupportTicketRepo: { find: jest.Mock };
  let mockTemplateRequestRepo: { find: jest.Mock };
  let mockManager: { create: jest.Mock; save: jest.Mock };
  let mockDataSource: { transaction: jest.Mock };
  let mockAuthService: { buildUniqueSlug: jest.Mock };
  let mockMailer: { sendStaffCreatedAccountWelcome: jest.Mock };
  let mockConfig: { get: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockTenantRepo = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn(),
      findOneOrFail: jest.fn(),
    };
    mockUserRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue(undefined),
    };
    mockSubscriptionRepo = { findOne: jest.fn().mockResolvedValue(null) };
    mockWaTriggerTemplateRepo = { find: jest.fn().mockResolvedValue([]) };
    mockSupportTicketRepo = { find: jest.fn().mockResolvedValue([]) };
    mockTemplateRequestRepo = { find: jest.fn().mockResolvedValue([]) };
    mockManager = {
      create: jest.fn().mockImplementation((_entity: unknown, data: unknown) => data),
      save: jest
        .fn()
        .mockImplementation((_entity: unknown, data: unknown) =>
          Promise.resolve(
            Array.isArray(data) ? data : { id: 'new-id', ...(data as Record<string, unknown>) },
          ),
        ),
    };
    mockDataSource = {
      transaction: jest
        .fn()
        .mockImplementation((cb: (manager: typeof mockManager) => unknown) =>
          Promise.resolve(cb(mockManager)),
        ),
    };
    mockAuthService = { buildUniqueSlug: jest.fn().mockResolvedValue('freshmart') };
    mockMailer = { sendStaffCreatedAccountWelcome: jest.fn().mockResolvedValue(undefined) };
    mockConfig = { get: jest.fn().mockReturnValue('test') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaffTenantsService,
        { provide: getRepositoryToken(Tenant), useValue: mockTenantRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(Subscription), useValue: mockSubscriptionRepo },
        { provide: getRepositoryToken(WaTriggerTemplate), useValue: mockWaTriggerTemplateRepo },
        { provide: getRepositoryToken(SupportTicket), useValue: mockSupportTicketRepo },
        { provide: getRepositoryToken(TemplateRequest), useValue: mockTemplateRequestRepo },
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: AuthService, useValue: mockAuthService },
        { provide: MailerService, useValue: mockMailer },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get(StaffTenantsService);
  });

  describe('create', () => {
    const dto = {
      businessName: 'FreshMart',
      country: Country.NG,
      planTier: PlanTier.STARTER,
      ownerEmail: 'Owner@FreshMart.ng',
      ownerFullName: 'Adebayo Okafor',
    };

    it('creates tenant + owner user + subscription in one transaction', async () => {
      const result = await service.create(dto);

      expect(mockDataSource.transaction).toHaveBeenCalled();
      expect(mockManager.save).toHaveBeenCalledWith(
        Tenant,
        expect.objectContaining({ businessName: 'FreshMart', planTier: PlanTier.STARTER }),
      );
      expect(mockManager.save).toHaveBeenCalledWith(
        User,
        expect.objectContaining({ email: 'owner@freshmart.ng', role: 'owner', isActive: true }),
      );
      expect(mockManager.save).toHaveBeenCalledWith(
        Subscription,
        expect.objectContaining({ status: SubscriptionStatus.ACTIVE }),
      );
      expect(mockMailer.sendStaffCreatedAccountWelcome).toHaveBeenCalled();
      expect(result.tenantId).toBe('new-id');
    });

    it('rejects when the owner email already has an account', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 'existing-user' });

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('softDelete / restore', () => {
    it('softDelete sets deletedAt/deletedByStaffId/deletionReason', async () => {
      mockTenantRepo.findOne.mockResolvedValue({ id: 'tenant-1', deletedAt: null });

      await service.softDelete('tenant-1', 'staff-1', 'Fraudulent account');

      expect(mockTenantRepo.update).toHaveBeenCalledWith('tenant-1', {
        deletedAt: expect.any(Date),
        deletedByStaffId: 'staff-1',
        deletionReason: 'Fraudulent account',
      });
    });

    it('softDelete throws BadRequestException if already deleted', async () => {
      mockTenantRepo.findOne.mockResolvedValue({ id: 'tenant-1', deletedAt: new Date() });

      await expect(service.softDelete('tenant-1', 'staff-1', undefined)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('softDelete throws NotFoundException when tenant does not exist', async () => {
      mockTenantRepo.findOne.mockResolvedValue(null);

      await expect(service.softDelete('missing', 'staff-1', undefined)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('restore clears deletedAt/deletedByStaffId/deletionReason', async () => {
      mockTenantRepo.findOne.mockResolvedValue({ id: 'tenant-1', deletedAt: new Date() });

      await service.restore('tenant-1');

      expect(mockTenantRepo.update).toHaveBeenCalledWith('tenant-1', {
        deletedAt: null,
        deletedByStaffId: null,
        deletionReason: null,
      });
    });

    it('restore throws BadRequestException if not deleted', async () => {
      mockTenantRepo.findOne.mockResolvedValue({ id: 'tenant-1', deletedAt: null });

      await expect(service.restore('tenant-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('setUserActive', () => {
    it('toggles isActive for a user scoped to the tenant', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 'user-1', tenantId: 'tenant-1' });

      const result = await service.setUserActive('tenant-1', 'user-1', false);

      expect(mockUserRepo.update).toHaveBeenCalledWith('user-1', { isActive: false });
      expect(result).toEqual({ id: 'user-1', isActive: false });
    });

    it('throws NotFoundException when the user does not belong to the tenant', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      await expect(service.setUserActive('tenant-1', 'user-1', false)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
