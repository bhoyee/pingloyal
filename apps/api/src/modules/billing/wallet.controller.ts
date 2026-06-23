import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Inject,
  Logger,
  ParseIntPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import type Redis from 'ioredis';
import { UserRole, WalletTransactionType } from '@pingloyal/types';
import type { RequestUser } from '@pingloyal/types';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipSubscriptionCheck } from '../../common/decorators/skip-subscription-check.decorator';
import { REDIS_CLIENT } from '../../common/redis/redis.constants';
import { WalletService } from './wallet.service';
import { Subscription } from './entities/subscription.entity';
import { User } from '../auth/entities/user.entity';
import { WalletTransaction } from './entities/wallet-transaction.entity';
import { WalletTopupDto } from './dto/wallet-topup.dto';

interface PaystackInitResponse {
  status: boolean;
  data: { authorization_url: string; reference: string };
}

@Controller('billing/wallet')
@Roles(UserRole.OWNER)
@SkipSubscriptionCheck()
export class WalletController {
  private readonly logger = new Logger(WalletController.name);

  constructor(
    private readonly walletService: WalletService,
    private readonly config: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Subscription)
    private readonly subRepo: Repository<Subscription>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // ── GET /billing/wallet/balance ─────────────────────────────────────────────

  @Get('balance')
  async getBalance(@Req() req: { user: RequestUser }) {
    const tenantId = req.user.tenantId;
    const cacheKey = `wallet:balance:${tenantId}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as object;

    const sub = await this.subRepo.findOne({ where: { tenantId } });
    const ratePerMessage = Number(sub?.marketingRate ?? 130);

    const [balance, { totalSpend, messageCount }, breakdown] = await Promise.all([
      this.walletService.getBalance(tenantId),
      this.walletService.getMonthlySpend(tenantId),
      this.walletService.getMonthlyBreakdown(tenantId),
    ]);

    const response = {
      balance,
      ratePerMessage,
      estimatedMessagesLeft: Math.floor(balance / ratePerMessage),
      thisMonthSpend: totalSpend,
      thisMonthMessageCount: messageCount,
      isLow: balance < 3000,
      isEmpty: balance <= 0,
      breakdown,
    };

    await this.redis
      .set(cacheKey, JSON.stringify(response), 'EX', 30)
      .catch(() => null);

    return response;
  }

  // ── GET /billing/wallet/transactions ───────────────────────────────────────

  @Get('transactions')
  async getTransactions(
    @Req() req: { user: RequestUser },
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('type') type?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('minAmount') minAmount?: string,
    @Query('maxAmount') maxAmount?: string,
    @Query('search') search?: string,
  ) {
    const tenantId = req.user.tenantId;
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(200, Math.max(1, limit));
    const offset = (safePage - 1) * safeLimit;

    const qb = this.dataSource
      .getRepository(WalletTransaction)
      .createQueryBuilder('wt')
      .where('wt.tenantId = :tenantId', { tenantId })
      .orderBy('wt.createdAt', 'DESC')
      .limit(safeLimit)
      .offset(offset);

    if (
      type &&
      Object.values(WalletTransactionType).includes(
        type as WalletTransactionType,
      )
    ) {
      qb.andWhere('wt.type = :type', { type });
    }

    if (startDate) {
      const d = new Date(startDate);
      if (!isNaN(d.getTime())) {
        d.setHours(0, 0, 0, 0);
        qb.andWhere('wt.createdAt >= :startDate', { startDate: d });
      }
    }

    if (endDate) {
      const d = new Date(endDate);
      if (!isNaN(d.getTime())) {
        d.setHours(23, 59, 59, 999);
        qb.andWhere('wt.createdAt <= :endDate', { endDate: d });
      }
    }

    const min = minAmount !== undefined ? parseFloat(minAmount) : NaN;
    if (!isNaN(min)) {
      qb.andWhere('ABS(wt.amount) >= :minAmount', { minAmount: min });
    }

    const max = maxAmount !== undefined ? parseFloat(maxAmount) : NaN;
    if (!isNaN(max)) {
      qb.andWhere('ABS(wt.amount) <= :maxAmount', { maxAmount: max });
    }

    if (search?.trim()) {
      qb.andWhere('wt.description ILIKE :search', {
        search: `%${search.trim()}%`,
      });
    }

    const [transactions, total] = await qb.getManyAndCount();

    return { transactions, total, page: safePage, limit: safeLimit };
  }

  // ── POST /billing/wallet/topup ─────────────────────────────────────────────

  @Post('topup')
  async initiateTopup(
    @Req() req: { user: RequestUser },
    @Body() dto: WalletTopupDto,
  ) {
    const tenantId = req.user.tenantId;
    const paystackKey = this.config.getOrThrow<string>('PAYSTACK_SECRET_KEY');
    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? '';

    const owner = await this.userRepo.findOne({
      where: { tenantId, role: UserRole.OWNER },
    });
    if (!owner) throw new BadRequestException('Owner not found');

    const initRes = await fetch(
      'https://api.paystack.co/transaction/initialize',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${paystackKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: owner.email,
          amount: dto.amount * 100,
          currency: 'NGN',
          callback_url: `${frontendUrl}/billing/wallet?topup=success`,
          metadata: {
            type: 'wallet_topup',
            tenantId,
            amount: dto.amount,
            initiatedBy: req.user.userId,
          },
        }),
      },
    );

    const initData = (await initRes.json()) as PaystackInitResponse;

    if (!initData.status || !initData.data?.authorization_url) {
      this.logger.error(`Paystack init failed for tenant ${tenantId}`);
      throw new BadRequestException('Failed to initiate payment. Try again.');
    }

    const { authorization_url, reference } = initData.data;

    await this.redis.set(
      `billing:wallet:pending:${reference}`,
      JSON.stringify({ tenantId, amount: dto.amount }),
      'EX',
      3600,
    );

    return {
      authorizationUrl: authorization_url,
      reference,
      amount: dto.amount,
      amountDisplay: `₦${dto.amount.toLocaleString()}`,
    };
  }
}
