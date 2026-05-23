import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decrypt } from '@pingloyal/utils';
import { WaBspException } from './exceptions/wa-bsp.exception';

export interface SendMessageParams {
  customerPhone: string;
  templateName: string;
  templateParams: string[];
  tenantGupshupApiKey: string; // ENCRYPTED value from tenant record
  tenantAppId: string;
  tenantPhoneNumber: string;
}

export interface SendMessageResult {
  messageId: string;
}

interface GupshupSendResponse {
  status: string;
  messageId: string;
}

@Injectable()
export class BspService {
  private readonly logger = new Logger(BspService.name);

  constructor(private readonly config: ConfigService) {}

  async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    const apiKey = decrypt(params.tenantGupshupApiKey);
    const apiUrl = this.config.getOrThrow<string>('GUPSHUP_API_URL');

    const body = new URLSearchParams({
      channel: 'whatsapp',
      source: params.tenantPhoneNumber,
      destination: params.customerPhone,
      'src.name': params.tenantAppId,
      template: JSON.stringify({
        id: params.templateName,
        params: params.templateParams,
      }),
    });

    const res = await fetch(`${apiUrl}/template/msg`, {
      method: 'POST',
      headers: {
        apikey: apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (res.status === 401)
      throw new WaBspException('Invalid BSP credentials', 401);
    if (res.status === 429)
      throw new WaBspException('BSP rate limit exceeded', 429);
    if (res.status === 400)
      throw new WaBspException('Template not found or invalid params', 400);
    if (res.status >= 500) throw new WaBspException('BSP server error', 502);

    const data = (await res.json()) as GupshupSendResponse;
    const maskedPhone = this.maskPhone(params.customerPhone);

    this.logger.log(
      `WA send: template=${params.templateName} to=${maskedPhone} appId=${params.tenantAppId} msgId=${data.messageId}`,
    );

    return { messageId: data.messageId };
  }

  private maskPhone(phone: string): string {
    if (phone.length <= 9) return phone;
    return phone.slice(0, 7) + '****' + phone.slice(-2);
  }
}
