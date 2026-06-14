import { Controller, Get, Req } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { UserRole } from '@pingloyal/types';
import type { RequestUser } from '@pingloyal/types';
import { Roles } from '../../common/decorators/roles.decorator';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@Roles(UserRole.OWNER, UserRole.MANAGER)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  // Polled by the sidebar (customer count, wallet balance) on every page —
  // the shared per-route throttler buckets (30/min) are far too tight for
  // this and were causing 429s during normal navigation.
  @Get('summary')
  @SkipThrottle()
  getSummary(@Req() req: { user: RequestUser }) {
    return this.dashboardService.getSummary(req.user.tenantId);
  }

  @Get('top-spenders')
  @SkipThrottle()
  getTopSpenders(@Req() req: { user: RequestUser }) {
    return this.dashboardService.getTopSpenders(req.user.tenantId);
  }
}
