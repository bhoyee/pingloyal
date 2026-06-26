import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly resend: Resend | null;
  private readonly fromAddress: string;
  private readonly supportEmail: string;

  constructor(private readonly config: ConfigService) {
    const key = this.config.get<string>('RESEND_API_KEY', '');
    const isPlaceholder =
      !key || key.includes('placeholder') || key.includes('_test_');
    this.resend = isPlaceholder ? null : new Resend(key);
    this.fromAddress =
      this.config.get<string>('MAIL_FROM') ??
      'PingLoyal <noreply@pingloyal.com>';
    this.supportEmail =
      this.config.get<string>('SUPPORT_EMAIL') ?? 'support@pingloyal.com';
  }

  getSupportEmail(): string {
    return this.supportEmail;
  }

  async sendWelcomeVerification(params: {
    to: string;
    name: string;
    businessName: string;
    code: string;
  }): Promise<void> {
    if (!this.resend) {
      this.logger.warn(
        `[DEV] Verification code for ${params.to} — code: ${params.code}`,
      );
      return;
    }

    await this.resend.emails.send({
      from: this.fromAddress,
      to: params.to,
      subject: 'Welcome to PingLoyal — Verify your email',
      html: this.buildWelcomeHtml(params),
    });
  }

  async sendVerificationCode(params: {
    to: string;
    name: string;
    code: string;
  }): Promise<void> {
    if (!this.resend) {
      this.logger.warn(
        `[DEV] Resend verification code for ${params.to} — code: ${params.code}`,
      );
      return;
    }

    await this.resend.emails.send({
      from: this.fromAddress,
      to: params.to,
      subject: 'PingLoyal — Your new verification code',
      html: this.buildResendHtml(params),
    });
  }

  async sendPasswordResetCode(params: {
    to: string;
    name: string;
    code: string;
  }): Promise<void> {
    if (!this.resend) {
      this.logger.warn(
        `[DEV] Password reset code for ${params.to} — code: ${params.code}`,
      );
      return;
    }

    await this.resend.emails.send({
      from: this.fromAddress,
      to: params.to,
      subject: 'PingLoyal — Reset your password',
      html: this.buildPasswordResetHtml(params),
    });
  }

  async sendStaffCreatedAccountWelcome(params: {
    to: string;
    name: string;
    businessName: string;
    code: string;
  }): Promise<void> {
    if (!this.resend) {
      this.logger.warn(
        `[DEV] Staff-created account welcome for ${params.to} (${params.businessName}) — reset code: ${params.code}`,
      );
      return;
    }

    await this.resend.emails.send({
      from: this.fromAddress,
      to: params.to,
      subject: `Your PingLoyal account is ready — ${params.businessName}`,
      html: this.buildStaffCreatedWelcomeHtml(params),
    });
  }

  async sendTemplateRequestNotification(params: {
    tenantId: string;
    businessName: string;
    templateName: string;
    useCase: string;
    requestId: string;
  }): Promise<void> {
    const subject = `New Template Request — ${params.businessName}`;
    if (!this.resend) {
      this.logger.warn(
        `[DEV] Template request from tenant ${params.tenantId} (${params.businessName}): "${params.templateName}"`,
      );
      return;
    }
    await this.resend.emails.send({
      from: this.fromAddress,
      to: this.supportEmail,
      subject,
      html: this.buildTemplateRequestHtml(params),
    });
  }

  async sendNewTicketNotification(params: {
    ticketId: string;
    businessName: string;
    subject: string;
    message: string;
  }): Promise<void> {
    const subject = `New Support Ticket — ${params.businessName}: ${params.subject}`;
    if (!this.resend) {
      this.logger.warn(
        `[DEV] New support ticket ${params.ticketId} from ${params.businessName}: "${params.subject}"`,
      );
      return;
    }
    await this.resend.emails.send({
      from: this.fromAddress,
      to: this.supportEmail,
      subject,
      html: this.buildTicketEmailHtml({
        heading: 'New Support Ticket',
        intro: 'A tenant has opened a new support ticket.',
        ticketId: params.ticketId,
        authorName: params.businessName,
        body: `${params.subject}\n\n${params.message}`,
      }),
    });
  }

  // Covers both directions: staff get notified when a tenant replies
  // (recipientEmail = the support inbox), and the tenant gets notified when
  // staff replies (recipientEmail = the ticket's openedByEmail).
  async sendTicketReplyNotification(params: {
    ticketId: string;
    recipientEmail: string;
    subject: string;
    authorName: string;
    message: string;
  }): Promise<void> {
    const subject = `Re: ${params.subject}`;
    if (!this.resend) {
      this.logger.warn(
        `[DEV] Reply on ticket ${params.ticketId} from ${params.authorName} → ${params.recipientEmail}`,
      );
      return;
    }
    await this.resend.emails.send({
      from: this.fromAddress,
      to: params.recipientEmail,
      subject,
      html: this.buildTicketEmailHtml({
        heading: 'New Reply on Your Support Ticket',
        intro: `${params.authorName} replied to ticket: ${params.subject}`,
        ticketId: params.ticketId,
        authorName: params.authorName,
        body: params.message,
      }),
    });
  }

  async sendDemoRequestNotification(params: {
    fullName: string;
    email: string;
    companyName: string;
  }): Promise<void> {
    const subject = `Demo request — ${params.companyName}`;
    if (!this.resend) {
      this.logger.warn(
        `[DEV] Demo request from ${params.fullName} <${params.email}> (${params.companyName})`,
      );
      return;
    }
    await this.resend.emails.send({
      from: this.fromAddress,
      to: this.supportEmail,
      replyTo: params.email,
      subject,
      html: this.buildDemoRequestHtml(params),
    });
  }

  async sendContactFormNotification(params: {
    name: string;
    email: string;
    subject: string;
    message: string;
  }): Promise<void> {
    const subject = `Contact form: ${params.subject}`;
    if (!this.resend) {
      this.logger.warn(
        `[DEV] Contact form from ${params.name} <${params.email}>: "${params.subject}" — ${params.message}`,
      );
      return;
    }
    await this.resend.emails.send({
      from: this.fromAddress,
      to: this.supportEmail,
      replyTo: params.email,
      subject,
      html: this.buildContactFormHtml(params),
    });
  }

  async sendAccountDeletionRequested(params: {
    to: string;
    businessName: string;
    scheduledAt: Date;
    cancelUrl: string;
  }): Promise<void> {
    if (!this.resend) {
      this.logger.warn(
        `[DEV] Account deletion requested for ${params.businessName} (${params.to}) — ` +
          `scheduled ${params.scheduledAt.toISOString()} — cancel: ${params.cancelUrl}`,
      );
      return;
    }
    await this.resend.emails.send({
      from: this.fromAddress,
      to: params.to,
      subject: `${params.businessName} — Account deletion scheduled`,
      html: this.buildAccountDeletionRequestedHtml(params),
    });
  }

  async sendAccountDeletionSupportNotice(params: {
    businessName: string;
    tenantId: string;
    ownerEmail: string;
    scheduledAt: Date;
  }): Promise<void> {
    if (!this.resend) {
      this.logger.warn(
        `[DEV] Account deletion support notice — tenant=${params.tenantId} ` +
          `(${params.businessName}) owner=${params.ownerEmail} scheduled=${params.scheduledAt.toISOString()}`,
      );
      return;
    }
    await this.resend.emails.send({
      from: this.fromAddress,
      to: this.supportEmail,
      subject: `Account deletion requested — ${params.businessName}`,
      html: this.buildAccountDeletionSupportHtml(params),
    });
  }

  private buildDemoRequestHtml(params: {
    fullName: string;
    email: string;
    companyName: string;
  }): string {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.08);overflow:hidden">
        <tr><td style="background:#0A1628;padding:20px 32px">
          <span style="color:#fff;font-size:18px;font-weight:700;letter-spacing:-0.5px">PingLoyal</span>
          <span style="color:#94a3b8;font-size:13px;margin-left:12px">Demo Request</span>
        </td></tr>
        <tr><td style="padding:28px 32px">
          <h2 style="margin:0 0 4px;font-size:18px;color:#0f172a">New demo request</h2>
          <p style="margin:0 0 24px;color:#64748b;font-size:14px">Someone wants to book a demo of PingLoyal.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
            <tr style="background:#f8fafc">
              <td style="padding:10px 16px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px;width:140px">Name</td>
              <td style="padding:10px 16px;font-size:14px;color:#0f172a;font-weight:600">${params.fullName}</td>
            </tr>
            <tr style="border-top:1px solid #e2e8f0">
              <td style="padding:10px 16px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px">Email</td>
              <td style="padding:10px 16px;font-size:14px;color:#0f172a">${params.email}</td>
            </tr>
            <tr style="border-top:1px solid #e2e8f0">
              <td style="padding:10px 16px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px">Company</td>
              <td style="padding:10px 16px;font-size:14px;color:#0f172a">${params.companyName}</td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:16px 32px 24px;border-top:1px solid #f1f5f9;text-align:center">
          <p style="margin:0;color:#94a3b8;font-size:12px">© 2026 PingLoyal · Reply directly to this email to respond</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  private buildContactFormHtml(params: {
    name: string;
    email: string;
    subject: string;
    message: string;
  }): string {
    const escapedMessage = params.message
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br/>');
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.08);overflow:hidden">
        <tr><td style="background:#0A1628;padding:20px 32px">
          <span style="color:#fff;font-size:18px;font-weight:700;letter-spacing:-0.5px">PingLoyal</span>
          <span style="color:#94a3b8;font-size:13px;margin-left:12px">Contact Form</span>
        </td></tr>
        <tr><td style="padding:28px 32px">
          <h2 style="margin:0 0 4px;font-size:18px;color:#0f172a">${params.subject}</h2>
          <p style="margin:0 0 20px;color:#64748b;font-size:14px">From ${params.name} &lt;${params.email}&gt;</p>
          <div style="padding:16px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;color:#0f172a;font-size:14px;line-height:1.6">${escapedMessage}</div>
        </td></tr>
        <tr><td style="padding:16px 32px 24px;border-top:1px solid #f1f5f9;text-align:center">
          <p style="margin:0;color:#94a3b8;font-size:12px">© 2026 PingLoyal · Reply directly to this email to respond</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  private buildAccountDeletionRequestedHtml(params: {
    businessName: string;
    scheduledAt: Date;
    cancelUrl: string;
  }): string {
    const scheduledStr = params.scheduledAt.toUTCString();
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 16px">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.08);overflow:hidden">
        <tr><td style="background:#0A1628;padding:24px 32px;text-align:center">
          <span style="color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px">PingLoyal</span>
        </td></tr>
        <tr><td style="padding:32px">
          <h2 style="margin:0 0 8px;font-size:20px;color:#b91c1c">Account deletion scheduled</h2>
          <p style="margin:0 0 20px;color:#64748b;font-size:15px;line-height:1.6">
            We've received a request to permanently delete the <strong>${params.businessName}</strong> account.
            Login has been disabled immediately for both the dashboard and cashier app.
          </p>
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px 20px;margin:0 0 24px">
            <p style="margin:0;color:#991b1b;font-size:14px;line-height:1.6">
              All data — customers, transactions, campaigns, and message history — will be
              <strong>permanently deleted</strong> on or after:<br>
              <strong>${scheduledStr}</strong>
            </p>
          </div>
          <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6">
            Didn't request this, or changed your mind? Cancel the deletion before it runs:
          </p>
          <div style="text-align:center;margin:0 0 24px">
            <a href="${params.cancelUrl}" style="display:inline-block;background:#0DC56A;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 28px;border-radius:8px">
              Cancel deletion
            </a>
          </div>
          <p style="margin:0;color:#94a3b8;font-size:13px">This link expires once the account is deleted.</p>
        </td></tr>
        <tr><td style="padding:16px 32px 24px;border-top:1px solid #f1f5f9;text-align:center">
          <p style="margin:0;color:#94a3b8;font-size:12px">© 2026 PingLoyal. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  private buildAccountDeletionSupportHtml(params: {
    businessName: string;
    tenantId: string;
    ownerEmail: string;
    scheduledAt: Date;
  }): string {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.08);overflow:hidden">
        <tr><td style="background:#0A1628;padding:20px 32px">
          <span style="color:#fff;font-size:18px;font-weight:700;letter-spacing:-0.5px">PingLoyal</span>
          <span style="color:#94a3b8;font-size:13px;margin-left:12px">Account Deletion</span>
        </td></tr>
        <tr><td style="padding:28px 32px">
          <h2 style="margin:0 0 4px;font-size:18px;color:#b91c1c">Account deletion requested</h2>
          <p style="margin:0 0 24px;color:#64748b;font-size:14px">A store owner has requested to delete their account.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
            <tr style="background:#f8fafc">
              <td style="padding:10px 16px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px;width:160px">Store</td>
              <td style="padding:10px 16px;font-size:14px;color:#0f172a;font-weight:600">${params.businessName}</td>
            </tr>
            <tr style="border-top:1px solid #e2e8f0">
              <td style="padding:10px 16px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px">Owner Email</td>
              <td style="padding:10px 16px;font-size:14px;color:#0f172a">${params.ownerEmail}</td>
            </tr>
            <tr style="border-top:1px solid #e2e8f0">
              <td style="padding:10px 16px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px">Tenant ID</td>
              <td style="padding:10px 16px;font-size:12px;color:#64748b;font-family:monospace">${params.tenantId}</td>
            </tr>
            <tr style="border-top:1px solid #e2e8f0;background:#fef2f2">
              <td style="padding:10px 16px;font-size:12px;font-weight:600;color:#991b1b;text-transform:uppercase;letter-spacing:.5px">Hard delete at</td>
              <td style="padding:10px 16px;font-size:14px;color:#991b1b;font-weight:600">${params.scheduledAt.toUTCString()}</td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:16px 32px 24px;border-top:1px solid #f1f5f9;text-align:center">
          <p style="margin:0;color:#94a3b8;font-size:12px">© 2026 PingLoyal · Internal notification</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  private buildTicketEmailHtml(params: {
    heading: string;
    intro: string;
    ticketId: string;
    authorName: string;
    body: string;
  }): string {
    const escapedBody = params.body
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br/>');
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.08);overflow:hidden">
        <tr><td style="background:#0A1628;padding:20px 32px">
          <span style="color:#fff;font-size:18px;font-weight:700;letter-spacing:-0.5px">PingLoyal</span>
          <span style="color:#94a3b8;font-size:13px;margin-left:12px">Support</span>
        </td></tr>
        <tr><td style="padding:28px 32px">
          <h2 style="margin:0 0 4px;font-size:18px;color:#0f172a">${params.heading}</h2>
          <p style="margin:0 0 20px;color:#64748b;font-size:14px">${params.intro}</p>
          <p style="margin:0 0 8px;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:.5px">From ${params.authorName} · Ticket ${params.ticketId}</p>
          <div style="padding:16px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;color:#0f172a;font-size:14px;line-height:1.6">${escapedBody}</div>
        </td></tr>
        <tr><td style="padding:16px 32px 24px;border-top:1px solid #f1f5f9;text-align:center">
          <p style="margin:0;color:#94a3b8;font-size:12px">© 2026 PingLoyal · Internal notification</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  private buildTemplateRequestHtml(params: {
    tenantId: string;
    businessName: string;
    templateName: string;
    useCase: string;
    requestId: string;
  }): string {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.08);overflow:hidden">
        <tr><td style="background:#0A1628;padding:20px 32px">
          <span style="color:#fff;font-size:18px;font-weight:700;letter-spacing:-0.5px">PingLoyal</span>
          <span style="color:#94a3b8;font-size:13px;margin-left:12px">Template Request</span>
        </td></tr>
        <tr><td style="padding:28px 32px">
          <h2 style="margin:0 0 4px;font-size:18px;color:#0f172a">New Template Request</h2>
          <p style="margin:0 0 24px;color:#64748b;font-size:14px">A store has requested a new campaign template.</p>

          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
            <tr style="background:#f8fafc">
              <td style="padding:10px 16px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px;width:140px">Store</td>
              <td style="padding:10px 16px;font-size:14px;color:#0f172a;font-weight:600">${params.businessName}</td>
            </tr>
            <tr style="border-top:1px solid #e2e8f0">
              <td style="padding:10px 16px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px">Tenant ID</td>
              <td style="padding:10px 16px;font-size:12px;color:#64748b;font-family:monospace">${params.tenantId}</td>
            </tr>
            <tr style="border-top:1px solid #e2e8f0">
              <td style="padding:10px 16px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px">Request ID</td>
              <td style="padding:10px 16px;font-size:12px;color:#64748b;font-family:monospace">${params.requestId}</td>
            </tr>
            <tr style="border-top:1px solid #e2e8f0">
              <td style="padding:10px 16px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px">Template Name</td>
              <td style="padding:10px 16px;font-size:14px;color:#0f172a">${params.templateName}</td>
            </tr>
            <tr style="border-top:1px solid #e2e8f0;background:#fafafa">
              <td style="padding:10px 16px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px;vertical-align:top">Use Case</td>
              <td style="padding:10px 16px;font-size:14px;color:#0f172a;line-height:1.6;white-space:pre-wrap">${params.useCase}</td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:16px 32px 24px;border-top:1px solid #f1f5f9;text-align:center">
          <p style="margin:0;color:#94a3b8;font-size:12px">© 2026 PingLoyal · Internal notification</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  private buildWelcomeHtml(params: {
    name: string;
    businessName: string;
    code: string;
  }): string {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 16px">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.08);overflow:hidden">
        <tr><td style="background:#0A1628;padding:24px 32px;text-align:center">
          <span style="color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px">PingLoyal</span>
        </td></tr>
        <tr><td style="padding:32px">
          <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">Welcome, ${params.name}!</h2>
          <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6">
            Your business account for <strong>${params.businessName}</strong> is ready.<br>
            Please verify your email to activate your 14-day free trial.
          </p>
          <div style="background:#f1f5f9;border-radius:8px;padding:20px;text-align:center;margin:0 0 24px">
            <p style="margin:0 0 8px;color:#64748b;font-size:13px;font-weight:500;text-transform:uppercase;letter-spacing:.5px">Verification code</p>
            <p style="margin:0;font-size:36px;font-weight:700;color:#0A1628;letter-spacing:6px">${params.code}</p>
          </div>
          <p style="margin:0;color:#94a3b8;font-size:13px">This code expires in 24 hours. If you didn't create this account, you can safely ignore this email.</p>
        </td></tr>
        <tr><td style="padding:16px 32px 24px;border-top:1px solid #f1f5f9;text-align:center">
          <p style="margin:0;color:#94a3b8;font-size:12px">© 2026 PingLoyal. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  private buildResendHtml(params: { name: string; code: string }): string {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 16px">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.08);overflow:hidden">
        <tr><td style="background:#0A1628;padding:24px 32px;text-align:center">
          <span style="color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px">PingLoyal</span>
        </td></tr>
        <tr><td style="padding:32px">
          <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">New verification code</h2>
          <p style="margin:0 0 24px;color:#64748b;font-size:15px">Hi ${params.name}, here's your new code:</p>
          <div style="background:#f1f5f9;border-radius:8px;padding:20px;text-align:center;margin:0 0 24px">
            <p style="margin:0 0 8px;color:#64748b;font-size:13px;font-weight:500;text-transform:uppercase;letter-spacing:.5px">Verification code</p>
            <p style="margin:0;font-size:36px;font-weight:700;color:#0A1628;letter-spacing:6px">${params.code}</p>
          </div>
          <p style="margin:0;color:#94a3b8;font-size:13px">This code expires in 24 hours.</p>
        </td></tr>
        <tr><td style="padding:16px 32px 24px;border-top:1px solid #f1f5f9;text-align:center">
          <p style="margin:0;color:#94a3b8;font-size:12px">© 2026 PingLoyal. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  private buildPasswordResetHtml(params: {
    name: string;
    code: string;
  }): string {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 16px">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.08);overflow:hidden">
        <tr><td style="background:#0A1628;padding:24px 32px;text-align:center">
          <span style="color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px">PingLoyal</span>
        </td></tr>
        <tr><td style="padding:32px">
          <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">Reset your password</h2>
          <p style="margin:0 0 24px;color:#64748b;font-size:15px">Hi ${params.name}, use this code to reset your password:</p>
          <div style="background:#f1f5f9;border-radius:8px;padding:20px;text-align:center;margin:0 0 24px">
            <p style="margin:0 0 8px;color:#64748b;font-size:13px;font-weight:500;text-transform:uppercase;letter-spacing:.5px">Reset code</p>
            <p style="margin:0;font-size:36px;font-weight:700;color:#0A1628;letter-spacing:6px">${params.code}</p>
          </div>
          <p style="margin:0;color:#94a3b8;font-size:13px">This code expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>
        </td></tr>
        <tr><td style="padding:16px 32px 24px;border-top:1px solid #f1f5f9;text-align:center">
          <p style="margin:0;color:#94a3b8;font-size:12px">© 2026 PingLoyal. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  private buildStaffCreatedWelcomeHtml(params: {
    name: string;
    businessName: string;
    code: string;
  }): string {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 16px">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.08);overflow:hidden">
        <tr><td style="background:#0A1628;padding:24px 32px;text-align:center">
          <span style="color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px">PingLoyal</span>
        </td></tr>
        <tr><td style="padding:32px">
          <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">Your account is ready, ${params.name}</h2>
          <p style="margin:0 0 24px;color:#64748b;font-size:15px">The PingLoyal team has set up <strong>${params.businessName}</strong> on PingLoyal. Use this code to set your password and get started:</p>
          <div style="background:#f1f5f9;border-radius:8px;padding:20px;text-align:center;margin:0 0 24px">
            <p style="margin:0 0 8px;color:#64748b;font-size:13px;font-weight:500;text-transform:uppercase;letter-spacing:.5px">Set-password code</p>
            <p style="margin:0;font-size:36px;font-weight:700;color:#0A1628;letter-spacing:6px">${params.code}</p>
          </div>
          <p style="margin:0;color:#94a3b8;font-size:13px">This code expires in 1 hour. Enter it on the reset-password page along with your email and a new password to log in.</p>
        </td></tr>
        <tr><td style="padding:16px 32px 24px;border-top:1px solid #f1f5f9;text-align:center">
          <p style="margin:0;color:#94a3b8;font-size:12px">© 2026 PingLoyal. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }
}
