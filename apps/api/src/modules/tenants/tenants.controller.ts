import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';
import 'multer';
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
  // Polled by the sidebar, layout, and onboarding wizard on every page —
  // the shared per-route throttler buckets (30/min) are far too tight for
  // this and were causing 429s and a slow/janky login → dashboard transition.
  @SkipThrottle()
  getMe(@Req() req: { user: RequestUser }) {
    return this.tenantsService.getTenantFull(
      req.user.tenantId,
      req.user.userId,
    );
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

  @Get('qr-code')
  @Roles(UserRole.OWNER)
  getQrCode(@Req() req: { user: RequestUser }, @Query('force') force?: string) {
    return this.tenantsService.getOrGenerateQrCode(
      req.user.tenantId,
      force === 'true',
    );
  }

  @Post('logo')
  @Roles(UserRole.OWNER)
  @UseInterceptors(FileInterceptor('file', { storage: undefined }))
  uploadLogo(
    @Req() req: { user: RequestUser },
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.tenantsService.uploadLogo(req.user.tenantId, file);
  }
}
