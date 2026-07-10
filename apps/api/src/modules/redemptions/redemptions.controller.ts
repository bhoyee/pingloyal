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
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.CASHIER)
  findAll(
    @CurrentUser() user: RequestUser,
    @Query('customerId') customerId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.redemptionsService.getRedemptions(user.tenantId, {
      customerId,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      startDate,
      endDate,
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
