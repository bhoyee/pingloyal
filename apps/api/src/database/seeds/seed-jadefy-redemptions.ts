/**
 * Demo-data seed for "Jadefy Store" — redemption history.
 *
 * Inserts 6 realistic redemption records spread across the last 30 days so
 * the Reconciliation page's "Redemptions Summary" shows live numbers:
 *   - 6 redemption events (7 rewards total)
 *   - 7,000 pts redeemed
 *   - ₦7,000 reward value
 *
 * The balance_after values are set so they are consistent with the customers'
 * current points_balance (i.e. balance_after of the final redemption equals
 * their current balance), making the data look realistic for a demo.
 *
 * SAFE: never touches tenant, users, or other tables.
 * Idempotent: deletes rows WHERE notes = '[demo-seed]' before reinserting.
 *
 * Prerequisites: seed-jadefy.ts must have been run first.
 *
 * Run with:
 *   npx ts-node -r tsconfig-paths/register src/database/seeds/seed-jadefy-redemptions.ts
 */
import 'reflect-metadata';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { Tenant } from '../../modules/tenants/entities/tenant.entity';
import { TierConfig } from '../../modules/tenants/entities/tier-config.entity';
import { User } from '../../modules/auth/entities/user.entity';
import { Customer } from '../../modules/customers/entities/customer.entity';
import { UserRole } from '@pingloyal/types';

dotenv.config({ path: path.join(__dirname, '../../../.env') });
dotenv.config({ path: path.join(__dirname, '../../../../../.env') });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required.');
}

const SeedDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [Tenant, TierConfig, User, Customer],
  namingStrategy: new SnakeNamingStrategy(),
  synchronize: false,
  logging: false,
});

const TENANT_SLUG = 'jadefy-store';
const SEED_NOTE = '[demo-seed]';

function daysAgo(days: number, hour = 11): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 30, 0, 0);
  return d;
}

async function main() {
  await SeedDataSource.initialize();

  await SeedDataSource.transaction(async (manager) => {
    // ── Find tenant ────────────────────────────────────────────────────────────
    const tenant = await manager.findOne(Tenant, {
      where: { slug: TENANT_SLUG },
    });
    if (!tenant) {
      throw new Error(
        `Tenant "${TENANT_SLUG}" not found — run seed-jadefy.ts first.`,
      );
    }
    console.log(
      `[seed:redemptions] Tenant: ${tenant.id} (${tenant.businessName})`,
    );
    console.log(
      `[seed:redemptions] pointsThreshold=${tenant.pointsThreshold}, rewardValue=₦${tenant.rewardValue}`,
    );

    // ── Find cashier — use any active user for the tenant ─────────────────────
    const cashier = await manager.findOne(User, {
      where: { tenantId: tenant.id, role: UserRole.OWNER, isActive: true },
    });
    if (!cashier) {
      throw new Error('No active user found — run seed-jadefy.ts first.');
    }
    console.log(
      `[seed:redemptions] Using cashier: ${cashier.fullName} (${cashier.role})`,
    );

    // ── Find target customers ─────────────────────────────────────────────────
    const adaeze = await manager.findOne(Customer, {
      where: { tenantId: tenant.id, phoneE164: '+2348031234001' },
    });
    const chidinma = await manager.findOne(Customer, {
      where: { tenantId: tenant.id, phoneE164: '+2348031234002' },
    });
    if (!adaeze || !chidinma) {
      throw new Error(
        'Could not find Adaeze or Chidinma — run seed-jadefy.ts first.',
      );
    }

    // ── Idempotent cleanup ────────────────────────────────────────────────────
    const del = await manager.query(
      `DELETE FROM redemptions WHERE tenant_id = $1 AND notes = $2`,
      [tenant.id, SEED_NOTE],
    );
    console.log(
      `[seed:redemptions] Removed ${String(del[1] ?? 0)} old seed redemptions`,
    );

    // ── Build redemption records ──────────────────────────────────────────────
    //
    // Adaeze (current balance: 1200 pts)
    //   Her balance before these 3 redemptions was 1200 + 3000 = 4200 pts.
    //   Redemption 1 (25 days ago, 1 reward): 4200 – 1000 = 3200 pts after
    //   Redemption 2 (15 days ago, 1 reward): 3200 – 1000 = 2200 pts after
    //   Redemption 3 ( 7 days ago, 1 reward): 2200 – 1000 = 1200 pts after  ← current balance
    //
    // Chidinma (current balance: 1500 pts)
    //   Her balance before these 3 redemptions was 1500 + 4000 = 5500 pts.
    //   Redemption 1 (22 days ago, 1 reward): 5500 – 1000 = 4500 pts after
    //   Redemption 2 (12 days ago, 2 rewards): 4500 – 2000 = 2500 pts after
    //   Redemption 3 ( 3 days ago, 1 reward): 2500 – 1000 = 1500 pts after  ← current balance

    const threshold = tenant.pointsThreshold;
    const rewardVal = Number(tenant.rewardValue);

    type RedemptionSpec = {
      customerId: string;
      rewardsCount: number;
      pointsRedeemed: number;
      value: number;
      balanceAfter: number;
      redeemedAt: Date;
    };

    const records: RedemptionSpec[] = [
      // ── Adaeze ─────────────────────────────────────────────────────────────
      {
        customerId: adaeze.id,
        rewardsCount: 1,
        pointsRedeemed: threshold,
        value: rewardVal,
        balanceAfter: 3200,
        redeemedAt: daysAgo(25, 10),
      },
      {
        customerId: adaeze.id,
        rewardsCount: 1,
        pointsRedeemed: threshold,
        value: rewardVal,
        balanceAfter: 2200,
        redeemedAt: daysAgo(15, 14),
      },
      {
        customerId: adaeze.id,
        rewardsCount: 1,
        pointsRedeemed: threshold,
        value: rewardVal,
        balanceAfter: adaeze.pointsBalance,
        redeemedAt: daysAgo(7, 11),
      },

      // ── Chidinma ───────────────────────────────────────────────────────────
      {
        customerId: chidinma.id,
        rewardsCount: 1,
        pointsRedeemed: threshold,
        value: rewardVal,
        balanceAfter: 4500,
        redeemedAt: daysAgo(22, 12),
      },
      {
        customerId: chidinma.id,
        rewardsCount: 2,
        pointsRedeemed: 2 * threshold,
        value: 2 * rewardVal,
        balanceAfter: 2500,
        redeemedAt: daysAgo(12, 15),
      },
      {
        customerId: chidinma.id,
        rewardsCount: 1,
        pointsRedeemed: threshold,
        value: rewardVal,
        balanceAfter: chidinma.pointsBalance,
        redeemedAt: daysAgo(3, 13),
      },
    ];

    let inserted = 0;
    for (const r of records) {
      await manager.query(
        `INSERT INTO redemptions
           (id, tenant_id, customer_id, cashier_id,
            rewards_count, points_redeemed, value, balance_after, notes, redeemed_at)
         VALUES
           (gen_random_uuid(), $1, $2, $3,
            $4, $5, $6, $7, $8, $9)`,
        [
          tenant.id,
          r.customerId,
          cashier.id,
          r.rewardsCount,
          r.pointsRedeemed,
          r.value,
          r.balanceAfter,
          SEED_NOTE,
          r.redeemedAt.toISOString(),
        ],
      );
      inserted++;
    }

    const totalRewards = records.reduce((s, r) => s + r.rewardsCount, 0);
    const totalPoints = records.reduce((s, r) => s + r.pointsRedeemed, 0);
    const totalValue = records.reduce((s, r) => s + r.value, 0);

    console.log(`[seed:redemptions] Inserted ${inserted} redemption records`);
    console.log(`[seed:redemptions] Total rewards redeemed: ${totalRewards}`);
    console.log(`[seed:redemptions] Total points redeemed: ${totalPoints.toLocaleString()}`);
    console.log(`[seed:redemptions] Total reward value: ₦${totalValue.toLocaleString()}`);
  });

  await SeedDataSource.destroy();
  console.log('[seed:redemptions] Done.');
}

main().catch((err: unknown) => {
  console.error('[seed:redemptions] FAILED:', err);
  process.exit(1);
});
