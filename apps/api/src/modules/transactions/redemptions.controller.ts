import { Controller, Get, Query } from '@nestjs/common';
import { UserRole } from '@pingloyal/types';
import type { RequestUser } from '@pingloyal/types';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RedemptionsService } from './redemptions.service';

@Controller('redemptions')
export class RedemptionsController {
  constructor(private readonly redemptionsService: RedemptionsService) {}

  @Get()
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.CASHIER)
  findAll(
    @CurrentUser() user: RequestUser,
    @Query('customerId') customerId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.redemptionsService.findAll(user.tenantId, {
      customerId,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
