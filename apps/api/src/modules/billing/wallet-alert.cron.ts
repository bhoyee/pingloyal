import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Cron } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { TriggerType } from '@pingloyal/types';
import { Tenant } from '../tenants/entities/tenant.entity';

@Injectable()
export class WalletAlertCronService {
  private readonly logger = new Logger(WalletAlertCronService.name);

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectQueue('wa-messages')
    private readonly waMessagesQueue: Queue,
  ) {}

  @Cron('0 * * * *')
  async checkLowWalletBalances(): Promise<void> {
    const LOW_THRESHOLD = 3000;
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 3600 * 1000);

    const tenantsToAlert = await this.tenantRepo
      .createQueryBuilder('t')
      .select([
        't.id',
        't.businessName',
        't.marketingWalletBalance',
        't.walletLowAlertSentAt',
      ])
      .where('t.subscriptionStatus IN (:...statuses)', {
        statuses: ['active', 'trialing', 'past_due'],
      })
      .andWhere('t.marketingWalletBalance <= :threshold', {
        threshold: LOW_THRESHOLD,
      })
      .andWhere(
        '(t.walletLowAlertSentAt IS NULL OR t.walletLowAlertSentAt < :cutoff)',
        { cutoff: twentyFourHoursAgo },
      )
      .getMany();

    if (tenantsToAlert.length === 0) return;

    this.logger.log(
      `Wallet alert cron: ${tenantsToAlert.length} tenants need alerts`,
    );

    for (const tenant of tenantsToAlert) {
      try {
        const balance = Number(tenant.marketingWalletBalance);
        const alertType =
          balance <= 0
            ? TriggerType.WALLET_ZERO
            : TriggerType.WALLET_LOW_BALANCE;

        await this.waMessagesQueue.add(
          'send-message',
          {
            type: alertType,
            tenantId: tenant.id,
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

        await this.tenantRepo.update(tenant.id, {
          walletLowAlertSentAt: new Date(),
        });

        this.logger.log(
          `Wallet alert queued: tenant=${tenant.id} type=${alertType} balance=₦${balance}`,
        );
      } catch (err) {
        this.logger.error(`Wallet alert failed for tenant ${tenant.id}`, err);
      }
    }
  }
}
