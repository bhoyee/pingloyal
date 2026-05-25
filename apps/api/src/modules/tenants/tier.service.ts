import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { TierConfig } from './entities/tier-config.entity';

@Injectable()
export class TierService {
  /**
   * Assigns the highest applicable tier to a customer based on their new
   * quarterly spend. Called inside an open DB transaction (em) so the tier
   * update is atomic with the purchase that triggered it.
   */
  async recalculate(
    tenantId: string,
    customerId: string,
    newQuarterlySpend: number,
    em: EntityManager,
  ): Promise<void> {
    const tiers = await em.find(TierConfig, {
      where: { tenantId },
      order: { minQuarterlySpend: 'DESC' },
    });

    const applicable = tiers.find(
      (t) => newQuarterlySpend >= Number(t.minQuarterlySpend),
    );

    await em.query(
      'UPDATE customers SET tier_id = $1 WHERE id = $2 AND tenant_id = $3',
      [applicable?.id ?? null, customerId, tenantId],
    );
  }
}
