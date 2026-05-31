import { Controller, Get, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@pingloyal/types';
import type { RequestUser } from '@pingloyal/types';
import { Roles } from '../../common/decorators/roles.decorator';
import { DashboardService } from './dashboard.service';
import { ThrottleConfigs } from '../../common/throttle/throttle.config';

@Controller('dashboard')
@Roles(UserRole.OWNER, UserRole.MANAGER)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @Throttle(ThrottleConfigs.DASHBOARD)
  getSummary(@Req() req: { user: RequestUser }) {
    return this.dashboardService.getSummary(req.user.tenantId);
  }

  @Get('top-spenders')
  @Throttle(ThrottleConfigs.DASHBOARD)
  getTopSpenders(@Req() req: { user: RequestUser }) {
    return this.dashboardService.getTopSpenders(req.user.tenantId);
  }
}
