import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { DataSource } from 'typeorm';
import { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { TriggerType, WalletTransactionType } from '@pingloyal/types';
import { REDIS_CLIENT } from '../../common/redis/redis.constants';
import { Tenant } from '../tenants/entities/tenant.entity';
import { WalletTransaction } from './entities/wallet-transaction.entity';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Optional()
    @InjectQueue('wa-messages')
    private readonly waMessagesQueue?: Queue,
  ) {}

  async deductMarketing(
    tenantId: string,
    triggerType: TriggerType,
    amount: number,
    description: string,
    refId?: string | null,
  ): Promise<{ success: boolean; newBalance: number }> {
    const result = await this.dataSource.transaction(async (em) => {
      const tenant = await em.findOne(Tenant, {
        where: { id: tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!tenant) return { success: false, newBalance: 0 };

      const current = Number(tenant.marketingWalletBalance);
      if (current < amount) return { success: false, newBalance: current };

      const newBalance = parseFloat((current - amount).toFixed(2));
      await em.update(
        Tenant,
        { id: tenantId },
        { marketingWalletBalance: newBalance },
      );

      await em.save(
        em.create(WalletTransaction, {
          tenantId,
          type: this.toWalletTxType(triggerType),
          amount: -amount,
          balanceAfter: newBalance,
          description,
          refId: refId ?? null,
          paystackRef: null,
        }),
      );

      return { success: true, newBalance };
    });

    if (result.success) {
      void this.redis.del(`wallet:balance:${tenantId}`).catch(() => null);
      await this.checkLowBalanceAlert(tenantId, result.newBalance).catch(
        (err) => this.logger.error('Low balance alert failed', err),
      );
    }

    return result;
  }

  async creditWallet(
    tenantId: string,
    amount: number,
    reason: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      const tenant = await em.findOne(Tenant, {
        where: { id: tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!tenant) return;

      const newBalance = parseFloat(
        (Number(tenant.marketingWalletBalance) + amount).toFixed(2),
      );
      await em.update(
        Tenant,
        { id: tenantId },
        { marketingWalletBalance: newBalance },
      );

      await em.save(
        em.create(WalletTransaction, {
          tenantId,
          type: WalletTransactionType.REFUND,
          amount,
          balanceAfter: newBalance,
          description: reason,
          refId: null,
          paystackRef: null,
        }),
      );
    });

    void this.redis
      .del(
        `wallet:balance:${tenantId}`,
        `dashboard:summary:${tenantId}`,
        `dashboard:top-spenders:${tenantId}`,
      )
      .catch(() => null);
  }

  async topupWallet(
    tenantId: string,
    amount: number,
    paystackRef: string,
  ): Promise<number> {
    await this.dataSource.transaction(async (em) => {
      await em.increment(Tenant, { id: tenantId }, 'marketingWalletBalance', amount);

      const row = await em.findOne(Tenant, {
        where: { id: tenantId },
        select: ['marketingWalletBalance'],
      });
      const newBal = parseFloat(
        Number(row?.marketingWalletBalance ?? 0).toFixed(2),
      );

      await em.save(
        em.create(WalletTransaction, {
          tenantId,
          type: WalletTransactionType.TOPUP,
          amount,
          balanceAfter: newBal,
          description: 'Wallet top-up via Paystack',
          paystackRef,
          refId: null,
        }),
      );

      await em.update(Tenant, { id: tenantId }, {
        walletLowAlertSentAt: null as unknown as Date,
        walletLastToppedUpAt: new Date(),
      });
    });

    const newBalance = await this.getBalance(tenantId);

    void this.redis
      .del(
        `wallet:balance:${tenantId}`,
        `dashboard:summary:${tenantId}`,
        `dashboard:top-spenders:${tenantId}`,
      )
      .catch(() => null);

    return newBalance;
  }

  async getBalance(tenantId: string): Promise<number> {
    const rows = await this.dataSource.query<
      [{ marketing_wallet_balance: string }]
    >('SELECT marketing_wallet_balance FROM tenants WHERE id = $1', [tenantId]);
    return Number(rows?.[0]?.marketing_wallet_balance || 0);
  }

  async getMonthlySpend(
    tenantId: string,
  ): Promise<{ totalSpend: number; messageCount: number }> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const result = await this.dataSource
      .getRepository(WalletTransaction)
      .createQueryBuilder('wt')
      .select('ABS(SUM(wt.amount))', 'totalSpend')
      .addSelect('COUNT(*)', 'messageCount')
      .where('wt.tenantId = :tenantId', { tenantId })
      .andWhere('wt.type != :topup', { topup: WalletTransactionType.TOPUP })
      .andWhere('wt.createdAt >= :startOfMonth', { startOfMonth })
      .getRawOne<{ totalSpend: string; messageCount: string }>();

    return {
      totalSpend: Number(result?.totalSpend || 0),
      messageCount: Number(result?.messageCount || 0),
    };
  }

  private async checkLowBalanceAlert(
    tenantId: string,
    balance: number,
  ): Promise<void> {
    const LOW_THRESHOLD = 3000;
    if (balance > LOW_THRESHOLD) return;

    const rows = await this.dataSource.query<
      [{ wallet_low_alert_sent_at: string | null }]
    >(
      'SELECT wallet_low_alert_sent_at FROM tenants WHERE id = $1',
      [tenantId],
    );

    if (!rows?.[0]) return;

    const ALERT_COOLDOWN_MS = 24 * 3600 * 1000;
    const lastAlert = rows[0].wallet_low_alert_sent_at
      ? new Date(rows[0].wallet_low_alert_sent_at).getTime()
      : 0;

    if (Date.now() - lastAlert < ALERT_COOLDOWN_MS) return;

    const alertType =
      balance <= 0 ? TriggerType.WALLET_ZERO : TriggerType.WALLET_LOW_BALANCE;

    await this.waMessagesQueue?.add(
      'send-message',
      {
        type: alertType,
        tenantId,
        customerId: null,
        data: {
          balance: balance.toLocaleString(),
          topUpUrl: `${process.env.FRONTEND_URL}/billing/wallet/topup`,
        },
      },
      {
        attempts: 2,
        backoff: { type: 'fixed', delay: 30000 },
      },
    );

    await this.dataSource.query(
      'UPDATE tenants SET wallet_low_alert_sent_at = NOW() WHERE id = $1',
      [tenantId],
    );
  }

  private resolveTransactionType(description: string): WalletTransactionType {
    const lower = description.toLowerCase();
    if (lower.includes('birthday')) return WalletTransactionType.DEBIT_BIRTHDAY;
    if (lower.includes('lapsed') || lower.includes('winback'))
      return WalletTransactionType.DEBIT_LAPSED;
    if (lower.includes('campaign')) return WalletTransactionType.DEBIT_CAMPAIGN;
    if (lower.includes('overage'))
      return WalletTransactionType.DEBIT_UTILITY_OVERAGE;
    if (lower.includes('refund')) return WalletTransactionType.REFUND;
    if (lower.includes('topup') || lower.includes('top-up'))
      return WalletTransactionType.TOPUP;
    return WalletTransactionType.DEBIT_CAMPAIGN;
  }

  private toWalletTxType(triggerType: TriggerType): WalletTransactionType {
    switch (triggerType) {
      case TriggerType.BIRTHDAY:
        return WalletTransactionType.DEBIT_BIRTHDAY;
      case TriggerType.LAPSED_WINBACK:
        return WalletTransactionType.DEBIT_LAPSED;
      case TriggerType.CAMPAIGN_MESSAGE:
        return WalletTransactionType.DEBIT_CAMPAIGN;
      default:
        throw new Error(
          `No wallet transaction type for trigger: ${triggerType}`,
        );
    }
  }
}
