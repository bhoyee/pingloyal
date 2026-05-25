import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { TierConfig } from './entities/tier-config.entity';

@Injectable()
export class TierService {
  constructor(
    @InjectRepository(TierConfig)
    private readonly tierConfigRepo: Repository<TierConfig>,
  ) {}

  /**
   * Assigns the highest applicable tier to a customer based on their new
   * quarterly spend. Called inside an open DB transaction (em) so the tier
   * update is atomic with the purchase that triggered it.
   *
   * When em is omitted (e.g. bulk recalculation outside a transaction),
   * uses its own injected repository.
   *
   * Important: no events or queue messages are emitted — pure DB write.
   */
  async recalculate(
    tenantId: string,
    customerId: string,
    newQuarterlySpend: number,
    em?: EntityManager,
  ): Promise<void> {
    // Step 1 — Load tier configs, highest min first
    const tiers = em
      ? await em.find(TierConfig, {
          where: { tenantId },
          order: { minQuarterlySpend: 'DESC' },
        })
      : await this.tierConfigRepo.find({
          where: { tenantId },
          order: { minQuarterlySpend: 'DESC' },
        });

    // Step 2 — No tier configs = optional feature, clear tier and exit
    if (tiers.length === 0) {
      const repo = em ?? this.tierConfigRepo.manager;
      await repo.query(
        'UPDATE customers SET tier_id = NULL, updated_at = NOW() WHERE id = $1 AND tenant_id = $2',
        [customerId, tenantId],
      );
      return;
    }

    // Step 3 — Find the highest tier whose range contains newQuarterlySpend
    const matchingTier =
      tiers.find(
        (t) =>
          newQuarterlySpend >= Number(t.minQuarterlySpend) &&
          (t.maxQuarterlySpend === null ||
            newQuarterlySpend <= Number(t.maxQuarterlySpend)),
      ) ?? null;

    // Step 4 — Assign the matched tier (or clear it if none matched)
    const repo = em ?? this.tierConfigRepo.manager;
    await repo.query(
      'UPDATE customers SET tier_id = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
      [matchingTier?.id ?? null, customerId, tenantId],
    );
  }

  /**
   * Bulk-reassigns tiers for ALL active customers in a tenant based on their
   * current quarterly_spend. Used by CSV import and the quarterly reset cron.
   *
   * No side effects — does not emit events or queue messages.
   */
  async recalculateAll(tenantId: string): Promise<{ updated: number }> {
    // Step 1 — Load tier configs
    const tiers = await this.tierConfigRepo.find({
      where: { tenantId },
      order: { minQuarterlySpend: 'DESC' },
    });

    const em = this.tierConfigRepo.manager;

    // If no tiers configured, null out all customers' tier_id
    if (tiers.length === 0) {
      await em.query(
        'UPDATE customers SET tier_id = NULL, updated_at = NOW() WHERE tenant_id = $1 AND is_active = true',
        [tenantId],
      );
      return { updated: 0 };
    }

    // Step 2 — Load all active customers in batches of 100
    const BATCH_SIZE = 100;
    let offset = 0;
    let totalUpdated = 0;

    while (true) {
      const customers: Array<{ id: string; quarterly_spend: string }> =
        await em.query(
          `SELECT id, quarterly_spend
           FROM customers
           WHERE tenant_id = $1 AND is_active = true
           ORDER BY id
           LIMIT $2 OFFSET $3`,
          [tenantId, BATCH_SIZE, offset],
        );

      if (customers.length === 0) break;

      // Step 3 — Map each customer to their new tier
      const assignments = new Map<string | null, string[]>(); // tierId → customerIds

      for (const customer of customers) {
        const spend = Number(customer.quarterly_spend);
        const matchingTier =
          tiers.find(
            (t) =>
              spend >= Number(t.minQuarterlySpend) &&
              (t.maxQuarterlySpend === null ||
                spend <= Number(t.maxQuarterlySpend)),
          ) ?? null;
        const tierId = matchingTier?.id ?? null;
        if (!assignments.has(tierId)) assignments.set(tierId, []);
        assignments.get(tierId)!.push(customer.id);
      }

      // Step 4 — Bulk UPDATE grouped by tier (avoids N individual updates)
      for (const [tierId, customerIds] of assignments.entries()) {
        await em.query(
          `UPDATE customers
           SET tier_id = $1, updated_at = NOW()
           WHERE id = ANY($2) AND tenant_id = $3`,
          [tierId, customerIds, tenantId],
        );
      }

      totalUpdated += customers.length;
      offset += BATCH_SIZE;

      if (customers.length < BATCH_SIZE) break;
    }

    return { updated: totalUpdated };
  }
}
