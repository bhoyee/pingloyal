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
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '@pingloyal/types';
import type { RequestUser } from '@pingloyal/types';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateCashierDto } from './dto/create-cashier.dto';
import { UpdateCashierDto } from './dto/update-cashier.dto';
import { ResetCashierPasswordDto } from './dto/reset-cashier-password.dto';
import { UsersService } from './users.service';
import { ActivityLogService } from '../activity-log/activity-log.service';

@ApiTags('Users')
@Controller('users')
@Roles(UserRole.OWNER, UserRole.MANAGER)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly activityLogService: ActivityLogService,
  ) {}

  @Get('cashiers')
  listCashiers(@Req() req: { user: RequestUser }) {
    return this.usersService.listCashiers(req.user.tenantId);
  }

  @Post('cashiers')
  @HttpCode(HttpStatus.CREATED)
  async createCashier(
    @Req() req: { user: RequestUser },
    @Body() dto: CreateCashierDto,
  ) {
    const result = await this.usersService.createCashier(req.user.tenantId, dto);
    void this.activityLogService.log({
      tenantId: req.user.tenantId,
      actorId: req.user.userId,
      actorRole: req.user.role,
      action: 'cashier.created',
      entityType: 'user',
      entityId: result.id,
      description: `Cashier account created for ${result.fullName} (${result.email})`,
    });
    return result;
  }

  @Patch('cashiers/:id')
  async updateCashier(
    @Req() req: { user: RequestUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCashierDto,
  ) {
    const result = await this.usersService.updateCashier(req.user.tenantId, id, dto);
    if (dto.isActive !== undefined) {
      void this.activityLogService.log({
        tenantId: req.user.tenantId,
        actorId: req.user.userId,
        actorRole: req.user.role,
        action: dto.isActive ? 'cashier.activated' : 'cashier.deactivated',
        entityType: 'user',
        entityId: id,
        description: `Cashier ${result.fullName} ${dto.isActive ? 'activated' : 'deactivated'}`,
      });
    }
    return result;
  }

  @Patch('cashiers/:id/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetCashierPassword(
    @Req() req: { user: RequestUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetCashierPasswordDto,
  ) {
    await this.usersService.resetCashierPassword(req.user.tenantId, id, dto.newPassword);
    void this.activityLogService.log({
      tenantId: req.user.tenantId,
      actorId: req.user.userId,
      actorRole: req.user.role,
      action: 'cashier.password_reset',
      entityType: 'user',
      entityId: id,
      description: `Password reset for cashier account`,
    });
  }

  @Delete('cashiers/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteCashier(
    @Req() req: { user: RequestUser },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.usersService.deleteCashier(req.user.tenantId, id);
  }
}
