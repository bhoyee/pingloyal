/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/**
 * Additive seed: points_ledger entries for Jadefy Store.
 *
 * Inserts daily points-earned entries across the last 45 days so the
 * "Points Issued — Daily" area chart has realistic data for both
 * "This Month" and "Last Month" views.
 *
 * SAFE      : never touches the tenant row, users, or passwords.
 * IDEMPOTENT: deletes all previous import_seed ledger entries before re-insert.
 *
 * Run:
 *   npx ts-node -r tsconfig-paths/register src/database/seeds/seed-jadefy-points.ts
 */
import 'reflect-metadata';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { PointsLedgerReason } from '@pingloyal/types';
import { Tenant } from '../../modules/tenants/entities/tenant.entity';
import { TierConfig } from '../../modules/tenants/entities/tier-config.entity';
import { ProductCategory } from '../../modules/tenants/entities/product-category.entity';
import { User } from '../../modules/auth/entities/user.entity';
import { Customer } from '../../modules/customers/entities/customer.entity';
import { PointsLedger } from '../../modules/transactions/entities/points-ledger.entity';
import { Transaction } from '../../modules/transactions/entities/transaction.entity';

dotenv.config({ path: path.join(__dirname, '../../../.env') });
dotenv.config({ path: path.join(__dirname, '../../../../../.env') });

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');

const ds = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [
    Tenant,
    TierConfig,
    ProductCategory,
    User,
    Customer,
    Transaction,
    PointsLedger,
  ],
  namingStrategy: new SnakeNamingStrategy(),
  synchronize: false,
  logging: false,
});

// ── Date helper ────────────────────────────────────────────────────────────────

function dateAt(daysAgo: number, hour: number, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d;
}

// ── Entry spec ─────────────────────────────────────────────────────────────────

interface LedgerSpec {
  customerIndex: number; // index into the customers array
  delta: number; // points earned (positive)
  daysAgo: number;
  hour: number;
}

// ── Data design ────────────────────────────────────────────────────────────────
//
// 6 customers sorted by totalSpend DESC:
//   [0] Adaeze  — VIP, highest spender, earns most
//   [1] Chidinma
//   [2] Tunde
//   [3] Funke
//   [4] Ibrahim
//   [5] Grace   — inactive / lower activity
//
// Points earning: ~1 pt per ₦1,000 spent (avg transaction ₦8,500 ≈ 8 pts)
// Fridays / Saturdays busiest. Sundays quietest.
//
// Days 0-15  → this month (June 1-16)
// Days 16-45 → last month (May 1-31)

const specs: LedgerSpec[] = [
  // ── THIS MONTH (days 0-15) ────────────────────────────────────────────────

  // June 16 (today, Mon)
  { customerIndex: 0, delta: 12, daysAgo: 0, hour: 10 },
  { customerIndex: 1, delta: 8, daysAgo: 0, hour: 11 },
  { customerIndex: 2, delta: 7, daysAgo: 0, hour: 14 },

  // June 15 (Sun) — quiet
  { customerIndex: 0, delta: 6, daysAgo: 1, hour: 12 },
  { customerIndex: 3, delta: 5, daysAgo: 1, hour: 15 },

  // June 14 (Sat)
  { customerIndex: 0, delta: 15, daysAgo: 2, hour: 10 },
  { customerIndex: 1, delta: 10, daysAgo: 2, hour: 11 },
  { customerIndex: 2, delta: 9, daysAgo: 2, hour: 12 },
  { customerIndex: 4, delta: 7, daysAgo: 2, hour: 14 },

  // June 13 (Fri) — peak
  { customerIndex: 0, delta: 22, daysAgo: 3, hour: 10 },
  { customerIndex: 1, delta: 18, daysAgo: 3, hour: 11 },
  { customerIndex: 2, delta: 14, daysAgo: 3, hour: 12 },
  { customerIndex: 3, delta: 12, daysAgo: 3, hour: 13 },
  { customerIndex: 4, delta: 9, daysAgo: 3, hour: 14 },
  { customerIndex: 5, delta: 6, daysAgo: 3, hour: 15 },

  // June 12 (Thu)
  { customerIndex: 0, delta: 10, daysAgo: 4, hour: 11 },
  { customerIndex: 1, delta: 8, daysAgo: 4, hour: 14 },
  { customerIndex: 3, delta: 6, daysAgo: 4, hour: 16 },

  // June 11 (Wed)
  { customerIndex: 0, delta: 8, daysAgo: 5, hour: 10 },
  { customerIndex: 2, delta: 9, daysAgo: 5, hour: 13 },
  { customerIndex: 4, delta: 5, daysAgo: 5, hour: 15 },

  // June 10 (Tue)
  { customerIndex: 1, delta: 7, daysAgo: 6, hour: 11 },
  { customerIndex: 3, delta: 6, daysAgo: 6, hour: 14 },

  // June 9 (Mon)
  { customerIndex: 0, delta: 14, daysAgo: 7, hour: 9 },
  { customerIndex: 1, delta: 10, daysAgo: 7, hour: 11 },
  { customerIndex: 2, delta: 8, daysAgo: 7, hour: 13 },

  // June 8 (Sun) — quiet
  { customerIndex: 0, delta: 5, daysAgo: 8, hour: 14 },

  // June 7 (Sat)
  { customerIndex: 0, delta: 16, daysAgo: 9, hour: 10 },
  { customerIndex: 1, delta: 11, daysAgo: 9, hour: 11 },
  { customerIndex: 2, delta: 10, daysAgo: 9, hour: 12 },
  { customerIndex: 4, delta: 8, daysAgo: 9, hour: 14 },

  // June 6 (Fri) — peak
  { customerIndex: 0, delta: 24, daysAgo: 10, hour: 10 },
  { customerIndex: 1, delta: 20, daysAgo: 10, hour: 11 },
  { customerIndex: 2, delta: 15, daysAgo: 10, hour: 12 },
  { customerIndex: 3, delta: 13, daysAgo: 10, hour: 13 },
  { customerIndex: 5, delta: 8, daysAgo: 10, hour: 14 },

  // June 5 (Thu)
  { customerIndex: 0, delta: 9, daysAgo: 11, hour: 11 },
  { customerIndex: 2, delta: 7, daysAgo: 11, hour: 14 },

  // June 4 (Wed)
  { customerIndex: 1, delta: 10, daysAgo: 12, hour: 10 },
  { customerIndex: 3, delta: 7, daysAgo: 12, hour: 15 },
  { customerIndex: 4, delta: 6, daysAgo: 12, hour: 16 },

  // June 3 (Tue)
  { customerIndex: 0, delta: 8, daysAgo: 13, hour: 11 },
  { customerIndex: 1, delta: 7, daysAgo: 13, hour: 14 },

  // June 2 (Mon)
  { customerIndex: 0, delta: 11, daysAgo: 14, hour: 9 },
  { customerIndex: 2, delta: 8, daysAgo: 14, hour: 11 },
  { customerIndex: 3, delta: 6, daysAgo: 14, hour: 13 },

  // June 1 (Sun)
  { customerIndex: 1, delta: 6, daysAgo: 15, hour: 13 },
  { customerIndex: 4, delta: 5, daysAgo: 15, hour: 15 },

  // ── LAST MONTH (days 16-45) ───────────────────────────────────────────────

  // May 31 (Sat)
  { customerIndex: 0, delta: 18, daysAgo: 16, hour: 10 },
  { customerIndex: 1, delta: 12, daysAgo: 16, hour: 11 },
  { customerIndex: 2, delta: 10, daysAgo: 16, hour: 13 },

  // May 30 (Fri) — peak
  { customerIndex: 0, delta: 26, daysAgo: 17, hour: 10 },
  { customerIndex: 1, delta: 19, daysAgo: 17, hour: 11 },
  { customerIndex: 2, delta: 15, daysAgo: 17, hour: 12 },
  { customerIndex: 3, delta: 12, daysAgo: 17, hour: 14 },
  { customerIndex: 4, delta: 10, daysAgo: 17, hour: 15 },

  // May 29 (Thu)
  { customerIndex: 0, delta: 11, daysAgo: 18, hour: 10 },
  { customerIndex: 1, delta: 9, daysAgo: 18, hour: 13 },
  { customerIndex: 3, delta: 7, daysAgo: 18, hour: 15 },

  // May 28 (Wed)
  { customerIndex: 2, delta: 8, daysAgo: 19, hour: 11 },
  { customerIndex: 4, delta: 6, daysAgo: 19, hour: 14 },

  // May 27 (Tue)
  { customerIndex: 0, delta: 9, daysAgo: 20, hour: 10 },
  { customerIndex: 1, delta: 8, daysAgo: 20, hour: 14 },

  // May 26 (Mon)
  { customerIndex: 0, delta: 13, daysAgo: 21, hour: 9 },
  { customerIndex: 2, delta: 10, daysAgo: 21, hour: 11 },
  { customerIndex: 3, delta: 8, daysAgo: 21, hour: 13 },

  // May 25 (Sun) — quiet
  { customerIndex: 1, delta: 5, daysAgo: 22, hour: 14 },

  // May 24 (Sat)
  { customerIndex: 0, delta: 17, daysAgo: 23, hour: 10 },
  { customerIndex: 1, delta: 13, daysAgo: 23, hour: 11 },
  { customerIndex: 2, delta: 9, daysAgo: 23, hour: 12 },
  { customerIndex: 5, delta: 7, daysAgo: 23, hour: 15 },

  // May 23 (Fri) — peak
  { customerIndex: 0, delta: 28, daysAgo: 24, hour: 10 },
  { customerIndex: 1, delta: 21, daysAgo: 24, hour: 11 },
  { customerIndex: 2, delta: 16, daysAgo: 24, hour: 12 },
  { customerIndex: 3, delta: 14, daysAgo: 24, hour: 13 },
  { customerIndex: 4, delta: 9, daysAgo: 24, hour: 15 },

  // May 22 (Thu)
  { customerIndex: 0, delta: 10, daysAgo: 25, hour: 11 },
  { customerIndex: 2, delta: 8, daysAgo: 25, hour: 14 },

  // May 21 (Wed)
  { customerIndex: 1, delta: 9, daysAgo: 26, hour: 10 },
  { customerIndex: 3, delta: 7, daysAgo: 26, hour: 15 },

  // May 20 (Tue)
  { customerIndex: 0, delta: 8, daysAgo: 27, hour: 11 },
  { customerIndex: 4, delta: 6, daysAgo: 27, hour: 14 },

  // May 19 (Mon)
  { customerIndex: 0, delta: 15, daysAgo: 28, hour: 9 },
  { customerIndex: 1, delta: 11, daysAgo: 28, hour: 11 },
  { customerIndex: 2, delta: 9, daysAgo: 28, hour: 13 },

  // May 18 (Sun) — quiet
  { customerIndex: 0, delta: 6, daysAgo: 29, hour: 13 },

  // May 17 (Sat)
  { customerIndex: 0, delta: 16, daysAgo: 30, hour: 10 },
  { customerIndex: 1, delta: 12, daysAgo: 30, hour: 11 },
  { customerIndex: 3, delta: 8, daysAgo: 30, hour: 14 },

  // May 16 (Fri) — peak
  { customerIndex: 0, delta: 25, daysAgo: 31, hour: 10 },
  { customerIndex: 1, delta: 18, daysAgo: 31, hour: 11 },
  { customerIndex: 2, delta: 14, daysAgo: 31, hour: 12 },
  { customerIndex: 3, delta: 10, daysAgo: 31, hour: 13 },
  { customerIndex: 5, delta: 7, daysAgo: 31, hour: 15 },

  // May 15 (Thu)
  { customerIndex: 0, delta: 9, daysAgo: 32, hour: 11 },
  { customerIndex: 2, delta: 7, daysAgo: 32, hour: 14 },

  // May 14 (Wed)
  { customerIndex: 1, delta: 8, daysAgo: 33, hour: 10 },
  { customerIndex: 4, delta: 6, daysAgo: 33, hour: 15 },

  // May 13 (Tue)
  { customerIndex: 0, delta: 7, daysAgo: 34, hour: 11 },
  { customerIndex: 3, delta: 6, daysAgo: 34, hour: 14 },

  // May 12 (Mon)
  { customerIndex: 0, delta: 12, daysAgo: 35, hour: 9 },
  { customerIndex: 1, delta: 9, daysAgo: 35, hour: 11 },
  { customerIndex: 2, delta: 8, daysAgo: 35, hour: 13 },

  // May 9 (Fri) — peak
  { customerIndex: 0, delta: 22, daysAgo: 38, hour: 10 },
  { customerIndex: 1, delta: 16, daysAgo: 38, hour: 11 },
  { customerIndex: 2, delta: 13, daysAgo: 38, hour: 12 },
  { customerIndex: 3, delta: 9, daysAgo: 38, hour: 14 },

  // May 8 (Thu)
  { customerIndex: 0, delta: 9, daysAgo: 39, hour: 11 },
  { customerIndex: 4, delta: 6, daysAgo: 39, hour: 14 },

  // May 5 (Mon)
  { customerIndex: 0, delta: 11, daysAgo: 42, hour: 9 },
  { customerIndex: 1, delta: 8, daysAgo: 42, hour: 11 },

  // May 2 (Fri)
  { customerIndex: 0, delta: 20, daysAgo: 45, hour: 10 },
  { customerIndex: 1, delta: 15, daysAgo: 45, hour: 11 },
  { customerIndex: 2, delta: 12, daysAgo: 45, hour: 12 },
  { customerIndex: 3, delta: 9, daysAgo: 45, hour: 13 },
];

async function main() {
  await ds.initialize();

  await ds.transaction(async (mgr) => {
    // ── Find tenant ────────────────────────────────────────────────────────
    const tenant = await mgr.findOne(Tenant, {
      where: { slug: 'jadefy-store' },
    });
    if (!tenant)
      throw new Error(
        'Tenant "jadefy-store" not found — run seed-jadefy.ts first.',
      );
    console.log(`[seed:points] Tenant: ${tenant.id}`);

    // ── Load customers ordered by totalSpend DESC (same order as the spec) ──
    const customers = await mgr.find(Customer, {
      where: { tenantId: tenant.id },
      order: { totalSpend: 'DESC' },
    });
    if (customers.length === 0) throw new Error('No customers found.');
    console.log(`[seed:points] Customers: ${customers.length}`);

    // ── Delete previous import_seed ledger entries ─────────────────────────
    const del = await mgr.query(
      `DELETE FROM points_ledger WHERE tenant_id = $1 AND reason = $2`,
      [tenant.id, PointsLedgerReason.IMPORT_SEED],
    );
    console.log(
      `[seed:points] Removed ${String((del as number[])[1] ?? 0)} old seed entries`,
    );

    // ── Track running balance per customer ─────────────────────────────────
    // Start below current pointsBalance so added pts bring it to realistic total
    const balances: Record<string, number> = {};
    for (const c of customers) {
      // seed balance starts lower so entries bring it up naturally
      balances[c.id] = Math.max(0, c.pointsBalance - 300);
    }

    // ── Sort specs oldest-first so balance accumulates correctly ──────────
    const sorted = [...specs].sort((a, b) => b.daysAgo - a.daysAgo);

    let inserted = 0;
    for (const spec of sorted) {
      const customer = customers[spec.customerIndex % customers.length];
      if (!customer) continue;

      balances[customer.id] = (balances[customer.id] ?? 0) + spec.delta;
      const createdAt = dateAt(spec.daysAgo, spec.hour);

      await mgr.query(
        `INSERT INTO points_ledger
           (id, tenant_id, customer_id, delta, reason, ref_transaction_id, ref_campaign_id, balance_after, created_at)
         VALUES
           (gen_random_uuid(), $1, $2, $3, $4, NULL, NULL, $5, $6)`,
        [
          tenant.id,
          customer.id,
          spec.delta,
          PointsLedgerReason.IMPORT_SEED,
          balances[customer.id],
          createdAt.toISOString(),
        ],
      );
      inserted++;
    }

    console.log(`[seed:points] Inserted ${inserted} ledger entries`);

    // ── Print daily totals for verification ───────────────────────────────
    const summary = await mgr.query(
      `SELECT DATE(created_at) AS day, SUM(delta) AS pts
       FROM points_ledger
       WHERE tenant_id = $1 AND reason = $2
       GROUP BY day ORDER BY day DESC LIMIT 20`,
      [tenant.id, PointsLedgerReason.IMPORT_SEED],
    );
    console.log('[seed:points] Recent daily totals:');
    for (const row of summary as Array<{ day: string; pts: string }>) {
      console.log(`  ${row.day}: ${row.pts} pts`);
    }
  });

  await ds.destroy();
  console.log('[seed:points] Done.');
}

main().catch((e: unknown) => {
  console.error(String(e));
  process.exit(1);
});
