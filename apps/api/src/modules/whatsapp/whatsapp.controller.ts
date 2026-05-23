import * as crypto from 'crypto';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@pingloyal/types';
import type { RequestUser } from '@pingloyal/types';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipSubscriptionCheck } from '../../common/decorators/skip-subscription-check.decorator';
import { WaOnboardingDto } from './dto/wa-onboarding.dto';
import type { GupshupWebhookPayload } from './wa-onboarding.service';
import { WaOnboardingService } from './wa-onboarding.service';

@Controller('whatsapp')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(
    private readonly onboardingService: WaOnboardingService,
    private readonly config: ConfigService,
  ) {}

  @Post('onboarding/initiate')
  @Roles(UserRole.OWNER)
  initiate(@Req() req: { user: RequestUser }, @Body() dto: WaOnboardingDto) {
    return this.onboardingService.initiateOnboarding(req.user.tenantId, dto);
  }

  @Get('onboarding/status')
  @Roles(UserRole.OWNER)
  @SkipSubscriptionCheck()
  getStatus(@Req() req: { user: RequestUser }) {
    return this.onboardingService.getStatus(req.user.tenantId);
  }

  @Post('onboarding/resend')
  @Roles(UserRole.OWNER)
  resend(@Req() req: { user: RequestUser }) {
    return this.onboardingService.resendVerification(req.user.tenantId);
  }

  @Delete('disconnect')
  @Roles(UserRole.OWNER)
  disconnect(@Req() req: { user: RequestUser }) {
    return this.onboardingService.disconnect(req.user.tenantId);
  }

  // ── Gupshup inbound webhook ─────────────────────────────────────────────────
  // PUBLIC — no JWT auth. Gupshup retries on non-200, so we always return 200.

  @Post('webhook/gupshup')
  @Public()
  @SkipSubscriptionCheck()
  @HttpCode(HttpStatus.OK)
  async gupshupWebhook(
    @Req() req: { rawBody?: Buffer; body: GupshupWebhookPayload },
  ) {
    // Signature verification
    const sigHeader = (req as unknown as Record<string, Record<string, string>>)
      .headers?.['x-gupshup-signature'];

    if (sigHeader && req.rawBody) {
      const secret = this.config.getOrThrow<string>('WA_APP_SECRET');
      const valid = WaOnboardingService.verifyWebhookSignature(
        req.rawBody,
        sigHeader,
        secret,
      );
      if (!valid) {
        throw new UnauthorizedException('Invalid webhook signature');
      }
    }

    try {
      const payload = req.body;
      await this.onboardingService.handleVerificationReply(payload);
    } catch (err) {
      // Always return 200 to Gupshup — never let errors cause retries
      this.logger.error(
        `Webhook handler error: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }

    return { status: 'ok' };
  }

  // ── Webhook signature helper (used in tests) ────────────────────────────────

  static computeSignature(rawBody: Buffer, secret: string): string {
    return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  }
}
