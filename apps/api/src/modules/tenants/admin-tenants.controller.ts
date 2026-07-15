import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Public } from '../../common/decorators/public.decorator';
import { SkipSubscriptionCheck } from '../../common/decorators/skip-subscription-check.decorator';
import { StaffAuthGuard } from '../staff-auth/guards/staff-auth.guard';
import { PlanTier, SubscriptionStatus } from '@pingloyal/types';
import { TenantsService } from './tenants.service';

export class AdminCreateTenantDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  businessName: string;

  @IsEmail()
  ownerEmail: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  ownerFullName: string;

  @IsOptional()
  @IsEnum(PlanTier)
  planTier?: PlanTier;
}

export class AdminUpdateTenantDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  businessName?: string;

  @IsOptional()
  @IsEnum(PlanTier)
  planTier?: PlanTier;

  @IsOptional()
  @IsEnum(SubscriptionStatus)
  subscriptionStatus?: SubscriptionStatus;
}

@Controller('staff/tenants')
@Public()
@SkipSubscriptionCheck()
@UseGuards(StaffAuthGuard)
export class AdminTenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get('stats')
  getStats() {
    return this.tenantsService.adminGetStats();
  }

  @Get()
  list(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
  ) {
    return this.tenantsService.adminListTenants({
      search,
      status,
      page: page ? Math.max(1, parseInt(page, 10)) : 1,
    });
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.tenantsService.adminGetTenant(id);
  }

  @Post()
  create(@Body() dto: AdminCreateTenantDto) {
    return this.tenantsService.adminCreateTenant(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: AdminUpdateTenantDto) {
    return this.tenantsService.adminUpdateTenant(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.tenantsService.adminDeleteTenant(id);
  }
}
