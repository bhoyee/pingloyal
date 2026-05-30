import * as crypto from 'crypto';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { WaVerificationStatus } from '@pingloyal/types';
import { encrypt } from '@pingloyal/utils';
import { REDIS_CLIENT } from '../../common/redis/redis.constants';
import { Tenant } from '../tenants/entities/tenant.entity';
import { WaOnboardingDto } from './dto/wa-onboarding.dto';
import { waEvents } from './wa.events';

// Gupshup inbound webhook payload (simplified)
export interface GupshupWebhookPayload {
  app: string; // Gupshup App ID
  type: string; // 'message' | 'message-event' | 'user-event'
  payload: {
    source: string; // sender phone E.164
    type: string; // 'text' | 'image' | 'audio' etc
    payload: { text?: string };
  };
}

export interface WaStatusResponse {
  isConnected: boolean;
  verificationStatus: WaVerificationStatus;
  displayName: string | null;
  phoneNumber: string | null;
  category: string | null;
  verifiedAt: Date | null;
}

@Injectable()
export class WaOnboardingService {
  private readonly logger = new Logger(WaOnboardingService.name);

  constructor(
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {}

  // ── initiateOnboarding ─────────────────────────────────────────────────────

  async initiateOnboarding(
    tenantId: string,
    dto: WaOnboardingDto,
  ): Promise<{ message: string }> {
    const phone = dto.phoneNumber.replace(/\s+/g, '');
    if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
      throw new BadRequestException(
        'Invalid phone number. Use E.164 format, e.g. +2348012345678',
      );
    }

    // Rate limit: 5 attempts per hour per tenant
    const rlKey = `wa:initiate:${tenantId}`;
    const attempts = await this.redis.incr(rlKey);
    if (attempts === 1) await this.redis.expire(rlKey, 3600);
    if (attempts > 5) {
      throw new HttpException(
        'Too many onboarding attempts. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const partnerApiUrl = this.config.getOrThrow<string>(
      'GUPSHUP_PARTNER_API_URL',
    );
    const partnerKey = this.config.getOrThrow<string>('GUPSHUP_PARTNER_KEY');
    const partnerId = this.config.getOrThrow<string>('GUPSHUP_PARTNER_ID');

    // Step 1 — Create WABA
    const wabaRes = await this.gupshupPost(
      `${partnerApiUrl}/partner/accounts`,
      {
        apikey: partnerKey,
        'partner-id': partnerId,
        'Content-Type': 'application/json',
      },
      JSON.stringify({
        name: dto.displayName,
        phone,
        category: dto.category,
        description: dto.description,
        website: dto.website ?? '',
      }),
    );

    const { appId, apiKey } = wabaRes as { appId: string; apiKey: string };

    // Step 2 — Register phone number
    await this.gupshupPost(
      `${partnerApiUrl}/partner/phone-numbers`,
      { apikey: partnerKey, 'Content-Type': 'application/json' },
      JSON.stringify({ appId, phone }),
    );

    // Step 3 — Encrypt API key before persisting
    const encryptedApiKey = encrypt(apiKey);

    // Step 4 — Update tenant
    await this.tenantRepo.update(tenantId, {
      gupshupAppId: appId,
      gupshupApiKey: encryptedApiKey,
      waPhoneNumber: phone,
      waDisplayName: dto.displayName,
      waBusinessCategory: dto.category,
      waBusinessDescription: dto.description,
      waBusinessWebsite: dto.website ?? null,
      waVerificationStatus: WaVerificationStatus.AWAITING_REPLY,
    });

    await this.invalidateCache(tenantId);

    this.logger.log(
      `WA onboarding initiated for tenant=${tenantId} phone=${this.maskPhone(phone)}`,
    );

    return { message: 'Verification message sent. Check your WhatsApp.' };
  }

  // ── handleVerificationReply ────────────────────────────────────────────────

  async handleVerificationReply(payload: GupshupWebhookPayload): Promise<void> {
    const messageText = payload.payload.payload.text ?? '';
    if (messageText.toLowerCase().trim() !== 'yes') return;

    const appId = payload.app;
    const tenant = await this.tenantRepo.findOne({
      where: { gupshupAppId: appId },
    });
    if (!tenant) return;

    await this.tenantRepo.update(tenant.id, {
      waVerificationStatus: WaVerificationStatus.VERIFIED,
      waVerifiedAt: new Date(),
    });

    await this.invalidateCache(tenant.id);

    void this.redis
      .del(
        `dashboard:summary:${tenant.id}`,
        `dashboard:top-spenders:${tenant.id}`,
      )
      .catch(() => null);

    waEvents.emit('wa.verified', { tenantId: tenant.id });
    this.logger.log(`WA verified for tenant=${tenant.id}`);
  }

  // ── getStatus ──────────────────────────────────────────────────────────────

  async getStatus(tenantId: string): Promise<WaStatusResponse> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) {
      return {
        isConnected: false,
        verificationStatus: WaVerificationStatus.PENDING,
        displayName: null,
        phoneNumber: null,
        category: null,
        verifiedAt: null,
      };
    }
    return this.toStatusResponse(tenant);
  }

  // ── resendVerification ────────────────────────────────────────────────────

  async resendVerification(tenantId: string): Promise<{ message: string }> {
    const key = `wa:resend:${tenantId}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 3600);
    if (count > 3) {
      throw new HttpException(
        'Maximum 3 resend attempts per hour',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant?.waPhoneNumber) {
      throw new BadRequestException('No phone number registered');
    }

    const partnerApiUrl = this.config.getOrThrow<string>(
      'GUPSHUP_PARTNER_API_URL',
    );
    const partnerKey = this.config.getOrThrow<string>('GUPSHUP_PARTNER_KEY');

    await this.gupshupPost(
      `${partnerApiUrl}/partner/phone-numbers`,
      { apikey: partnerKey, 'Content-Type': 'application/json' },
      JSON.stringify({
        appId: tenant.gupshupAppId,
        phone: tenant.waPhoneNumber,
      }),
    );

    return { message: 'Verification message resent' };
  }

  // ── disconnect ────────────────────────────────────────────────────────────

  async disconnect(tenantId: string): Promise<{ message: string }> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (tenant?.gupshupAppId) {
      const partnerApiUrl = this.config.getOrThrow<string>(
        'GUPSHUP_PARTNER_API_URL',
      );
      const partnerKey = this.config.getOrThrow<string>('GUPSHUP_PARTNER_KEY');
      try {
        await this.gupshupPost(
          `${partnerApiUrl}/partner/accounts/${tenant.gupshupAppId}/disconnect`,
          { apikey: partnerKey, 'Content-Type': 'application/json' },
          '{}',
        );
      } catch {
        // Log but don't fail if Gupshup API call fails — still clear local state
        this.logger.warn(
          `Gupshup disconnect call failed for tenant=${tenantId}`,
        );
      }
    }

    await this.tenantRepo.update(tenantId, {
      gupshupAppId: null,
      gupshupApiKey: null,
      waPhoneNumber: null,
      waDisplayName: null,
      waVerificationStatus: WaVerificationStatus.PENDING,
      waVerifiedAt: null,
    });

    await this.invalidateCache(tenantId);
    return { message: 'WhatsApp disconnected successfully' };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async gupshupPost(
    url: string,
    headers: Record<string, string>,
    body: string,
  ): Promise<unknown> {
    const res = await fetch(url, { method: 'POST', headers, body });
    const data = (await res.json()) as unknown;

    if (res.status === 400) {
      throw new BadRequestException(
        'Gupshup rejected the request — check phone number format',
      );
    }
    if (res.status === 401) {
      this.logger.error(`Gupshup 401 — invalid partner credentials`);
      throw new InternalServerErrorException(
        'BSP authentication error — contact support',
      );
    }
    if (res.status === 409) {
      throw new ConflictException(
        'This number is already connected to another WhatsApp Business account',
      );
    }
    if (res.status >= 500) {
      this.logger.error(`Gupshup 5xx: ${JSON.stringify(data)}`);
      throw new BadGatewayException('WhatsApp BSP is unavailable');
    }
    return data;
  }

  private maskPhone(phone: string | null): string | null {
    if (!phone) return null;
    if (phone.length <= 9) return phone;
    return phone.slice(0, 7) + '****' + phone.slice(-2);
  }

  private toStatusResponse(tenant: Tenant): WaStatusResponse {
    return {
      isConnected:
        tenant.waVerificationStatus === WaVerificationStatus.VERIFIED,
      verificationStatus: tenant.waVerificationStatus,
      displayName: tenant.waDisplayName ?? null,
      phoneNumber: this.maskPhone(tenant.waPhoneNumber),
      category: tenant.waBusinessCategory ?? null,
      verifiedAt: tenant.waVerifiedAt ?? null,
    };
  }

  private async invalidateCache(tenantId: string): Promise<void> {
    await Promise.all([
      this.redis.del(`tenant:${tenantId}`),
      this.redis.del(`tenant:full:${tenantId}`),
    ]);
  }

  // Exposed for HMAC signature verification in the controller
  static verifyWebhookSignature(
    rawBody: Buffer,
    signatureHeader: string,
    secret: string,
  ): boolean {
    const computed = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');
    const expected = Buffer.from(computed);
    const received = Buffer.from(signatureHeader);
    if (expected.length !== received.length) return false;
    return crypto.timingSafeEqual(expected, received);
  }
}
