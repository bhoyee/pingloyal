import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import sanitizeHtml from 'sanitize-html';
import { SupportTicket } from './entities/support-ticket.entity';
import {
  SupportTicketMessage,
  SupportTicketMessageAuthorType,
} from './entities/support-ticket-message.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../auth/entities/user.entity';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import { MailerService } from '../../common/mailer/mailer.service';
import { R2Service } from '../storage/r2.service';

const ALLOWED_ATTACHMENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
];
const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024; // 5 MB

interface UploadedAttachment {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

interface AttachmentFields {
  attachmentUrl: string;
  attachmentName: string;
  attachmentMimeType: string;
  attachmentSize: number;
}

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    @InjectRepository(SupportTicket)
    private readonly ticketRepo: Repository<SupportTicket>,
    @InjectRepository(SupportTicketMessage)
    private readonly messageRepo: Repository<SupportTicketMessage>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly mailer: MailerService,
    private readonly r2: R2Service,
  ) {}

  // ── Tenant-facing ──────────────────────────────────────────────────────────

  async createTicket(
    tenantId: string,
    userId: string,
    dto: CreateTicketDto,
    file?: UploadedAttachment,
  ): Promise<SupportTicket> {
    const [tenant, user] = await Promise.all([
      this.tenantRepo.findOne({ where: { id: tenantId } }),
      this.userRepo.findOne({ where: { id: userId } }),
    ]);
    if (!tenant) throw new BadRequestException('Tenant not found');
    if (!user) throw new BadRequestException('User not found');

    const body = sanitizeMessageBody(dto.message);
    if (htmlToPlainText(body).length < 10) {
      throw new BadRequestException('Message must be at least 10 characters');
    }

    const now = new Date();
    const ticket = await this.ticketRepo.save(
      this.ticketRepo.create({
        tenantId,
        businessName: tenant.businessName,
        openedByName: user.fullName,
        openedByEmail: user.email,
        subject: dto.subject,
        status: 'open',
        priority: dto.priority,
        lastMessageAt: now,
        lastMessageAuthorType: 'tenant',
        tenantLastReadAt: now,
      }),
    );

    const attachment = file
      ? await this.uploadAttachment(tenantId, ticket.id, file)
      : null;

    await this.messageRepo.save(
      this.messageRepo.create({
        ticketId: ticket.id,
        authorType: 'tenant',
        authorName: user.fullName,
        body,
        ...attachment,
      }),
    );

    this.mailer
      .sendNewTicketNotification({
        ticketId: ticket.id,
        businessName: tenant.businessName,
        subject: dto.subject,
        message: htmlToPlainText(body),
      })
      .catch((err: unknown) =>
        this.logger.error(
          `Failed to send new-ticket notification for ticket ${ticket.id}`,
          err,
        ),
      );

    return ticket;
  }

  async getUnreadCountForTenant(tenantId: string): Promise<number> {
    return this.ticketRepo
      .createQueryBuilder('t')
      .where('t.tenant_id = :tenantId', { tenantId })
      .andWhere('t.last_message_author_type = :authorType', {
        authorType: 'staff',
      })
      .andWhere(
        '(t.tenant_last_read_at IS NULL OR t.last_message_at > t.tenant_last_read_at)',
      )
      .getCount();
  }

  findAllForTenant(tenantId: string): Promise<SupportTicket[]> {
    return this.ticketRepo.find({
      where: { tenantId },
      order: { lastMessageAt: 'DESC' },
    });
  }

  async findOneForTenant(
    tenantId: string,
    ticketId: string,
  ): Promise<{ ticket: SupportTicket; messages: SupportTicketMessage[] }> {
    const ticket = await this.ticketRepo.findOne({
      where: { id: ticketId },
    });
    if (!ticket || ticket.tenantId !== tenantId) {
      throw new NotFoundException('Ticket not found');
    }
    const messages = await this.messageRepo.find({
      where: { ticketId },
      order: { createdAt: 'ASC' },
    });

    // Opening the thread is what "read" means for the unread badge count.
    const now = new Date();
    await this.ticketRepo.update(ticket.id, { tenantLastReadAt: now });
    ticket.tenantLastReadAt = now;

    return { ticket, messages };
  }

  async reopenTicket(
    tenantId: string,
    ticketId: string,
  ): Promise<SupportTicket> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket || ticket.tenantId !== tenantId) {
      throw new NotFoundException('Ticket not found');
    }

    await this.ticketRepo.update(ticketId, { status: 'open' });
    return { ...ticket, status: 'open' };
  }

  async addTenantMessage(
    tenantId: string,
    userId: string,
    ticketId: string,
    dto: CreateMessageDto,
  ): Promise<SupportTicketMessage> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket || ticket.tenantId !== tenantId) {
      throw new NotFoundException('Ticket not found');
    }
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');

    const { message, body } = await this.appendMessage(
      ticket,
      'tenant',
      user.fullName,
      dto.message,
    );

    this.mailer
      .sendTicketReplyNotification({
        ticketId: ticket.id,
        recipientEmail: this.mailer.getSupportEmail(),
        subject: ticket.subject,
        authorName: user.fullName,
        message: htmlToPlainText(body),
      })
      .catch((err: unknown) =>
        this.logger.error(
          `Failed to send tenant-reply notification for ticket ${ticket.id}`,
          err,
        ),
      );

    return message;
  }

  // ── Staff-facing ───────────────────────────────────────────────────────────

  async getTicketCountsForStaff(): Promise<{ open: number; in_progress: number }> {
    const rows = await this.ticketRepo
      .createQueryBuilder('t')
      .select('t.status', 'status')
      .addSelect('COUNT(*)', 'cnt')
      .where('t.status IN (:...statuses)', { statuses: ['open', 'in_progress'] })
      .groupBy('t.status')
      .getRawMany<{ status: string; cnt: string }>();
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.status] = Number(r.cnt);
    return { open: counts['open'] ?? 0, in_progress: counts['in_progress'] ?? 0 };
  }

  findAllForStaff(status?: string): Promise<SupportTicket[]> {
    return this.ticketRepo.find({
      where: status ? { status: status as SupportTicket['status'] } : {},
      order: { lastMessageAt: 'DESC' },
    });
  }

  async findOneForStaff(
    ticketId: string,
  ): Promise<{ ticket: SupportTicket; messages: SupportTicketMessage[] }> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    const messages = await this.messageRepo.find({
      where: { ticketId },
      order: { createdAt: 'ASC' },
    });
    return { ticket, messages };
  }

  async addStaffMessage(
    staffFullName: string,
    ticketId: string,
    dto: CreateMessageDto,
  ): Promise<SupportTicketMessage> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const { message, body } = await this.appendMessage(
      ticket,
      'staff',
      staffFullName,
      dto.message,
    );

    this.mailer
      .sendTicketReplyNotification({
        ticketId: ticket.id,
        recipientEmail: ticket.openedByEmail,
        subject: ticket.subject,
        authorName: staffFullName,
        message: htmlToPlainText(body),
      })
      .catch((err: unknown) =>
        this.logger.error(
          `Failed to send staff-reply notification for ticket ${ticket.id}`,
          err,
        ),
      );

    return message;
  }

  async updateStatus(
    ticketId: string,
    dto: UpdateTicketStatusDto,
  ): Promise<SupportTicket> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    await this.ticketRepo.update(ticketId, { status: dto.status });
    return { ...ticket, status: dto.status };
  }

  // ── Shared ─────────────────────────────────────────────────────────────────

  private async uploadAttachment(
    tenantId: string,
    ticketId: string,
    file: UploadedAttachment,
  ): Promise<AttachmentFields> {
    if (!ALLOWED_ATTACHMENT_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        'Only JPEG, PNG, WebP, GIF images or PDF files are allowed',
      );
    }
    if (file.size > MAX_ATTACHMENT_SIZE) {
      throw new PayloadTooLargeException('Attachment must be under 5 MB');
    }

    const ext = file.originalname.split('.').pop() ?? 'bin';
    const key = `support-attachments/${tenantId}/${ticketId}/${randomUUID()}.${ext}`;
    const attachmentUrl = await this.r2.uploadFile({
      key,
      buffer: file.buffer,
      contentType: file.mimetype,
    });

    return {
      attachmentUrl,
      attachmentName: file.originalname,
      attachmentMimeType: file.mimetype,
      attachmentSize: file.size,
    };
  }

  private async appendMessage(
    ticket: SupportTicket,
    authorType: SupportTicketMessageAuthorType,
    authorName: string,
    rawBody: string,
  ): Promise<{ message: SupportTicketMessage; body: string }> {
    const body = sanitizeMessageBody(rawBody);
    if (htmlToPlainText(body).length < 1) {
      throw new BadRequestException('Message cannot be empty');
    }

    const message = await this.messageRepo.save(
      this.messageRepo.create({
        ticketId: ticket.id,
        authorType,
        authorName,
        body,
      }),
    );

    const now = new Date();
    const reopen =
      authorType === 'tenant' &&
      (ticket.status === 'resolved' || ticket.status === 'closed');
    await this.ticketRepo.update(ticket.id, {
      lastMessageAt: now,
      lastMessageAuthorType: authorType,
      ...(authorType === 'tenant' ? { tenantLastReadAt: now } : {}),
      ...(reopen ? { status: 'open' as const } : {}),
    });

    return { message, body };
  }
}

// ── Rich-text helpers ──────────────────────────────────────────────────────
// Ticket/message bodies come from a rich-text editor as HTML. Sanitize to a
// small allowlist before storage (XSS defense — these bodies are rendered
// with dangerouslySetInnerHTML on both the tenant and staff dashboards), and
// strip to plain text for length checks and for the plain-text email digest.

const ALLOWED_TAGS = [
  'b',
  'strong',
  'i',
  'em',
  'u',
  'p',
  'br',
  'ul',
  'ol',
  'li',
  'a',
];

function sanitizeMessageBody(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ['href'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', {
        target: '_blank',
        rel: 'noopener noreferrer',
      }),
    },
  });
}

function htmlToPlainText(html: string): string {
  const withBreaks = html
    .replace(/<\/(p|li)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
  return sanitizeHtml(withBreaks, {
    allowedTags: [],
    allowedAttributes: {},
  }).trim();
}
