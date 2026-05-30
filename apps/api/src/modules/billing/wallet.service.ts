import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type Redis from 'ioredis';
import { TriggerType, WalletTransactionType } from '@pingloyal/types';
import { REDIS_CLIENT } from '../../common/redis/redis.constants';
import { Tenant } from '../tenants/entities/tenant.entity';
import { WalletTransaction } from './entities/wallet-transaction.entity';

@Injectable()
export class WalletService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async deductMarketing(
    tenantId: string,
    triggerType: TriggerType,
    amount: number,
    description: string,
    refId?: string | null,
  ): Promise<{ success: boolean; newBalance: number }> {
    return this.dataSource.transaction(async (em) => {
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
        `dashboard:summary:${tenantId}`,
        `dashboard:top-spenders:${tenantId}`,
      )
      .catch(() => null);
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
