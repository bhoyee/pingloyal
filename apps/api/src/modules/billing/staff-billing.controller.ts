import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { SkipSubscriptionCheck } from '../../common/decorators/skip-subscription-check.decorator';
import { StaffAuthGuard } from '../staff-auth/guards/staff-auth.guard';
import { StaffRolesGuard } from '../staff-auth/guards/staff-roles.guard';
import { BillingService } from './billing.service';

// Read-only — both staff roles. No itemized payment history here: WebhookEvent
// is a dedup ledger (provider/eventId/eventType only, no tenant linkage), not
// a payments table, so it can't be filtered per-tenant. A true invoice/payment
// history view would need its own entity — out of scope for this endpoint.
@Controller('staff/tenants/:tenantId/billing')
@Public()
@SkipSubscriptionCheck()
@UseGuards(StaffAuthGuard, StaffRolesGuard)
export class StaffBillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('status')
  getStatus(@Param('tenantId') tenantId: string) {
    return this.billingService.getStatus(tenantId);
  }
}
