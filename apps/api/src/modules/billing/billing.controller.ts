import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '@pingloyal/types';
import type { RequestUser } from '@pingloyal/types';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipSubscriptionCheck } from '../../common/decorators/skip-subscription-check.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { BillingService } from './billing.service';
import { Tenant } from '../tenants/entities/tenant.entity';

@Controller('billing')
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(private readonly billingService: BillingService) {}

  @Get('plans')
  @Roles(UserRole.OWNER)
  @SkipSubscriptionCheck()
  getPlans(@Req() req: { user: RequestUser; tenantEntity?: Tenant }) {
    const tenantCurrency =
      (req as unknown as { tenantCurrency?: string }).tenantCurrency ?? 'NGN';
    const currentPlanTier =
      (req as unknown as { currentPlanTier?: string }).currentPlanTier ??
      'starter';
    return this.billingService.getPlans(tenantCurrency, currentPlanTier);
  }

  @Get('status')
  @Roles(UserRole.OWNER)
  @SkipSubscriptionCheck()
  getStatus(@Req() req: { user: RequestUser }) {
    return this.billingService.getStatus(req.user.tenantId);
  }

  @Post('subscribe')
  @Roles(UserRole.OWNER)
  @SkipSubscriptionCheck()
  subscribe(
    @Req() req: { user: RequestUser },
    @Body() body: { planId: string },
  ) {
    return this.billingService.subscribe(
      req.user.tenantId,
      body.planId,
      req.user.userId,
    );
  }

  @Post('webhook/paystack')
  @Public()
  @SkipSubscriptionCheck()
  @HttpCode(HttpStatus.OK)
  async paystackWebhook(
    @Req()
    req: {
      rawBody?: Buffer;
      headers: Record<string, string>;
      body: unknown;
    },
  ) {
    const sig = req.headers['x-paystack-signature'] ?? '';
    try {
      await this.billingService.handlePaystackWebhook(
        req.rawBody ?? Buffer.alloc(0),
        sig,
      );
    } catch (err) {
      if (err instanceof Error && err.message.includes('signature')) {
        throw new UnauthorizedException('Invalid webhook signature');
      }
      this.logger.error(`Paystack webhook error: ${String(err)}`);
    }
    return { received: true };
  }

  @Post('webhook/stripe')
  @Public()
  @SkipSubscriptionCheck()
  @HttpCode(HttpStatus.OK)
  async stripeWebhook(
    @Req()
    req: {
      rawBody?: Buffer;
      headers: Record<string, string>;
      body: unknown;
    },
  ) {
    const sig = req.headers['stripe-signature'] ?? '';
    try {
      await this.billingService.handleStripeWebhook(
        req.rawBody ?? Buffer.alloc(0),
        sig,
      );
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error(`Stripe webhook error: ${String(err)}`);
    }
    return { received: true };
  }
}
