/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/**
 * Additive demo-data seed for "Jadefy Store" — customers + per-customer transactions.
 *
 * Inserts ~80 customers spread across the past 3 months so Reports shows:
 *   - Nice weekly new-customer bars (W1-W4) for "Last Month"
 *   - Active rate ~70%, Retention ~45%, Avg visits ~3.0
 *
 * SAFE: never touches tenant, users, passwords.
 * Idempotent: deletes seed rows before re-inserting, identified by:
 *   - customers:    phone_e164 LIKE '+234901%'
 *   - transactions: idempotency_key LIKE 'seed-cust-%'
 *
 * Run with:
 *   npx ts-node -r tsconfig-paths/register src/database/seeds/seed-jadefy-customers.ts
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

// ── Name pools ────────────────────────────────────────────────────────────────

const FEMALE_FIRST = [
  'Adaora', 'Chinyere', 'Ngozi', 'Amaka', 'Chioma', 'Uchenna', 'Blessing',
  'Ifunanya', 'Kemi', 'Titi', 'Yetunde', 'Folake', 'Bunmi', 'Shade', 'Ife',
  'Chiamaka', 'Patience', 'Ronke', 'Sola', 'Ifeoma', 'Uzoma', 'Nike',
  'Tobi', 'Lola', 'Kachi', 'Funmi', 'Bisi', 'Wunmi', 'Tola', 'Jumoke',
  'Nkechi', 'Ebele', 'Oluchi', 'Aisha', 'Fatima', 'Zainab', 'Halima',
];
const MALE_FIRST = [
  'Emeka', 'Nnamdi', 'Tobechukwu', 'Chukwudi', 'Bayo', 'Seun', 'Femi',
  'Wale', 'Abdullahi', 'Musa', 'Tunde', 'Bola', 'Gbenga', 'Rotimi', 'Dayo',
  'Chike', 'Ekene', 'Obinna', 'Dele', 'Kunle', 'Uche', 'Ike', 'Jide',
  'Tunji', 'Remi', 'Lanre', 'Deji', 'Ola', 'Idris', 'Kabir', 'Yahaya',
  'Ahmed', 'Hassan', 'Haruna', 'Aliyu', 'Danjuma', 'Yakubu', 'Sani',
];
const LAST_NAMES = [
  'Okafor', 'Nwosu', 'Eze', 'Okeke', 'Adeyemi', 'Bakare', 'Afolabi',
  'Olawale', 'Suleiman', 'Ibrahim', 'Bello', 'Garba', 'Lawal', 'Adesanya',
  'Badmus', 'Oyewole', 'Aminu', 'Aliyu', 'Ndukwe', 'Adeola', 'Fasanya',
  'Ogbonna', 'Ezeh', 'Aneke', 'Chukwu', 'Dike', 'Obi', 'Onuoha',
  'Mustapha', 'Kawu', 'Bello', 'Yusuf', 'Salisu', 'Makarfi',
];

let nameIdx = 0;
function nextName(): string {
  const allFirst = [...FEMALE_FIRST, ...MALE_FIRST];
  const first = allFirst[nameIdx % allFirst.length];
  const last = LAST_NAMES[Math.floor(nameIdx / allFirst.length) % LAST_NAMES.length];
  nameIdx++;
  return `${first} ${last}`;
}

let phoneSeq = 1000001;
function nextPhone(): string {
  return `+234901${phoneSeq++}`;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function daysAgo(days: number, hour = 10): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, Math.floor(Math.random() * 60), 0, 0);
  return d;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// ── Tier helper ───────────────────────────────────────────────────────────────

function pickTier(tiers: TierConfig[]): TierConfig {
  const r = Math.random();
  if (r < 0.62) return tiers.find((t) => t.tierName === 'standard') ?? tiers[0];
  if (r < 0.90) return tiers.find((t) => t.tierName === 'mid') ?? tiers[0];
  return tiers.find((t) => t.tierName === 'vip') ?? tiers[0];
}

// ── Customer spec ─────────────────────────────────────────────────────────────

type CustSpec = {
  name: string;
  phone: string;
  createdAt: Date;
  lastPurchaseAt: Date;
  purchaseCount: number;
  pointsBalance: number;
  lifetimePoints: number;
  totalSpend: number;
  quarterlySpend: number;
  tierId: string;
  waOptedIn: boolean;
  transactions: Array<{ date: Date; amount: number; points: number }>;
};

function buildCustomer(
  createdAt: Date,
  secondTxnOffset: number | null, // days after createdAt for 2nd transaction (null = no 2nd txn)
  tier: TierConfig,
  baseAmount: number,
): CustSpec {
  const txn1Date = createdAt;
  const txn1Amount = baseAmount + Math.floor(Math.random() * 3000);
  const txn1Points = Math.floor(txn1Amount / 1000);

  const transactions: CustSpec['transactions'] = [
    { date: txn1Date, amount: txn1Amount, points: txn1Points },
  ];

  let totalSpend = txn1Amount;
  let totalPoints = txn1Points;
  let lastPurchaseAt = txn1Date;

  if (secondTxnOffset !== null) {
    const txn2Date = addDays(createdAt, secondTxnOffset);
    const txn2Amount = baseAmount + Math.floor(Math.random() * 4000);
    const txn2Points = Math.floor(txn2Amount / 1000);
    transactions.push({ date: txn2Date, amount: txn2Amount, points: txn2Points });
    totalSpend += txn2Amount;
    totalPoints += txn2Points;
    lastPurchaseAt = txn2Date;
  }

  const purchaseCount = transactions.length;

  return {
    name: nextName(),
    phone: nextPhone(),
    createdAt,
    lastPurchaseAt,
    purchaseCount,
    pointsBalance: totalPoints,
    lifetimePoints: totalPoints,
    totalSpend,
    quarterlySpend: totalSpend,
    tierId: tier.id,
    waOptedIn: Math.random() > 0.08,
    transactions,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await SeedDataSource.initialize();

  await SeedDataSource.transaction(async (manager) => {
    const tenant = await manager.findOne(Tenant, { where: { slug: TENANT_SLUG } });
    if (!tenant) throw new Error(`Tenant "${TENANT_SLUG}" not found — run seed-jadefy.ts first.`);
    console.log(`[seed:customers] Tenant: ${tenant.id} (${tenant.businessName})`);

    const tiers = await manager.find(TierConfig, { where: { tenantId: tenant.id } });
    if (tiers.length === 0) throw new Error('No tier configs found — run seed-jadefy.ts first.');

    const categories = await manager.find(ProductCategory, { where: { tenantId: tenant.id } });
    const foodCat = categories.find((c) => c.slug === 'food') ?? categories[0];

    // ── Idempotent cleanup ──────────────────────────────────────────────────
    const delTxn = await manager.query(
      `DELETE FROM transactions WHERE tenant_id = $1 AND idempotency_key LIKE 'seed-cust-%'`,
      [tenant.id],
    );
    const delCust = await manager.query(
      `DELETE FROM customers WHERE tenant_id = $1 AND phone_e164 LIKE '+234901%'`,
      [tenant.id],
    );
    console.log(`[seed:customers] Removed ${String(delCust[1] ?? 0)} old customers, ${String(delTxn[1] ?? 0)} old transactions`);

    // ── Build customer specs ────────────────────────────────────────────────
    const specs: CustSpec[] = [];

    // Historical: March (daysAgo 108-79) — 8 customers, no 2nd txn in May
    for (let i = 0; i < 8; i++) {
      const ago = 108 - Math.floor(i * 3.6);
      specs.push(buildCustomer(daysAgo(ago), null, pickTier(tiers), 4000));
    }

    // Historical: April (daysAgo 78-48) — 12 customers
    for (let i = 0; i < 12; i++) {
      const ago = 78 - Math.floor(i * 2.5);
      specs.push(buildCustomer(daysAgo(ago), null, pickTier(tiers), 4500));
    }

    // May W1 (daysAgo 47-41) — 10 customers, 2nd txn +7 days (stays in May ✓)
    for (let i = 0; i < 10; i++) {
      const ago = 47 - Math.floor(i * 0.6);
      specs.push(buildCustomer(daysAgo(ago), 7, pickTier(tiers), 5000));
    }

    // May W2 (daysAgo 40-34) — 14 customers, 2nd txn +7 days (stays in May ✓)
    for (let i = 0; i < 14; i++) {
      const ago = 40 - Math.floor(i * 0.43);
      specs.push(buildCustomer(daysAgo(ago), 7, pickTier(tiers), 5500));
    }

    // May W3 (daysAgo 33-27) — 16 customers, 2nd txn +7 days (stays in May ✓)
    for (let i = 0; i < 16; i++) {
      const ago = 33 - Math.floor(i * 0.375);
      specs.push(buildCustomer(daysAgo(ago), 7, pickTier(tiers), 6000));
    }

    // May W4 (daysAgo 26-17) — 10 customers
    // Those registered May 22-25 (daysAgo 26-22): 2nd txn +7 still in May ✓
    // Those registered May 26-31 (daysAgo 21-17): 2nd txn +7 falls in June
    for (let i = 0; i < 10; i++) {
      const ago = 26 - Math.floor(i * 0.9);
      const secondOffset = ago >= 22 ? 7 : null; // only early-W4 gets 2nd May txn
      specs.push(buildCustomer(daysAgo(ago), secondOffset, pickTier(tiers), 5800));
    }

    // June W1 (daysAgo 16-10) — 8 customers, 2nd txn +5
    for (let i = 0; i < 8; i++) {
      const ago = 16 - Math.floor(i * 0.75);
      specs.push(buildCustomer(daysAgo(ago), 5, pickTier(tiers), 6000));
    }

    // June W2 (daysAgo 9-3) — 8 customers, 2nd txn +3
    for (let i = 0; i < 8; i++) {
      const ago = 9 - Math.floor(i * 0.75);
      const secondOffset = ago >= 4 ? 3 : null;
      specs.push(buildCustomer(daysAgo(ago), secondOffset, pickTier(tiers), 6500));
    }

    // June W3: last few days (daysAgo 2-0) — 4 customers, no 2nd txn yet
    for (let i = 0; i < 4; i++) {
      const ago = 2 - i;
      specs.push(buildCustomer(daysAgo(Math.max(0, ago)), null, pickTier(tiers), 5000));
    }

    console.log(`[seed:customers] Building ${specs.length} customer specs`);

    // ── Insert customers via raw SQL (to control created_at) ──────────────
    const customerIds: string[] = [];
    let custInserted = 0;
    for (const s of specs) {
      const rows = await manager.query(
        `INSERT INTO customers
           (id, tenant_id, full_name, phone_e164,
            wa_opted_in, wa_opted_in_at,
            points_balance, lifetime_points,
            total_spend, quarterly_spend,
            tier_id, purchase_count, last_purchase_at,
            source, is_active, created_at)
         VALUES
           (gen_random_uuid(), $1, $2, $3,
            $4, $5,
            $6, $7,
            $8, $9,
            $10, $11, $12,
            'qr_registration', true, $13)
         RETURNING id`,
        [
          tenant.id,
          s.name,
          s.phone,
          s.waOptedIn,
          s.waOptedIn ? s.createdAt.toISOString() : null,
          s.pointsBalance,
          s.lifetimePoints,
          s.totalSpend,
          s.quarterlySpend,
          s.tierId,
          s.purchaseCount,
          s.lastPurchaseAt.toISOString(),
          s.createdAt.toISOString(),
        ],
      );
      const custId = String((rows as Array<{ id: string }>)[0].id);
      customerIds.push(custId);
      custInserted++;

      // ── Insert transactions for this customer ────────────────────────────
      let runningBalance = 0;
      for (const txn of s.transactions) {
        runningBalance += txn.points;
        const iKey = `seed-cust-${custId}-${txn.date.toISOString()}`;
        await manager.query(
          `INSERT INTO transactions
             (id, idempotency_key, tenant_id, customer_id, category_id,
              amount, points_earned, points_balance_after, source, created_at)
           VALUES
             (gen_random_uuid(), $1, $2, $3, $4,
              $5, $6, $7, $8, $9)
           ON CONFLICT (idempotency_key) DO NOTHING`,
          [
            iKey,
            tenant.id,
            custId,
            foodCat.id,
            txn.amount,
            txn.points,
            runningBalance,
            TransactionSource.FILE_IMPORT,
            txn.date.toISOString(),
          ],
        );
      }
    }

    // Summary
    const totalTxns = specs.reduce((s, c) => s + c.transactions.length, 0);
    const repeatBuyers = specs.filter((c) => c.transactions.length >= 2).length;
    const mayCustomers = specs.filter(
      (c) => {
        const m = c.createdAt.getMonth();
        return m === 4; // May = 4 (0-indexed)
      }
    ).length;

    console.log(`[seed:customers] Inserted ${custInserted} customers, ${totalTxns} transactions`);
    console.log(`[seed:customers] May customers: ${mayCustomers}`);
    console.log(`[seed:customers] Customers with 2+ transactions: ${repeatBuyers}`);
    console.log(`[seed:customers] Phone range: +2349011000001 – +234901${phoneSeq - 1}`);
  });

  await SeedDataSource.destroy();
  console.log('[seed:customers] Done — remember to run clear-jadefy-snapshots.ts next.');
}

main().catch((err: unknown) => {
  console.error('[seed:customers] FAILED:', err);
  process.exit(1);
});
