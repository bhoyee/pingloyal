import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export interface EmailParams {
  to: string;
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content: Buffer }>;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;

  constructor(private readonly config: ConfigService) {
    const apiKey = config.get<string>('RESEND_API_KEY');
    this.resend =
      apiKey && apiKey !== 're_test_placeholder' ? new Resend(apiKey) : null;
  }

  async send(params: EmailParams): Promise<void> {
    if (!this.resend) {
      this.logger.warn(
        `Email skipped (no Resend key): to=${params.to} subject="${params.subject}"`,
      );
      return;
    }

    await this.resend.emails.send({
      from: 'PingLoyal Reports <reports@pingloyal.com>',
      to: params.to,
      subject: params.subject,
      html: params.html,
      attachments: params.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content.toString('base64'),
      })),
    });
  }
}
