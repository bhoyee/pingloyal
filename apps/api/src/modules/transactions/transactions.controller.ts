import { Throttle } from '@nestjs/throttler';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { UserRole } from '@pingloyal/types';
import type { RequestUser } from '@pingloyal/types';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  TransactionsService,
  type ListTransactionsQuery,
} from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';

@Controller()
export class TransactionsController {
  constructor(private readonly txService: TransactionsService) {}

  // ── POST /transactions ──────────────────────────────────────────────────────

  @Post('transactions')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.CASHIER)
  @Throttle({ transactions: { ttl: 60_000, limit: 120 } })
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateTransactionDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.txService.create(user.tenantId, user.userId, dto);
    if (result.alreadyProcessed) {
      res.status(HttpStatus.OK);
    }
    return result;
  }

  // ── GET /transactions ───────────────────────────────────────────────────────

  @Get('transactions')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  findAll(
    @CurrentUser() user: RequestUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('customerId') customerId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const query: ListTransactionsQuery = {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      customerId,
      categoryId,
      startDate,
      endDate,
    };
    return this.txService.findAll(user.tenantId, query);
  }

  // ── GET /transactions/:id ───────────────────────────────────────────────────

  @Get('transactions/:id')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.CASHIER)
  findById(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.txService.findById(user.tenantId, id);
  }

  // ── GET /customers/:customerId/transactions ─────────────────────────────────

  @Get('customers/:customerId/transactions')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.CASHIER)
  findByCustomer(
    @CurrentUser() user: RequestUser,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.txService.findByCustomer(user.tenantId, customerId, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
