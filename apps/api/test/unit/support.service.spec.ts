import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SupportService } from '../../src/modules/support/support.service';
import { SupportTicket } from '../../src/modules/support/entities/support-ticket.entity';
import { SupportTicketMessage } from '../../src/modules/support/entities/support-ticket-message.entity';
import { Tenant } from '../../src/modules/tenants/entities/tenant.entity';
import { User } from '../../src/modules/auth/entities/user.entity';
import { MailerService } from '../../src/common/mailer/mailer.service';
import { R2Service } from '../../src/modules/storage/r2.service';

const TENANT_ID = 'tenant-1';
const OTHER_TENANT_ID = 'tenant-2';
const USER_ID = 'user-1';
const TICKET_ID = 'ticket-1';

function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: TENANT_ID,
    businessName: 'FreshMart',
    ...overrides,
  } as Tenant;
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: USER_ID,
    fullName: 'Adebayo Okafor',
    email: 'adebayo@freshmart.ng',
    ...overrides,
  } as User;
}

function makeTicket(overrides: Partial<SupportTicket> = {}): SupportTicket {
  return {
    id: TICKET_ID,
    tenantId: TENANT_ID,
    businessName: 'FreshMart',
    openedByName: 'Adebayo Okafor',
    openedByEmail: 'adebayo@freshmart.ng',
    subject: 'Cannot send campaign',
    status: 'open',
    priority: 'low',
    lastMessageAt: new Date('2026-01-01'),
    lastMessageAuthorType: 'tenant',
    tenantLastReadAt: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

const mockTicketRepo = {
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn().mockResolvedValue(undefined),
  createQueryBuilder: jest.fn(),
};

const mockMessageRepo = {
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
};

const mockTenantRepo = { findOne: jest.fn() };
const mockUserRepo = { findOne: jest.fn() };

const mockMailer = {
  sendNewTicketNotification: jest.fn().mockResolvedValue(undefined),
  sendTicketReplyNotification: jest.fn().mockResolvedValue(undefined),
  getSupportEmail: jest.fn().mockReturnValue('support@pingloyal.com'),
};

const mockR2 = {
  uploadFile: jest
    .fn()
    .mockResolvedValue('https://cdn.example.com/support-attachments/x.png'),
};

async function buildService() {
  const mod = await Test.createTestingModule({
    providers: [
      SupportService,
      { provide: getRepositoryToken(SupportTicket), useValue: mockTicketRepo },
      {
        provide: getRepositoryToken(SupportTicketMessage),
        useValue: mockMessageRepo,
      },
      { provide: getRepositoryToken(Tenant), useValue: mockTenantRepo },
      { provide: getRepositoryToken(User), useValue: mockUserRepo },
      { provide: MailerService, useValue: mockMailer },
      { provide: R2Service, useValue: mockR2 },
    ],
  }).compile();
  return mod.get(SupportService);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTicketRepo.create.mockImplementation((data: unknown) => data);
  mockMessageRepo.create.mockImplementation((data: unknown) => data);
});

describe('SupportService', () => {
  describe('createTicket', () => {
    it('denormalizes tenant/user fields onto the ticket and first message, storing the chosen priority', async () => {
      mockTenantRepo.findOne.mockResolvedValue(makeTenant());
      mockUserRepo.findOne.mockResolvedValue(makeUser());
      const savedTicket = makeTicket({ priority: 'high' });
      mockTicketRepo.save.mockResolvedValue(savedTicket);
      mockMessageRepo.save.mockResolvedValue({});

      const svc = await buildService();
      const result = await svc.createTicket(TENANT_ID, USER_ID, {
        subject: 'Cannot send campaign',
        message: '<p>My campaign send button is greyed out</p>',
        priority: 'high',
      });

      expect(result).toEqual(savedTicket);
      expect(mockTicketRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          businessName: 'FreshMart',
          openedByName: 'Adebayo Okafor',
          openedByEmail: 'adebayo@freshmart.ng',
          subject: 'Cannot send campaign',
          status: 'open',
          priority: 'high',
          lastMessageAuthorType: 'tenant',
        }),
      );
      expect(mockMessageRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ticketId: savedTicket.id,
          authorType: 'tenant',
          authorName: 'Adebayo Okafor',
          body: '<p>My campaign send button is greyed out</p>',
        }),
      );
      expect(mockMailer.sendNewTicketNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          ticketId: savedTicket.id,
          businessName: 'FreshMart',
          message: 'My campaign send button is greyed out',
        }),
      );
    });

    it('strips disallowed tags/attributes from the message body before storing', async () => {
      mockTenantRepo.findOne.mockResolvedValue(makeTenant());
      mockUserRepo.findOne.mockResolvedValue(makeUser());
      mockTicketRepo.save.mockResolvedValue(makeTicket());
      mockMessageRepo.save.mockResolvedValue({});

      const svc = await buildService();
      await svc.createTicket(TENANT_ID, USER_ID, {
        subject: 'XSS attempt',
        message:
          '<p>Hello <script>alert(1)</script> <img src=x onerror=alert(1)> world</p>',
        priority: 'low',
      });

      const createMock = mockMessageRepo.create as jest.Mock<
        unknown,
        [{ body: string }]
      >;
      const created = createMock.mock.calls[0][0];
      expect(created.body).not.toContain('<script');
      expect(created.body).not.toContain('<img');
      expect(created.body).not.toContain('onerror');
      expect(created.body).toContain('Hello');
      expect(created.body).toContain('world');
    });

    it('rejects a message that is empty once HTML markup is stripped', async () => {
      mockTenantRepo.findOne.mockResolvedValue(makeTenant());
      mockUserRepo.findOne.mockResolvedValue(makeUser());
      const svc = await buildService();
      await expect(
        svc.createTicket(TENANT_ID, USER_ID, {
          subject: 'x',
          message: '<p></p><p>  </p>',
          priority: 'low',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws if the tenant cannot be found', async () => {
      mockTenantRepo.findOne.mockResolvedValue(null);
      mockUserRepo.findOne.mockResolvedValue(makeUser());
      const svc = await buildService();
      await expect(
        svc.createTicket(TENANT_ID, USER_ID, {
          subject: 'x',
          message: 'message body here',
          priority: 'low',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws if the user cannot be found', async () => {
      mockTenantRepo.findOne.mockResolvedValue(makeTenant());
      mockUserRepo.findOne.mockResolvedValue(null);
      const svc = await buildService();
      await expect(
        svc.createTicket(TENANT_ID, USER_ID, {
          subject: 'x',
          message: 'message body here',
          priority: 'low',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('does not throw if the notification email fails (fire-and-forget)', async () => {
      mockTenantRepo.findOne.mockResolvedValue(makeTenant());
      mockUserRepo.findOne.mockResolvedValue(makeUser());
      mockTicketRepo.save.mockResolvedValue(makeTicket());
      mockMessageRepo.save.mockResolvedValue({});
      mockMailer.sendNewTicketNotification.mockRejectedValueOnce(
        new Error('email down'),
      );
      const svc = await buildService();
      await expect(
        svc.createTicket(TENANT_ID, USER_ID, {
          subject: 'x',
          message: 'message body here',
          priority: 'low',
        }),
      ).resolves.toBeDefined();
    });

    describe('with an attachment', () => {
      const file = {
        originalname: 'screenshot.png',
        mimetype: 'image/png',
        size: 1024,
        buffer: Buffer.from('fake-image-bytes'),
      };

      it('uploads to R2 and stores the attachment fields on the first message', async () => {
        mockTenantRepo.findOne.mockResolvedValue(makeTenant());
        mockUserRepo.findOne.mockResolvedValue(makeUser());
        mockTicketRepo.save.mockResolvedValue(makeTicket());
        mockMessageRepo.save.mockResolvedValue({});

        const svc = await buildService();
        await svc.createTicket(
          TENANT_ID,
          USER_ID,
          { subject: 'x', message: 'message body here', priority: 'low' },
          file,
        );

        expect(mockR2.uploadFile).toHaveBeenCalledWith(
          expect.objectContaining({
            key: expect.stringContaining(
              `support-attachments/${TENANT_ID}/`,
            ) as unknown,
            buffer: file.buffer,
            contentType: 'image/png',
          }),
        );
        expect(mockMessageRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            attachmentUrl: 'https://cdn.example.com/support-attachments/x.png',
            attachmentName: 'screenshot.png',
            attachmentMimeType: 'image/png',
            attachmentSize: 1024,
          }),
        );
      });

      it('rejects a disallowed file type without ever creating the ticket message', async () => {
        mockTenantRepo.findOne.mockResolvedValue(makeTenant());
        mockUserRepo.findOne.mockResolvedValue(makeUser());
        mockTicketRepo.save.mockResolvedValue(makeTicket());

        const svc = await buildService();
        await expect(
          svc.createTicket(
            TENANT_ID,
            USER_ID,
            { subject: 'x', message: 'message body here', priority: 'low' },
            { ...file, mimetype: 'application/zip' },
          ),
        ).rejects.toThrow(BadRequestException);
        expect(mockMessageRepo.save).not.toHaveBeenCalled();
      });

      it('rejects a file larger than 5 MB', async () => {
        mockTenantRepo.findOne.mockResolvedValue(makeTenant());
        mockUserRepo.findOne.mockResolvedValue(makeUser());
        mockTicketRepo.save.mockResolvedValue(makeTicket());

        const svc = await buildService();
        await expect(
          svc.createTicket(
            TENANT_ID,
            USER_ID,
            { subject: 'x', message: 'message body here', priority: 'low' },
            { ...file, size: 6 * 1024 * 1024 },
          ),
        ).rejects.toThrow('Attachment must be under 5 MB');
      });
    });
  });

  describe('getUnreadCountForTenant', () => {
    it('builds a query scoped to the tenant with the unread condition', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(3),
      };
      mockTicketRepo.createQueryBuilder.mockReturnValue(qb);

      const svc = await buildService();
      const result = await svc.getUnreadCountForTenant(TENANT_ID);

      expect(result).toBe(3);
      expect(qb.where).toHaveBeenCalledWith('t.tenant_id = :tenantId', {
        tenantId: TENANT_ID,
      });
      expect(qb.andWhere).toHaveBeenCalledWith(
        't.last_message_author_type = :authorType',
        { authorType: 'staff' },
      );
    });
  });

  describe('findAllForTenant', () => {
    it('scopes the query to the tenant, ordered by lastMessageAt desc', async () => {
      mockTicketRepo.find.mockResolvedValue([makeTicket()]);
      const svc = await buildService();
      await svc.findAllForTenant(TENANT_ID);
      expect(mockTicketRepo.find).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID },
        order: { lastMessageAt: 'DESC' },
      });
    });
  });

  describe('findOneForTenant', () => {
    it('returns the ticket + messages when it belongs to the tenant', async () => {
      mockTicketRepo.findOne.mockResolvedValue(makeTicket());
      mockMessageRepo.find.mockResolvedValue([{ id: 'msg-1' }]);
      const svc = await buildService();
      const result = await svc.findOneForTenant(TENANT_ID, TICKET_ID);
      expect(result.ticket.id).toBe(TICKET_ID);
      expect(result.messages).toEqual([{ id: 'msg-1' }]);
    });

    it('marks the ticket as read by the tenant on view', async () => {
      mockTicketRepo.findOne.mockResolvedValue(
        makeTicket({ lastMessageAuthorType: 'staff', tenantLastReadAt: null }),
      );
      mockMessageRepo.find.mockResolvedValue([]);
      const svc = await buildService();
      await svc.findOneForTenant(TENANT_ID, TICKET_ID);
      expect(mockTicketRepo.update).toHaveBeenCalledWith(TICKET_ID, {
        tenantLastReadAt: expect.any(Date) as unknown,
      });
    });

    it('404s when the ticket belongs to a different tenant', async () => {
      mockTicketRepo.findOne.mockResolvedValue(
        makeTicket({ tenantId: OTHER_TENANT_ID }),
      );
      const svc = await buildService();
      await expect(svc.findOneForTenant(TENANT_ID, TICKET_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('404s when the ticket does not exist', async () => {
      mockTicketRepo.findOne.mockResolvedValue(null);
      const svc = await buildService();
      await expect(svc.findOneForTenant(TENANT_ID, TICKET_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('reopenTicket', () => {
    it('sets a closed ticket back to open', async () => {
      mockTicketRepo.findOne.mockResolvedValue(
        makeTicket({ status: 'closed' }),
      );
      const svc = await buildService();
      const result = await svc.reopenTicket(TENANT_ID, TICKET_ID);
      expect(mockTicketRepo.update).toHaveBeenCalledWith(TICKET_ID, {
        status: 'open',
      });
      expect(result.status).toBe('open');
    });

    it("404s when reopening another tenant's ticket", async () => {
      mockTicketRepo.findOne.mockResolvedValue(
        makeTicket({ tenantId: OTHER_TENANT_ID, status: 'closed' }),
      );
      const svc = await buildService();
      await expect(svc.reopenTicket(TENANT_ID, TICKET_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('404s when the ticket does not exist', async () => {
      mockTicketRepo.findOne.mockResolvedValue(null);
      const svc = await buildService();
      await expect(svc.reopenTicket(TENANT_ID, TICKET_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('addTenantMessage', () => {
    it('appends a message, bumps lastMessageAt, marks read, and notifies the support inbox', async () => {
      mockTicketRepo.findOne.mockResolvedValue(makeTicket());
      mockUserRepo.findOne.mockResolvedValue(makeUser());
      mockMessageRepo.save.mockResolvedValue({ id: 'msg-2' });

      const svc = await buildService();
      await svc.addTenantMessage(TENANT_ID, USER_ID, TICKET_ID, {
        message: 'Still broken',
      });

      expect(mockTicketRepo.update).toHaveBeenCalledWith(
        TICKET_ID,
        expect.objectContaining({
          lastMessageAt: expect.any(Date) as unknown,
          lastMessageAuthorType: 'tenant',
          tenantLastReadAt: expect.any(Date) as unknown,
        }),
      );
      expect(mockMailer.sendTicketReplyNotification).toHaveBeenCalledWith(
        expect.objectContaining({ recipientEmail: 'support@pingloyal.com' }),
      );
    });

    it('reopens a resolved ticket when the tenant replies', async () => {
      mockTicketRepo.findOne.mockResolvedValue(
        makeTicket({ status: 'resolved' }),
      );
      mockUserRepo.findOne.mockResolvedValue(makeUser());
      mockMessageRepo.save.mockResolvedValue({ id: 'msg-3' });

      const svc = await buildService();
      await svc.addTenantMessage(TENANT_ID, USER_ID, TICKET_ID, {
        message: 'Still broken',
      });

      expect(mockTicketRepo.update).toHaveBeenCalledWith(
        TICKET_ID,
        expect.objectContaining({ status: 'open' }),
      );
    });

    it('rejects a reply that is empty once HTML markup is stripped', async () => {
      mockTicketRepo.findOne.mockResolvedValue(makeTicket());
      mockUserRepo.findOne.mockResolvedValue(makeUser());
      const svc = await buildService();
      await expect(
        svc.addTenantMessage(TENANT_ID, USER_ID, TICKET_ID, {
          message: '<p>&nbsp;</p>',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("404s when replying to another tenant's ticket", async () => {
      mockTicketRepo.findOne.mockResolvedValue(
        makeTicket({ tenantId: OTHER_TENANT_ID }),
      );
      const svc = await buildService();
      await expect(
        svc.addTenantMessage(TENANT_ID, USER_ID, TICKET_ID, {
          message: 'Still broken',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAllForStaff', () => {
    it('returns all tickets across tenants with no filter', async () => {
      mockTicketRepo.find.mockResolvedValue([makeTicket()]);
      const svc = await buildService();
      await svc.findAllForStaff();
      expect(mockTicketRepo.find).toHaveBeenCalledWith({
        where: {},
        order: { lastMessageAt: 'DESC' },
      });
    });

    it('filters by status when provided', async () => {
      mockTicketRepo.find.mockResolvedValue([]);
      const svc = await buildService();
      await svc.findAllForStaff('resolved');
      expect(mockTicketRepo.find).toHaveBeenCalledWith({
        where: { status: 'resolved' },
        order: { lastMessageAt: 'DESC' },
      });
    });
  });

  describe('findOneForStaff', () => {
    it("returns any tenant's ticket without restriction", async () => {
      mockTicketRepo.findOne.mockResolvedValue(
        makeTicket({ tenantId: OTHER_TENANT_ID }),
      );
      mockMessageRepo.find.mockResolvedValue([]);
      const svc = await buildService();
      const result = await svc.findOneForStaff(TICKET_ID);
      expect(result.ticket.tenantId).toBe(OTHER_TENANT_ID);
    });

    it('404s when the ticket does not exist', async () => {
      mockTicketRepo.findOne.mockResolvedValue(null);
      const svc = await buildService();
      await expect(svc.findOneForStaff(TICKET_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('addStaffMessage', () => {
    it('notifies the ticket opener (not the support inbox) and records the last-message author', async () => {
      mockTicketRepo.findOne.mockResolvedValue(makeTicket());
      mockMessageRepo.save.mockResolvedValue({ id: 'msg-4' });
      const svc = await buildService();
      await svc.addStaffMessage('Ada PingLoyal', TICKET_ID, {
        message: 'Looking into it',
      });
      expect(mockMailer.sendTicketReplyNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientEmail: 'adebayo@freshmart.ng',
          authorName: 'Ada PingLoyal',
        }),
      );
      expect(mockTicketRepo.update).toHaveBeenCalledWith(
        TICKET_ID,
        expect.objectContaining({ lastMessageAuthorType: 'staff' }),
      );
    });

    it('does not reopen a resolved ticket when staff replies', async () => {
      mockTicketRepo.findOne.mockResolvedValue(
        makeTicket({ status: 'resolved' }),
      );
      mockMessageRepo.save.mockResolvedValue({ id: 'msg-5' });
      const svc = await buildService();
      await svc.addStaffMessage('Ada PingLoyal', TICKET_ID, {
        message: 'Closing this out',
      });
      expect(mockTicketRepo.update).toHaveBeenCalledWith(TICKET_ID, {
        lastMessageAt: expect.any(Date) as unknown,
        lastMessageAuthorType: 'staff',
      });
    });
  });

  describe('updateStatus', () => {
    it('updates and returns the merged ticket', async () => {
      mockTicketRepo.findOne.mockResolvedValue(makeTicket());
      const svc = await buildService();
      const result = await svc.updateStatus(TICKET_ID, {
        status: 'in_progress',
      });
      expect(mockTicketRepo.update).toHaveBeenCalledWith(TICKET_ID, {
        status: 'in_progress',
      });
      expect(result.status).toBe('in_progress');
    });

    it('404s when the ticket does not exist', async () => {
      mockTicketRepo.findOne.mockResolvedValue(null);
      const svc = await buildService();
      await expect(
        svc.updateStatus(TICKET_ID, { status: 'closed' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
