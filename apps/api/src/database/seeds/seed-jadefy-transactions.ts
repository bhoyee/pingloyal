/**
 * Additive demo-data patch for the "Jadefy Store" tenant.
 *
 * Inserts realistic transaction records spread across days of the week and
 * linked to product categories so the Reports page shows:
 *   - "Busiest Day of Week" bar chart with a visible peak
 *   - "Top Category by Purchase Volume" with real percentages
 *
 * SAFE: never touches the tenant row, users, or passwords.
 * Idempotent: deletes any previously-inserted seed transactions before
 * re-inserting, identified by source = 'import_seed'.
 *
 * Run with:
 *   npx ts-node -r tsconfig-paths/register src/database/seeds/seed-jadefy-transactions.ts
 */
import 'reflect-metadata';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { Tenant } from '../../modules/tenants/entities/tenant.entity';
import { TierConfig } from '../../modules/tenants/entities/tier-config.entity';
import { ProductCategory } from '../../modules/tenants/entities/product-category.entity';
import { User } from '../../modules/auth/entities/user.entity';
import { Customer } from '../../modules/customers/entities/customer.entity';
import { Transaction } from '../../modules/transactions/entities/transaction.entity';
import { TransactionSource } from '@pingloyal/types';

const SEED_KEY_PREFIX = 'seed-jadefy-txn-';

dotenv.config({ path: path.join(__dirname, '../../../.env') });
dotenv.config({ path: path.join(__dirname, '../../../../../.env') });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required.');
}

const SeedDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [Tenant, TierConfig, ProductCategory, User, Customer, Transaction],
  namingStrategy: new SnakeNamingStrategy(),
  synchronize: false,
  logging: false,
});

const TENANT_SLUG = 'jadefy-store';

/** Return a Date that lands on a specific day-of-week within the last N weeks. */
function dateOnDow(targetDow: number, weeksAgo: number, hour = 11): Date {
  const now = new Date();
  // current DOW (0=Sun … 6=Sat)
  const todayDow = now.getDay();
  const diffDays = (todayDow - targetDow + 7) % 7;
  const d = new Date(now);
  d.setDate(d.getDate() - diffDays - weeksAgo * 7);
  d.setHours(hour, 30, 0, 0);
  return d;
}

async function main() {
  await SeedDataSource.initialize();

  await SeedDataSource.transaction(async (manager) => {
    // ── Find tenant ───────────────────────────────────────────────────────────
    const tenant = await manager.findOne(Tenant, {
      where: { slug: TENANT_SLUG },
    });
    if (!tenant) {
      throw new Error(
        `Tenant "${TENANT_SLUG}" not found — run seed-jadefy.ts first.`,
      );
    }
    console.log(`[seed:transactions] Tenant: ${tenant.id} (${tenant.businessName})`);

    // ── Load existing categories ──────────────────────────────────────────────
    const categories = await manager.find(ProductCategory, {
      where: { tenantId: tenant.id },
    });
    if (categories.length === 0) {
      throw new Error('No product categories found — run seed-jadefy.ts first.');
    }
    const catMap = Object.fromEntries(categories.map((c) => [c.slug, c]));

    const food       = catMap['food'];
    const baby       = catMap['baby_products'];
    const electronics = catMap['electronics'];
    const fashion    = catMap['fashion'];

    // ── Load customers ────────────────────────────────────────────────────────
    const customers = await manager.find(Customer, {
      where: { tenantId: tenant.id },
      order: { totalSpend: 'DESC' },
    });
    if (customers.length === 0) {
      throw new Error('No customers found — run seed-jadefy.ts first.');
    }
    const [c1, c2, c3, c4, c5] = customers;

    // ── Remove previous seed transactions (identified by idempotency key prefix) ─
    const deleteResult = await manager.query(
      `DELETE FROM transactions WHERE tenant_id = $1 AND idempotency_key LIKE $2`,
      [tenant.id, `${SEED_KEY_PREFIX}%`],
    ) as unknown[];
    console.log(`[seed:transactions] Removed ${Array.isArray(deleteResult) ? String(deleteResult[1] ?? 0) : '?'} old seed transactions`);

    // ── Build transaction list ────────────────────────────────────────────────
    // DOW distribution (0=Sun, 1=Mon … 5=Fri, 6=Sat)
    // Friday is the busiest, Monday second, others taper off.
    //
    // Category split target (approximate):
    //   Food & Groceries   45%   ~18 txns
    //   Baby Products      25%   ~10 txns
    //   Fashion & Clothing 18%   ~ 7 txns
    //   Electronics        12%   ~ 5 txns
    //   Total              40 txns across 4 weeks

    type TxSpec = {
      customer: Customer;
      category: ProductCategory;
      amount: number;
      pointsEarned: number;
      date: Date;
    };

    const txns: TxSpec[] = [
      // ── Friday peak (DOW 5) ── 10 transactions ──────────────────────────────
      { customer: c1, category: food,        amount: 8500,  pointsEarned:  8, date: dateOnDow(5, 0, 10) },
      { customer: c2, category: food,        amount: 12000, pointsEarned: 12, date: dateOnDow(5, 0, 11) },
      { customer: c3, category: baby,        amount: 6500,  pointsEarned:  6, date: dateOnDow(5, 0, 12) },
      { customer: c4, category: fashion,     amount: 9000,  pointsEarned:  9, date: dateOnDow(5, 0, 14) },
      { customer: c5, category: food,        amount: 4500,  pointsEarned:  4, date: dateOnDow(5, 0, 15) },
      { customer: c1, category: food,        amount: 7200,  pointsEarned:  7, date: dateOnDow(5, 1, 10) },
      { customer: c2, category: baby,        amount: 5500,  pointsEarned:  5, date: dateOnDow(5, 1, 11) },
      { customer: c3, category: food,        amount: 9800,  pointsEarned:  9, date: dateOnDow(5, 1, 13) },
      { customer: c4, category: electronics, amount: 24000, pointsEarned: 24, date: dateOnDow(5, 1, 15) },
      { customer: c5, category: fashion,     amount: 6000,  pointsEarned:  6, date: dateOnDow(5, 2, 11) },

      // ── Monday (DOW 1) ── 7 transactions ────────────────────────────────────
      { customer: c1, category: food,        amount: 6000,  pointsEarned:  6, date: dateOnDow(1, 0,  9) },
      { customer: c2, category: baby,        amount: 8500,  pointsEarned:  8, date: dateOnDow(1, 0, 10) },
      { customer: c3, category: food,        amount: 4500,  pointsEarned:  4, date: dateOnDow(1, 1, 11) },
      { customer: c4, category: fashion,     amount: 7500,  pointsEarned:  7, date: dateOnDow(1, 1, 14) },
      { customer: c1, category: food,        amount: 5800,  pointsEarned:  5, date: dateOnDow(1, 2, 10) },
      { customer: c2, category: electronics, amount: 18000, pointsEarned: 18, date: dateOnDow(1, 2, 12) },
      { customer: c3, category: baby,        amount: 4000,  pointsEarned:  4, date: dateOnDow(1, 3, 11) },

      // ── Wednesday (DOW 3) ── 6 transactions ─────────────────────────────────
      { customer: c1, category: food,        amount: 5500,  pointsEarned:  5, date: dateOnDow(3, 0, 10) },
      { customer: c2, category: baby,        amount: 6000,  pointsEarned:  6, date: dateOnDow(3, 0, 12) },
      { customer: c4, category: fashion,     amount: 8000,  pointsEarned:  8, date: dateOnDow(3, 1, 11) },
      { customer: c5, category: food,        amount: 3500,  pointsEarned:  3, date: dateOnDow(3, 1, 14) },
      { customer: c1, category: electronics, amount: 15000, pointsEarned: 15, date: dateOnDow(3, 2, 10) },
      { customer: c3, category: food,        amount: 4200,  pointsEarned:  4, date: dateOnDow(3, 2, 13) },

      // ── Thursday (DOW 4) ── 5 transactions ──────────────────────────────────
      { customer: c2, category: food,        amount: 7000,  pointsEarned:  7, date: dateOnDow(4, 0, 10) },
      { customer: c3, category: baby,        amount: 5200,  pointsEarned:  5, date: dateOnDow(4, 0, 12) },
      { customer: c4, category: food,        amount: 4800,  pointsEarned:  4, date: dateOnDow(4, 1, 11) },
      { customer: c1, category: fashion,     amount: 6500,  pointsEarned:  6, date: dateOnDow(4, 1, 14) },
      { customer: c5, category: electronics, amount: 12000, pointsEarned: 12, date: dateOnDow(4, 2, 10) },

      // ── Saturday (DOW 6) ── 5 transactions ──────────────────────────────────
      { customer: c1, category: baby,        amount: 5000,  pointsEarned:  5, date: dateOnDow(6, 0, 11) },
      { customer: c2, category: food,        amount: 8000,  pointsEarned:  8, date: dateOnDow(6, 0, 12) },
      { customer: c3, category: fashion,     amount: 5500,  pointsEarned:  5, date: dateOnDow(6, 1, 10) },
      { customer: c4, category: food,        amount: 6200,  pointsEarned:  6, date: dateOnDow(6, 1, 14) },
      { customer: c5, category: baby,        amount: 4800,  pointsEarned:  4, date: dateOnDow(6, 2, 11) },

      // ── Tuesday (DOW 2) ── 4 transactions ───────────────────────────────────
      { customer: c2, category: food,        amount: 4500,  pointsEarned:  4, date: dateOnDow(2, 0, 10) },
      { customer: c1, category: baby,        amount: 6000,  pointsEarned:  6, date: dateOnDow(2, 0, 12) },
      { customer: c3, category: food,        amount: 3800,  pointsEarned:  3, date: dateOnDow(2, 1, 11) },
      { customer: c4, category: fashion,     amount: 5000,  pointsEarned:  5, date: dateOnDow(2, 2, 14) },

      // ── Sunday (DOW 0) ── 3 transactions ────────────────────────────────────
      { customer: c1, category: food,        amount: 3500,  pointsEarned:  3, date: dateOnDow(0, 0, 13) },
      { customer: c2, category: baby,        amount: 4500,  pointsEarned:  4, date: dateOnDow(0, 1, 12) },
      { customer: c3, category: fashion,     amount: 3000,  pointsEarned:  3, date: dateOnDow(0, 2, 14) },
    ];

    // ── Insert via raw SQL so we can set created_at explicitly ──────────────
    // (@CreateDateColumn is managed by TypeORM and ignores the value on save)
    let inserted = 0;
    for (const tx of txns) {
      const key = `${SEED_KEY_PREFIX}${tx.customer.id}-${tx.category.slug}-${tx.date.toISOString()}`;
      await manager.query(
        `INSERT INTO transactions
           (id, idempotency_key, tenant_id, customer_id, category_id,
            amount, points_earned, points_balance_after, source, created_at)
         VALUES
           (gen_random_uuid(), $1, $2, $3, $4,
            $5, $6, $7, $8, $9)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [
          key,
          tenant.id,
          tx.customer.id,
          tx.category.id,
          tx.amount,
          tx.pointsEarned,
          tx.customer.pointsBalance,
          TransactionSource.FILE_IMPORT,
          tx.date.toISOString(),
        ],
      );
      inserted++;
    }

    console.log(`[seed:transactions] Inserted ${inserted} transactions`);
    console.log('[seed:transactions] Category split:');
    const catCount: Record<string, number> = {};
    for (const tx of txns) {
      catCount[tx.category.name] = (catCount[tx.category.name] ?? 0) + 1;
    }
    for (const [name, count] of Object.entries(catCount).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${name}: ${count} txns (${Math.round((count / txns.length) * 100)}%)`);
    }
    console.log('[seed:transactions] DOW distribution:');
    const dowLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dowCount: Record<number, number> = {};
    for (const tx of txns) {
      const d = tx.date.getDay();
      dowCount[d] = (dowCount[d] ?? 0) + 1;
    }
    for (let d = 0; d <= 6; d++) {
      console.log(`  ${dowLabels[d]}: ${dowCount[d] ?? 0} txns`);
    }
  });

  await SeedDataSource.destroy();
  console.log('[seed:transactions] Done.');
}

main().catch((err: unknown) => {
  console.error('[seed:transactions] FAILED:', err);
  process.exit(1);
});
