/**
 * Reconciliation demo seed for "Jadefy Store".
 *
 * Replaces the old Reports-page transaction seed (seed-jadefy-txn-* keys)
 * with 45 properly attributed transactions that demonstrate every scenario
 * on the Reconciliation dashboard while ALSO preserving the Reports page's
 * day-of-week and category distribution.
 *
 * Scenarios demonstrated:
 *
 *   Integrity card (Last 30 days) → RED (~15% discrepancy)
 *     Emeka inflates points 8× on 5 transactions (+35,000 pts extra)
 *
 *   Integrity card (Today)        → GREEN (0% discrepancy)
 *     Today's transactions have correct points
 *
 *   Cashier breakdown:
 *     Kemi Adewale  CASHIER  — ✓ Normal  avg ₦6,506, 0 manual inflation
 *     Emeka Nwosu   CASHIER  — ⚠ Review  avg ₦1,083, 100% manual, inflated pts
 *     Store Owner   OWNER    — ✓ Normal  avg ₦6,700
 *     System        —        — ✓ Normal  webhook + file_import
 *
 *   Source breakdown (Last 30 days):
 *     Terminal-verified  webhook + file_import   9 tx (20%)
 *     Manual             cashier_app            36 tx (80%)
 *
 *   DOW distribution (for Reports page):
 *     Friday: 10 · Monday: 7 · Wednesday: 6 · Thursday: 5
 *     Saturday: 5 · Tuesday: 4 · Sunday: 3  (Friday = busiest)
 *
 *   Category split (for Reports page):
 *     Food & Groceries 45% · Baby Products 25%
 *     Fashion 18%          · Electronics 12%
 *
 * Prerequisites: seed-jadefy.ts and seed-jadefy-redemptions.ts
 *
 * Run with:
 *   npm run seed:jadefy:reconciliation
 */
import 'reflect-metadata';
import * as path from 'path';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { Tenant } from '../../modules/tenants/entities/tenant.entity';
import { TierConfig } from '../../modules/tenants/entities/tier-config.entity';
import { ProductCategory } from '../../modules/tenants/entities/product-category.entity';
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
  entities: [Tenant, TierConfig, ProductCategory, User, Customer],
  namingStrategy: new SnakeNamingStrategy(),
  synchronize: false,
  logging: false,
});

const TENANT_SLUG = 'jadefy-store';
const SEED_NOTE = '[demo-recon-seed]';
const OLD_SEED_PREFIX = 'seed-jadefy-txn-'; // from the old reports-page seed

// ── Timestamp helpers ─────────────────────────────────────────────────────────

function at(daysAgo: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/** daysAgo that lands on a given ISO day-of-week (1=Mon … 7=Sun) */
function onDow(targetDow: number, weeksBack: number, hour = 11): string {
  const now = new Date();
  // getDay() is 0=Sun, convert to ISO (1=Mon..7=Sun)
  const todayIso = now.getDay() === 0 ? 7 : now.getDay();
  let diff = todayIso - targetDow;
  if (diff < 0) diff += 7;
  const d = new Date(now);
  d.setDate(d.getDate() - diff - weeksBack * 7);
  d.setHours(hour, 30, 0, 0);
  return d.toISOString();
}

// ── Transaction spec ──────────────────────────────────────────────────────────

type Source = 'cashier_app' | 'webhook' | 'file_import';

interface TxSpec {
  id: string;
  cashierKey: 'kemi' | 'emeka' | 'owner' | 'system';
  customerKey: 'adaeze' | 'chidinma' | 'tunde' | 'funke' | 'ibrahim' | 'grace';
  catSlug: 'food' | 'baby_products' | 'electronics' | 'fashion';
  amount: number;
  points: number;     // intentionally wrong on Emeka's 5 inflated rows
  source: Source;
  ts: string;
}

// ── Transaction data ──────────────────────────────────────────────────────────
// Total: 45 tx
// ▸ Kemi   18 tx · all correct points · ✓ Normal
// ▸ Emeka  12 tx · 5 inflated 8× · ⚠ Review (avg low + 100% manual)
// ▸ Owner   6 tx · all correct · ✓ Normal
// ▸ Webhook 5 tx · terminal-verified
// ▸ File    4 tx · terminal-verified
//
// DOW distribution driven by the day embedded in each ts timestamp.
// earnRate=1 → expectedPoints = amount for all non-inflated rows.

const TX: TxSpec[] = [

  // ════════════════════════════════════════════════════════════════════════════
  // KEMI ADEWALE — ✓ Normal cashier — Friday peak + other days
  // avg = ₦117,100 / 18 = ₦6,506 › well above 60% of store avg
  // ════════════════════════════════════════════════════════════════════════════

  // Friday (DOW 5 = ISO 5) — busiest day
  { id: 'k-01', cashierKey: 'kemi', customerKey: 'adaeze',   catSlug: 'food',        amount: 8500,  points: 8500,  source: 'cashier_app', ts: onDow(5, 0, 10) },
  { id: 'k-02', cashierKey: 'kemi', customerKey: 'chidinma', catSlug: 'food',        amount: 12000, points: 12000, source: 'cashier_app', ts: onDow(5, 0, 11) },
  { id: 'k-03', cashierKey: 'kemi', customerKey: 'tunde',    catSlug: 'baby_products', amount: 6500, points: 6500, source: 'cashier_app', ts: onDow(5, 0, 12) },
  { id: 'k-04', cashierKey: 'kemi', customerKey: 'funke',    catSlug: 'fashion',     amount: 9000,  points: 9000,  source: 'cashier_app', ts: onDow(5, 0, 14) },
  { id: 'k-05', cashierKey: 'kemi', customerKey: 'ibrahim',  catSlug: 'food',        amount: 4500,  points: 4500,  source: 'cashier_app', ts: onDow(5, 0, 15) },
  { id: 'k-06', cashierKey: 'kemi', customerKey: 'adaeze',   catSlug: 'food',        amount: 7200,  points: 7200,  source: 'cashier_app', ts: onDow(5, 1, 10) },
  { id: 'k-07', cashierKey: 'kemi', customerKey: 'chidinma', catSlug: 'baby_products', amount: 5500, points: 5500, source: 'cashier_app', ts: onDow(5, 1, 11) },

  // Today — 2 tx (so Today view has data)
  { id: 'k-08', cashierKey: 'kemi', customerKey: 'adaeze',   catSlug: 'food',        amount: 7500,  points: 7500,  source: 'cashier_app', ts: at(0, 9, 30) },
  { id: 'k-09', cashierKey: 'kemi', customerKey: 'chidinma', catSlug: 'baby_products', amount: 5200, points: 5200, source: 'cashier_app', ts: at(0, 14, 15) },

  // Spread across the month
  { id: 'k-10', cashierKey: 'kemi', customerKey: 'tunde',    catSlug: 'food',        amount: 9800,  points: 9800,  source: 'cashier_app', ts: onDow(5, 2, 13) },
  { id: 'k-11', cashierKey: 'kemi', customerKey: 'grace',    catSlug: 'electronics', amount: 24000, points: 24000, source: 'cashier_app', ts: at(9, 14, 0) },
  { id: 'k-12', cashierKey: 'kemi', customerKey: 'funke',    catSlug: 'fashion',     amount: 6000,  points: 6000,  source: 'cashier_app', ts: at(11, 10, 0) },
  { id: 'k-13', cashierKey: 'kemi', customerKey: 'ibrahim',  catSlug: 'food',        amount: 4800,  points: 4800,  source: 'cashier_app', ts: at(15, 10, 45) },
  { id: 'k-14', cashierKey: 'kemi', customerKey: 'adaeze',   catSlug: 'food',        amount: 7600,  points: 7600,  source: 'cashier_app', ts: at(17, 13, 0) },
  { id: 'k-15', cashierKey: 'kemi', customerKey: 'chidinma', catSlug: 'baby_products', amount: 6100, points: 6100, source: 'cashier_app', ts: at(19, 11, 0) },
  { id: 'k-16', cashierKey: 'kemi', customerKey: 'tunde',    catSlug: 'fashion',     amount: 5300,  points: 5300,  source: 'cashier_app', ts: at(21, 15, 15) },
  { id: 'k-17', cashierKey: 'kemi', customerKey: 'grace',    catSlug: 'food',        amount: 8500,  points: 8500,  source: 'cashier_app', ts: at(23, 10, 30) },
  { id: 'k-18', cashierKey: 'kemi', customerKey: 'adaeze',   catSlug: 'food',        amount: 7900,  points: 7900,  source: 'cashier_app', ts: at(28, 13, 0) },
  // Kemi: 18 tx · ₦117,100 · avg ₦6,506 · points = amounts (correct) ✓

  // ════════════════════════════════════════════════════════════════════════════
  // EMEKA NWOSU — ⚠ Review cashier
  //   avg ₦1,083 → 21% of store avg (₦5,036) → below 60% threshold
  //   100% cashier_app → manual entry flag triggers too
  //   5 inflated entries: amount ₦1,000 but points issued = 8,000
  //     → +35,000 pts over-awarded → ~15% overall discrepancy
  // ════════════════════════════════════════════════════════════════════════════

  // Today — 1 tx, NOT inflated (so Today view stays green)
  { id: 'e-01', cashierKey: 'emeka', customerKey: 'ibrahim', catSlug: 'food',        amount: 1200,  points: 1200,  source: 'cashier_app', ts: at(0, 11, 0) },

  // ⚠ INFLATED: amount ₦1,000 but 8,000 pts issued — simulates point manipulation
  { id: 'e-02', cashierKey: 'emeka', customerKey: 'grace',    catSlug: 'baby_products', amount: 1000, points: 8000, source: 'cashier_app', ts: onDow(1, 0, 9) },
  { id: 'e-03', cashierKey: 'emeka', customerKey: 'ibrahim',  catSlug: 'food',        amount: 1000,  points: 8000,  source: 'cashier_app', ts: onDow(2, 0, 10) },
  { id: 'e-04', cashierKey: 'emeka', customerKey: 'tunde',    catSlug: 'food',        amount: 1000,  points: 8000,  source: 'cashier_app', ts: onDow(3, 1, 11) },
  { id: 'e-05', cashierKey: 'emeka', customerKey: 'grace',    catSlug: 'baby_products', amount: 1000, points: 8000, source: 'cashier_app', ts: onDow(4, 0, 10) },
  { id: 'e-06', cashierKey: 'emeka', customerKey: 'funke',    catSlug: 'food',        amount: 1000,  points: 8000,  source: 'cashier_app', ts: onDow(1, 1, 14) },

  // Normal low-value entries (honest but under-recording suggests cash-back skimming)
  { id: 'e-07', cashierKey: 'emeka', customerKey: 'adaeze',   catSlug: 'food',        amount: 1500,  points: 1500,  source: 'cashier_app', ts: onDow(2, 1, 11) },
  { id: 'e-08', cashierKey: 'emeka', customerKey: 'chidinma', catSlug: 'baby_products', amount: 1200, points: 1200, source: 'cashier_app', ts: at(6, 10, 30) },
  { id: 'e-09', cashierKey: 'emeka', customerKey: 'tunde',    catSlug: 'food',        amount: 800,   points: 800,   source: 'cashier_app', ts: at(10, 13, 0) },
  { id: 'e-10', cashierKey: 'emeka', customerKey: 'grace',    catSlug: 'baby_products', amount: 1300, points: 1300, source: 'cashier_app', ts: at(14, 11, 30) },
  { id: 'e-11', cashierKey: 'emeka', customerKey: 'ibrahim',  catSlug: 'food',        amount: 900,   points: 900,   source: 'cashier_app', ts: at(18, 14, 0) },
  { id: 'e-12', cashierKey: 'emeka', customerKey: 'funke',    catSlug: 'fashion',     amount: 1100,  points: 1100,  source: 'cashier_app', ts: at(22, 10, 0) },
  // Emeka: 12 tx · ₦13,000 amount · 48,000 pts · avg ₦1,083 · 100% manual ⚠

  // ════════════════════════════════════════════════════════════════════════════
  // STORE OWNER — ✓ Normal · Monday/Wednesday/Thursday manager entries
  // ════════════════════════════════════════════════════════════════════════════

  // Today — 1 tx
  { id: 'o-01', cashierKey: 'owner', customerKey: 'adaeze',   catSlug: 'food',        amount: 6500,  points: 6500,  source: 'cashier_app', ts: at(0, 16, 30) },

  { id: 'o-02', cashierKey: 'owner', customerKey: 'chidinma', catSlug: 'baby_products', amount: 8500, points: 8500, source: 'cashier_app', ts: onDow(1, 0, 10) },
  { id: 'o-03', cashierKey: 'owner', customerKey: 'tunde',    catSlug: 'food',        amount: 4500,  points: 4500,  source: 'cashier_app', ts: onDow(1, 1, 11) },
  { id: 'o-04', cashierKey: 'owner', customerKey: 'funke',    catSlug: 'electronics', amount: 18000, points: 18000, source: 'cashier_app', ts: onDow(3, 0, 12) },
  { id: 'o-05', cashierKey: 'owner', customerKey: 'ibrahim',  catSlug: 'food',        amount: 5800,  points: 5800,  source: 'cashier_app', ts: at(6, 11, 0) },
  { id: 'o-06', cashierKey: 'owner', customerKey: 'grace',    catSlug: 'fashion',     amount: 7500,  points: 7500,  source: 'cashier_app', ts: at(12, 14, 0) },
  // Owner: 6 tx · ₦50,800 · avg ₦8,467 · correct points ✓

  // ════════════════════════════════════════════════════════════════════════════
  // WEBHOOK — terminal-verified · no cashier · Saturday / Thursday entries
  // ════════════════════════════════════════════════════════════════════════════

  { id: 'wh-01', cashierKey: 'system', customerKey: 'adaeze',   catSlug: 'food',        amount: 5000,  points: 5000,  source: 'webhook', ts: onDow(6, 0, 11) },
  { id: 'wh-02', cashierKey: 'system', customerKey: 'chidinma', catSlug: 'food',        amount: 8000,  points: 8000,  source: 'webhook', ts: onDow(6, 0, 12) },
  { id: 'wh-03', cashierKey: 'system', customerKey: 'tunde',    catSlug: 'fashion',     amount: 5500,  points: 5500,  source: 'webhook', ts: onDow(6, 1, 10) },
  { id: 'wh-04', cashierKey: 'system', customerKey: 'funke',    catSlug: 'food',        amount: 6200,  points: 6200,  source: 'webhook', ts: onDow(4, 1, 11) },
  { id: 'wh-05', cashierKey: 'system', customerKey: 'ibrahim',  catSlug: 'electronics', amount: 12000, points: 12000, source: 'webhook', ts: onDow(4, 2, 10) },
  // Webhook: 5 tx · ₦36,700 · terminal-verified

  // ════════════════════════════════════════════════════════════════════════════
  // FILE IMPORT — terminal-verified · Sunday / Tuesday entries
  // ════════════════════════════════════════════════════════════════════════════

  { id: 'fi-01', cashierKey: 'system', customerKey: 'adaeze',   catSlug: 'food',        amount: 3500,  points: 3500,  source: 'file_import', ts: onDow(0, 0, 13) },
  { id: 'fi-02', cashierKey: 'system', customerKey: 'chidinma', catSlug: 'baby_products', amount: 4500, points: 4500, source: 'file_import', ts: onDow(0, 1, 12) },
  { id: 'fi-03', cashierKey: 'system', customerKey: 'tunde',    catSlug: 'fashion',     amount: 3000,  points: 3000,  source: 'file_import', ts: onDow(2, 2, 14) },
  { id: 'fi-04', cashierKey: 'system', customerKey: 'funke',    catSlug: 'electronics', amount: 15000, points: 15000, source: 'file_import', ts: onDow(3, 2, 10) },
  // File import: 4 tx · ₦26,000 · terminal-verified
];

// ─────────────────────────────────────────────────────────────────────────────
// Grand totals (all 45 tx, earnRate=1):
//   Total spend:  ₦243,600
//   Expected pts: 243,600
//   Actual pts:   278,600  (+35,000 from Emeka's inflated entries)
//   Discrepancy:  +35,000 (~14.4%) → 🔴 RED on Last 30 days
//
// Today only (kemi-08, kemi-09, emeka-01, owner-01):
//   Total spend:  ₦20,400
//   Expected pts: 20,400
//   Actual pts:   20,400 → ✓ GREEN on Today view
//
// Source breakdown (all 45 tx):
//   cashier_app  36 tx  (80%)  manual
//   webhook       5 tx  (11%)  terminal-verified
//   file_import   4 tx   (9%)  terminal-verified
//
// Cashier breakdown (avg vs store avg ≈ ₦5,413):
//   Kemi   ₦6,506  ✓ Normal
//   Owner  ₦8,467  ✓ Normal
//   Emeka  ₦1,083  ⚠ Review (below 60% = ₦3,248, AND 100% manual)
//   System ₦5,558  ✓ Normal
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  await SeedDataSource.initialize();

  await SeedDataSource.transaction(async (manager) => {
    // ── 1. Find tenant ────────────────────────────────────────────────────────
    const tenant = await manager.findOne(Tenant, { where: { slug: TENANT_SLUG } });
    if (!tenant) {
      throw new Error(`Tenant "${TENANT_SLUG}" not found — run seed-jadefy.ts first.`);
    }
    console.log(`[seed:recon] Tenant: ${tenant.id} (${tenant.businessName})`);
    console.log(`[seed:recon] pointsEarnRate = ${String(tenant.pointsEarnRate)}`);

    // ── 2. Find or create cashier users ──────────────────────────────────────
    const demoPassword = await bcrypt.hash('Demo@2026!', 10);

    async function findOrCreate(email: string, fullName: string, role: UserRole): Promise<User> {
      let u = await manager.findOne(User, { where: { email, tenantId: tenant!.id } });
      if (!u) {
        u = await manager.save(
          manager.create(User, {
            tenantId: tenant!.id,
            email,
            hashedPassword: demoPassword,
            fullName,
            role,
            isActive: true,
            emailVerifiedAt: new Date(),
          }),
        );
        console.log(`[seed:recon] Created user: ${fullName} (${role})`);
      } else {
        console.log(`[seed:recon] Found user: ${fullName}`);
      }
      return u;
    }

    const kemi  = await findOrCreate('kemi@jadefystore.com',  'Kemi Adewale', UserRole.CASHIER);
    const emeka = await findOrCreate('emeka@jadefystore.com', 'Emeka Nwosu',  UserRole.CASHIER);
    const owner = await manager.findOne(User, {
      where: { tenantId: tenant.id, role: UserRole.OWNER, isActive: true },
    });
    if (!owner) throw new Error('No owner found — run seed-jadefy.ts first.');

    const cashierIdOf: Record<string, string | null> = {
      kemi:   kemi.id,
      emeka:  emeka.id,
      owner:  owner.id,
      system: null,
    };

    // ── 3. Find customers ─────────────────────────────────────────────────────
    const PHONES: Record<string, string> = {
      adaeze:   '+2348031234001',
      chidinma: '+2348031234002',
      tunde:    '+2348031234003',
      funke:    '+2348031234004',
      ibrahim:  '+2348031234005',
      grace:    '+2348031234006',
    };
    const custId: Record<string, string> = {};
    for (const [key, phone] of Object.entries(PHONES)) {
      const c = await manager.findOne(Customer, { where: { tenantId: tenant.id, phoneE164: phone } });
      if (!c) throw new Error(`Customer ${key} not found — run seed-jadefy.ts first.`);
      custId[key] = c.id;
    }

    // ── 4. Find categories ────────────────────────────────────────────────────
    const cats = await manager.find(ProductCategory, { where: { tenantId: tenant.id } });
    const catId: Record<string, string> = Object.fromEntries(cats.map((c) => [c.slug, c.id]));
    if (!catId['food']) throw new Error('No categories found — run seed-jadefy.ts first.');

    // ── 5. Idempotent cleanup ─────────────────────────────────────────────────
    // Remove the old Reports-page seed (which had wrong points) and our own rows.
    const oldDel = await manager.query(
      `DELETE FROM transactions WHERE tenant_id = $1 AND idempotency_key LIKE $2`,
      [tenant.id, `${OLD_SEED_PREFIX}%`],
    );
    const myDel = await manager.query(
      `DELETE FROM transactions WHERE tenant_id = $1 AND notes = $2`,
      [tenant.id, SEED_NOTE],
    );
    console.log(`[seed:recon] Removed ${String(oldDel[1] ?? 0)} old reports-seed rows`);
    console.log(`[seed:recon] Removed ${String(myDel[1] ?? 0)} old recon-seed rows`);

    // ── 6. Insert transactions ────────────────────────────────────────────────
    let inserted = 0;
    let totalAmount = 0;
    let totalPoints = 0;

    for (const spec of TX) {
      await manager.query(
        `INSERT INTO transactions
           (id, idempotency_key, tenant_id, customer_id, category_id, logged_by_user_id,
            amount, points_earned, points_balance_after, source, notes, created_at)
         VALUES
           (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          `demo-recon-${spec.id}`,        // $1  idempotency_key
          tenant.id,                       // $2  tenant_id
          custId[spec.customerKey],        // $3  customer_id
          catId[spec.catSlug],             // $4  category_id
          cashierIdOf[spec.cashierKey],    // $5  logged_by_user_id (null for system)
          spec.amount,                     // $6  amount
          spec.points,                     // $7  points_earned
          0,                               // $8  points_balance_after (placeholder)
          spec.source,                     // $9  source
          SEED_NOTE,                       // $10 notes
          spec.ts,                         // $11 created_at
        ],
      );
      inserted++;
      totalAmount += spec.amount;
      totalPoints += spec.points;
    }

    const earnRate = Number(tenant.pointsEarnRate);
    const expectedPoints = Math.floor(totalAmount / earnRate);
    const discrepancy = totalPoints - expectedPoints;
    const discPct = expectedPoints > 0 ? Math.round((discrepancy / expectedPoints) * 100) : 0;

    console.log(`\n[seed:recon] ✓ Inserted ${inserted} transactions`);
    console.log(`[seed:recon] Total spend:    ₦${totalAmount.toLocaleString()}`);
    console.log(`[seed:recon] Expected pts:   ${expectedPoints.toLocaleString()}`);
    console.log(`[seed:recon] Actual pts:     ${totalPoints.toLocaleString()}`);
    console.log(`[seed:recon] Discrepancy:    +${discrepancy.toLocaleString()} pts (${discPct}%)`);

    console.log('\n[seed:recon] Expected Reconciliation page behaviour:');
    console.log('[seed:recon]   ┌── Today      → ✓ GREEN  card  (0% discrepancy, 4 tx)');
    console.log('[seed:recon]   ├── Last 7 days → 🔴 RED   card  (~15% discrepancy)');
    console.log('[seed:recon]   └── Last 30 days→ 🔴 RED   card  (~15% discrepancy)');
    console.log('[seed:recon]   Cashier breakdown:');
    console.log('[seed:recon]     Kemi   → ✓ Normal  (avg ₦6,506)');
    console.log('[seed:recon]     Owner  → ✓ Normal  (avg ₦8,467)');
    console.log('[seed:recon]     Emeka  → ⚠ Review  (avg ₦1,083, 100% manual, pts inflated)');
    console.log('[seed:recon]     System → ✓ Normal  (webhook + file_import)');
    console.log('[seed:recon]   Source breakdown: 80% manual · 20% terminal-verified');

    console.log('\n[seed:recon] Cashier logins (for testing cashier-specific tx view):');
    console.log('[seed:recon]   kemi@jadefystore.com  / Demo@2026!');
    console.log('[seed:recon]   emeka@jadefystore.com / Demo@2026!');

    // ── 7. Seed redemptions ───────────────────────────────────────────────────
    // Covers today → last 30 days so every date preset shows live data in the
    // "Rewards redeemed this period" section of the reconciliation page.
    const THRESHOLD = Number(tenant.pointsThreshold); // 1,000
    const REWARD_VAL = Number(tenant.rewardValue);    // ₦1,000

    const oldRedNotes = ['[demo-seed]', SEED_NOTE];
    const redDel = await manager.query(
      `DELETE FROM redemptions WHERE tenant_id = $1 AND notes = ANY($2::text[])`,
      [tenant.id, oldRedNotes],
    );
    console.log(`\n[seed:recon] Removed ${String(redDel[1] ?? 0)} old redemption rows`);

    type RedSpec = {
      customerId: string;
      cashierId: string;
      rewardsCount: number;
      pointsRedeemed: number;
      value: number;
      balanceAfter: number;
      redeemedAt: string;
    };

    const redemptionRows: RedSpec[] = [
      // ── TODAY (visible on "Today" preset) ────────────────────────────────
      { customerId: custId.adaeze,   cashierId: kemi.id,    rewardsCount: 1,
        pointsRedeemed: THRESHOLD, value: REWARD_VAL, balanceAfter: 200,  redeemedAt: at(0, 10, 15) },
      { customerId: custId.funke,    cashierId: owner.id,   rewardsCount: 1,
        pointsRedeemed: THRESHOLD, value: REWARD_VAL, balanceAfter: 500,  redeemedAt: at(0, 13, 45) },

      // ── LAST 7 DAYS (also appear on "Last 7 days") ───────────────────────
      { customerId: custId.chidinma, cashierId: kemi.id,    rewardsCount: 1,
        pointsRedeemed: THRESHOLD, value: REWARD_VAL, balanceAfter: 1200, redeemedAt: at(2, 11, 30) },
      // Ibrahim processed by Emeka — adds context to his flagged status
      { customerId: custId.ibrahim,  cashierId: emeka.id,   rewardsCount: 1,
        pointsRedeemed: THRESHOLD, value: REWARD_VAL, balanceAfter: 100,  redeemedAt: at(5, 14, 0) },

      // ── OLDER (visible on "Last 30 days") ────────────────────────────────
      { customerId: custId.tunde,    cashierId: kemi.id,    rewardsCount: 2,
        pointsRedeemed: 2 * THRESHOLD, value: 2 * REWARD_VAL, balanceAfter: 800, redeemedAt: at(10, 12, 0) },
      { customerId: custId.adaeze,   cashierId: owner.id,   rewardsCount: 1,
        pointsRedeemed: THRESHOLD, value: REWARD_VAL, balanceAfter: 400,  redeemedAt: at(15, 10, 0) },
      { customerId: custId.grace,    cashierId: kemi.id,    rewardsCount: 1,
        pointsRedeemed: THRESHOLD, value: REWARD_VAL, balanceAfter: 300,  redeemedAt: at(20, 15, 30) },
      { customerId: custId.chidinma, cashierId: owner.id,   rewardsCount: 1,
        pointsRedeemed: THRESHOLD, value: REWARD_VAL, balanceAfter: 600,  redeemedAt: at(25, 11, 0) },
    ];

    for (const r of redemptionRows) {
      await manager.query(
        `INSERT INTO redemptions
           (id, tenant_id, customer_id, cashier_id,
            rewards_count, points_redeemed, value, balance_after, notes, redeemed_at)
         VALUES
           (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [tenant.id, r.customerId, r.cashierId,
         r.rewardsCount, r.pointsRedeemed, r.value,
         r.balanceAfter, SEED_NOTE, r.redeemedAt],
      );
    }

    const totalRedValue = redemptionRows.reduce((s, r) => s + r.value, 0);
    const totalRedCount = redemptionRows.reduce((s, r) => s + r.rewardsCount, 0);
    console.log(`[seed:recon] ✓ Inserted ${redemptionRows.length} redemption records`);
    console.log(`[seed:recon] Total rewards given: ${totalRedCount}  ·  Value: ₦${totalRedValue.toLocaleString()}`);
    console.log('[seed:recon] Redemptions by period:');
    console.log('[seed:recon]   Today       → 2 redemptions (Adaeze + Funke with Kemi & Owner)');
    console.log('[seed:recon]   Last 7 days → 4 redemptions (+Chidinma, Ibrahim/Emeka)');
    console.log('[seed:recon]   Last 30 days→ 8 redemptions (10 rewards total, ₦10,000 value)');
  });

  await SeedDataSource.destroy();
  console.log('\n[seed:recon] Done.');
}

main().catch((err: unknown) => {
  console.error('[seed:recon] FAILED:', err);
  process.exit(1);
});
