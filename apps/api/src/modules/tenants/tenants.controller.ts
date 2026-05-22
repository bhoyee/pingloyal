import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { UserRole } from '@pingloyal/types';
import type { RequestUser } from '@pingloyal/types';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipSubscriptionCheck } from '../../common/decorators/skip-subscription-check.decorator';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { UpsertTierConfigDto } from './dto/upsert-tier-config.dto';
import { TenantsService } from './tenants.service';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get('me')
  @SkipSubscriptionCheck()
  getMe(@Req() req: { user: RequestUser }) {
    return this.tenantsService.getTenantFull(req.user.tenantId);
  }

  @Patch('settings')
  @Roles(UserRole.OWNER)
  updateSettings(
    @Req() req: { user: RequestUser },
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.tenantsService.updateSettings(req.user.tenantId, dto);
  }

  @Get('categories')
  getCategories(@Req() req: { user: RequestUser }) {
    return this.tenantsService.getCategories(req.user.tenantId);
  }

  @Post('categories')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  createCategory(
    @Req() req: { user: RequestUser },
    @Body() dto: CreateCategoryDto,
  ) {
    return this.tenantsService.createCategory(req.user.tenantId, dto);
  }

  @Put('tier-config')
  @Roles(UserRole.OWNER)
  upsertTierConfig(
    @Req() req: { user: RequestUser },
    @Body() dto: UpsertTierConfigDto,
  ) {
    return this.tenantsService.upsertTierConfig(req.user.tenantId, dto);
  }

  @Get('tier-config')
  getTierConfig(@Req() req: { user: RequestUser }) {
    return this.tenantsService.getTierConfig(req.user.tenantId);
  }

  // Must be declared before any future :id routes to avoid shadowing
  @Get('whatsapp/status')
  @Roles(UserRole.OWNER)
  getWhatsappStatus(@Req() req: { user: RequestUser }) {
    return this.tenantsService.getWhatsappStatus(req.user.tenantId);
  }
}
