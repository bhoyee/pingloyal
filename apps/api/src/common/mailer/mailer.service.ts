import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly resend: Resend | null;
  private readonly fromAddress: string;

  constructor(private readonly config: ConfigService) {
    const key = this.config.get<string>('RESEND_API_KEY', '');
    const isPlaceholder =
      !key || key.includes('placeholder') || key.includes('_test_');
    this.resend = isPlaceholder ? null : new Resend(key);
    this.fromAddress =
      this.config.get<string>('MAIL_FROM') ??
      'PingLoyal <noreply@pingloyal.com>';
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
}
