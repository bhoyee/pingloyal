import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { UserRole } from '@pingloyal/types';
import type { RequestUser } from '@pingloyal/types';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RedemptionsService } from './redemptions.service';
import { CreateRedemptionDto } from './dto/create-redemption.dto';

@Controller('redemptions')
export class RedemptionsController {
  constructor(private readonly redemptionsService: RedemptionsService) {}

  @Post()
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.CASHIER)
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateRedemptionDto) {
    return this.redemptionsService.createRedemption(
      user.tenantId,
      user.userId,
      dto,
    );
  }

  @Get()
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  findAll(
    @CurrentUser() user: RequestUser,
    @Query('customerId') customerId?: string,
    @Query('cashierId') cashierId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    const VALID_SORT = ['redeemedAt', 'pointsRedeemed', 'value'] as const;
    type SortField = (typeof VALID_SORT)[number];
    const resolvedSort = VALID_SORT.includes(sortBy as SortField)
      ? (sortBy as SortField)
      : 'redeemedAt';

    return this.redemptionsService.getRedemptions(user.tenantId, {
      customerId,
      cashierId,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      startDate,
      endDate,
      sortBy: resolvedSort,
      sortOrder: sortOrder === 'ASC' ? 'ASC' : 'DESC',
    });
  }

  @Get('stats')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  getStats(
    @CurrentUser() user: RequestUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.redemptionsService.getStats(user.tenantId, {
      startDate,
      endDate,
    });
  }
}
