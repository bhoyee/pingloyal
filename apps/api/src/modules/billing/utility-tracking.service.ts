import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription } from './entities/subscription.entity';
import { WalletService } from './wallet.service';

@Injectable()
export class UtilityTrackingService {
  private readonly logger = new Logger(UtilityTrackingService.name);

  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    private readonly walletService: WalletService,
  ) {}

  async trackUtilityMessage(tenantId: string): Promise<void> {
    // Step 1 — Atomically increment utility_used_this_period
    await this.subscriptionRepo
      .createQueryBuilder()
      .update(Subscription)
      .set({ utilityUsedThisPeriod: () => 'utility_used_this_period + 1' })
      .where('tenant_id = :tenantId', { tenantId })
      .execute();

    // Step 2 — Load updated subscription
    const sub = await this.subscriptionRepo.findOne({
      where: { tenantId },
      select: [
        'utilityUsedThisPeriod',
        'utilityIncluded',
        'utilityOverageRate',
        'gracePeriodStartedAt',
      ],
    });
    if (!sub) return;

    // Step 3 — Within allowance, nothing to charge
    if (sub.utilityUsedThisPeriod <= sub.utilityIncluded) return;

    // Step 4 — In overage — try to deduct from Marketing Wallet
    const overageResult = await this.walletService.deductOverage(
      tenantId,
      Number(sub.utilityOverageRate),
      'Utility message overage',
    );

    if (overageResult.success) {
      // Reset grace period if it was running (wallet was topped up)
      if (sub.gracePeriodStartedAt !== null) {
        await this.subscriptionRepo.update(
          { tenantId },
          { gracePeriodStartedAt: null },
        );
      }
      return;
    }

    // Step 5 — Wallet empty during overage — start or check grace period
    await this.startGracePeriodIfNotStarted(tenantId, sub);
  }

  private async startGracePeriodIfNotStarted(
    tenantId: string,
    sub: Pick<
      Subscription,
      'gracePeriodStartedAt' | 'utilityUsedThisPeriod' | 'utilityIncluded'
    >,
  ): Promise<void> {
    const GRACE_DAYS = 7;

    if (sub.gracePeriodStartedAt !== null) {
      // Grace period already started — check if expired
      const graceExpiry = new Date(sub.gracePeriodStartedAt);
      graceExpiry.setDate(graceExpiry.getDate() + GRACE_DAYS);

      if (graceExpiry < new Date()) {
        const daysOverdue = Math.floor(
          (Date.now() - new Date(sub.gracePeriodStartedAt).getTime()) /
            (24 * 3600 * 1000),
        );
        this.logger.warn(
          `Tenant ${tenantId} grace period expired — ` +
            `${daysOverdue} days without overage payment`,
        );
      }
      // Grace period already started — nothing more to do
      return;
    }

    // Start the grace period now
    await this.subscriptionRepo.update(
      { tenantId },
      { gracePeriodStartedAt: new Date() },
    );
    this.logger.warn(
      `Tenant ${tenantId} entered utility overage grace period. ` +
        `Wallet empty — Utility messages continue for ${GRACE_DAYS} days.`,
    );
  }

  async resetUsageForNewPeriod(tenantId: string): Promise<void> {
    await this.subscriptionRepo.update(
      { tenantId },
      { utilityUsedThisPeriod: 0, gracePeriodStartedAt: null },
    );
    this.logger.log(`Utility usage reset for tenant ${tenantId}`);
  }
}
