import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { UserRole } from '@pingloyal/types';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '@pingloyal/types';
import { CreateTemplateRequestDto } from './dto/create-template-request.dto';
import { TemplateRequestsService } from './template-requests.service';
import { TenantsService } from '../tenants/tenants.service';

@Controller('template-requests')
export class TemplateRequestsController {
  constructor(
    private readonly service: TemplateRequestsService,
    private readonly tenantsService: TenantsService,
  ) {}

  @Post()
  @Roles(UserRole.OWNER)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateTemplateRequestDto,
  ) {
    const tenant = await this.tenantsService.findOne(tenantId);
    return this.service.create(tenantId, tenant.businessName, dto);
  }

  @Get()
  @Roles(UserRole.OWNER)
  findAll(@CurrentTenant() tenantId: string) {
    return this.service.findAll(tenantId);
  }
}
