import { Controller, Get, Req } from '@nestjs/common';
import { UserRole } from '@pingloyal/types';
import type { RequestUser } from '@pingloyal/types';
import { Roles } from '../../common/decorators/roles.decorator';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@Roles(UserRole.OWNER, UserRole.MANAGER)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  getSummary(@Req() req: { user: RequestUser }) {
    return this.dashboardService.getSummary(req.user.tenantId);
  }

  @Get('top-spenders')
  getTopSpenders(@Req() req: { user: RequestUser }) {
    return this.dashboardService.getTopSpenders(req.user.tenantId);
  }
}
