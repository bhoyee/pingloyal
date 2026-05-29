import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { UserRole } from '@pingloyal/types';
import type { RequestUser } from '@pingloyal/types';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { ScheduleCampaignDto } from './dto/schedule-campaign.dto';
import { SegmentRulesDto } from './dto/segment-rules.dto';

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateCampaignDto,
  ) {
    return this.campaignsService.create(tenantId, dto, user.userId);
  }

  @Get()
  findAll(@CurrentTenant() tenantId: string) {
    return this.campaignsService.findAll(tenantId);
  }

  // audience-preview must be declared before :id to prevent route conflict
  @Get('audience-preview')
  audiencePreview(
    @CurrentTenant() tenantId: string,
    @Query() query: SegmentRulesDto,
  ) {
    return this.campaignsService.audiencePreview(tenantId, query);
  }

  @Get(':id')
  findOne(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.campaignsService.findOne(tenantId, id);
  }

  @Patch(':id')
  update(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.campaignsService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.campaignsService.remove(tenantId, id);
  }

  @Post(':id/send')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  send(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.campaignsService.send(tenantId, id);
  }

  @Post(':id/schedule')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  schedule(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ScheduleCampaignDto,
  ) {
    return this.campaignsService.schedule(tenantId, id, dto);
  }

  @Post(':id/cancel')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  cancel(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.campaignsService.cancel(tenantId, id);
  }

  @Get(':id/stats')
  stats(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.campaignsService.stats(tenantId, id);
  }
}

@Controller('templates')
export class TemplatesController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  getTemplates() {
    return this.campaignsService.getTemplates();
  }
}
