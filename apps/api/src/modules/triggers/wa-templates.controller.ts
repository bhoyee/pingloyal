import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
} from '@nestjs/common';
import { UserRole } from '@pingloyal/types';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { UpdateWaTemplateDto } from './dto/update-wa-template.dto';
import { WaTemplatesService } from './wa-templates.service';

@Controller('wa-templates')
export class WaTemplatesController {
  constructor(private readonly waTemplatesService: WaTemplatesService) {}

  @Get()
  findAll(@CurrentTenant() tenantId: string) {
    return this.waTemplatesService.findAll(tenantId);
  }

  @Patch(':triggerType')
  @Roles(UserRole.OWNER)
  upsert(
    @CurrentTenant() tenantId: string,
    @Param('triggerType') triggerType: string,
    @Body() dto: UpdateWaTemplateDto,
  ) {
    return this.waTemplatesService.upsert(tenantId, triggerType, dto.body);
  }

  @Delete(':triggerType')
  @Roles(UserRole.OWNER)
  @HttpCode(HttpStatus.OK)
  reset(
    @CurrentTenant() tenantId: string,
    @Param('triggerType') triggerType: string,
  ) {
    return this.waTemplatesService.reset(tenantId, triggerType);
  }
}
