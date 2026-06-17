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
import { UsersService } from './users.service';

@ApiTags('Users')
@Controller('users')
@Roles(UserRole.OWNER, UserRole.MANAGER)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('cashiers')
  listCashiers(@Req() req: { user: RequestUser }) {
    return this.usersService.listCashiers(req.user.tenantId);
  }

  @Post('cashiers')
  @HttpCode(HttpStatus.CREATED)
  createCashier(
    @Req() req: { user: RequestUser },
    @Body() dto: CreateCashierDto,
  ) {
    return this.usersService.createCashier(req.user.tenantId, dto);
  }

  @Patch('cashiers/:id')
  updateCashier(
    @Req() req: { user: RequestUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCashierDto,
  ) {
    return this.usersService.updateCashier(req.user.tenantId, id, dto);
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
