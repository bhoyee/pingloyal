import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { RequestUser } from '@pingloyal/types';
import 'multer';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SkipSubscriptionCheck } from '../../common/decorators/skip-subscription-check.decorator';
import { SupportService } from './support.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { CreateMessageDto } from './dto/create-message.dto';

// Support must stay reachable even for suspended/cancelled tenants — that's
// exactly when they're most likely to need it.
@Controller('support')
@SkipSubscriptionCheck()
export class SupportController {
  constructor(private readonly support: SupportService) {}

  // FileInterceptor no-ops on non-multipart requests, so this route still
  // accepts plain JSON bodies for the (common) no-attachment case.
  @Post('tickets')
  @UseInterceptors(FileInterceptor('file', { storage: undefined }))
  createTicket(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateTicketDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.support.createTicket(tenantId, user.userId, dto, file);
  }

  @Get('tickets')
  findAll(@CurrentTenant() tenantId: string) {
    return this.support.findAllForTenant(tenantId);
  }

  @Get('unread-count')
  async getUnreadCount(@CurrentTenant() tenantId: string) {
    const count = await this.support.getUnreadCountForTenant(tenantId);
    return { count };
  }

  @Get('tickets/:id')
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.support.findOneForTenant(tenantId, id);
  }

  @Post('tickets/:id/reopen')
  reopenTicket(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.support.reopenTicket(tenantId, id);
  }

  @Post('tickets/:id/messages')
  addMessage(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: CreateMessageDto,
  ) {
    return this.support.addTenantMessage(tenantId, user.userId, id, dto);
  }
}
