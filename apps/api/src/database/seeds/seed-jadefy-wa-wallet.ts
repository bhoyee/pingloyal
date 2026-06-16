/**
 * Additive demo-data patch for the "Jadefy Store" tenant.
 *
 * Inserts realistic:
 *   1. wallet_transactions  — campaign, lapsed, birthday debits across 3 months
 *                             → fills "Marketing Wallet & Spend Summary"
 *   2. trigger_logs         — all 10 trigger types across 3 months
 *                             → fills "WhatsApp Performance" + "Trigger Breakdown"
 *
 * SAFE  : never touches the tenant row, users, or passwords.
 * IDEMPOTENT: deletes previous seed records first
 *             (wallet_transactions identified by paystackRef LIKE 'seed-wallet-%')
 *             (trigger_logs          identified by waMessageId LIKE 'seed-tlog-%')
 *
 * Run with:
 *   npx ts-node -r tsconfig-paths/register src/database/seeds/seed-jadefy-wa-wallet.ts
 */
import 'reflect-metadata';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { TriggerType, TriggerStatus, WalletTransactionType } from '@pingloyal/types';
import { Tenant } from '../../modules/tenants/entities/tenant.entity';
import { TierConfig } from '../../modules/tenants/entities/tier-config.entity';
import { ProductCategory } from '../../modules/tenants/entities/product-category.entity';
import { User } from '../../modules/auth/entities/user.entity';
import { Customer } from '../../modules/customers/entities/customer.entity';
import { TriggerLog } from '../../modules/triggers/entities/trigger-log.entity';
import { WalletTransaction } from '../../modules/billing/entities/wallet-transaction.entity';

dotenv.config({ path: path.join(__dirname, '../../../.env') });
dotenv.config({ path: path.join(__dirname, '../../../../../.env') });

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');

const ds = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [Tenant, TierConfig, ProductCategory, User, Customer, TriggerLog, WalletTransaction],
  namingStrategy: new SnakeNamingStrategy(),
  synchronize: false,
  logging: false,
});

const TLOG_PREFIX  = 'seed-tlog-';
const WALLET_PREFIX = 'seed-wallet-';
const MARKETING_RATE = 130; // ₦ per message

// ── Date helpers ───────────────────────────────────────────────────────────────

function daysAgoAt(days: number, hour: number, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

// ── Trigger log batch spec ─────────────────────────────────────────────────────

interface TLogBatch {
  type: TriggerType;
  daysAgo: number;
  hour: number;
  /** indices into the opted-in customers array */
  recipientIndexes: number[];
  /** fraction of messages that reach DELIVERED (rest = FAILED) */
  deliveryRate: number;
}

// ── Wallet transaction spec ────────────────────────────────────────────────────

interface WalletSpec {
  type: WalletTransactionType;
  amount: number;          // negative = debit
  daysAgo: number;
  description: string;
}

async function main() {
  await ds.initialize();

  await ds.transaction(async (mgr) => {

    // ── Find tenant ──────────────────────────────────────────────────────────
    const tenant = await mgr.findOne(Tenant, { where: { slug: 'jadefy-store' } });
    if (!tenant) throw new Error('Tenant "jadefy-store" not found — run seed-jadefy.ts first.');
    console.log(`[seed:wa-wallet] Tenant: ${tenant.id}`);

    // ── Load opted-in customers (waOptedIn = true) ──────────────────────────
    const allCustomers = await mgr.find(Customer, {
      where: { tenantId: tenant.id },
      order: { totalSpend: 'DESC' },
    });
    const opted = allCustomers.filter((c) => c.waOptedIn);
    const all6 = allCustomers;
    console.log(`[seed:wa-wallet] Customers: ${allCustomers.length} total, ${opted.length} opted-in`);
    if (opted.length === 0) throw new Error('No opted-in customers found.');

    // Helper: pick customer by cycling index
    const c = (i: number, useAll = false) =>
      (useAll ? all6 : opted)[i % (useAll ? all6.length : opted.length)];

    // ── Purge previous seed data ─────────────────────────────────────────────
    const [wDel, tDel] = await Promise.all([
      mgr.query(
        `DELETE FROM wallet_transactions WHERE tenant_id = $1 AND paystack_ref LIKE $2`,
        [tenant.id, `${WALLET_PREFIX}%`],
      ) as Promise<unknown[]>,
      mgr.query(
        `DELETE FROM trigger_logs WHERE tenant_id = $1 AND wa_message_id LIKE $2`,
        [tenant.id, `${TLOG_PREFIX}%`],
      ) as Promise<unknown[]>,
    ]);
    console.log(`[seed:wa-wallet] Purged ${String((wDel as number[])[1] ?? 0)} wallet txns, ${String((tDel as number[])[1] ?? 0)} trigger logs`);

    // ════════════════════════════════════════════════════════════════════════
    //  1. TRIGGER LOGS — all 10 types, spread across last 75 days
    //     · Days 0-15  = this month        (June 1-16)
    //     · Days 16-46 = last month        (May 1-31)
    //     · Days 47-75 = 2-3 months ago   (April)
    // ════════════════════════════════════════════════════════════════════════

    const batches: TLogBatch[] = [

      // ── THIS MONTH (days 0-15) ────────────────────────────────────────────

      // campaign_message: 8 blasts × all 5 opted-in = 40 msgs (94% delivery)
      { type: TriggerType.CAMPAIGN_MESSAGE, daysAgo: 0,  hour: 10, recipientIndexes: [0,1,2,3,4], deliveryRate: 0.95 },
      { type: TriggerType.CAMPAIGN_MESSAGE, daysAgo: 2,  hour: 14, recipientIndexes: [0,1,2,3,4], deliveryRate: 0.95 },
      { type: TriggerType.CAMPAIGN_MESSAGE, daysAgo: 3,  hour: 9,  recipientIndexes: [0,1,2,3,4], deliveryRate: 1.00 },
      { type: TriggerType.CAMPAIGN_MESSAGE, daysAgo: 6,  hour: 11, recipientIndexes: [0,1,2,3,4], deliveryRate: 0.95 },
      { type: TriggerType.CAMPAIGN_MESSAGE, daysAgo: 8,  hour: 10, recipientIndexes: [0,1,2],     deliveryRate: 1.00 },
      { type: TriggerType.CAMPAIGN_MESSAGE, daysAgo: 10, hour: 14, recipientIndexes: [0,1,2,3,4], deliveryRate: 0.95 },
      { type: TriggerType.CAMPAIGN_MESSAGE, daysAgo: 13, hour: 9,  recipientIndexes: [0,1,2,3,4], deliveryRate: 1.00 },
      { type: TriggerType.CAMPAIGN_MESSAGE, daysAgo: 15, hour: 11, recipientIndexes: [0,1,2,3,4], deliveryRate: 0.95 },

      // lapsed_winback: 3 batches × 3 customers = 9
      { type: TriggerType.LAPSED_WINBACK, daysAgo: 1,  hour: 8,  recipientIndexes: [2,3,4], deliveryRate: 0.89 },
      { type: TriggerType.LAPSED_WINBACK, daysAgo: 7,  hour: 9,  recipientIndexes: [2,3,4], deliveryRate: 0.89 },
      { type: TriggerType.LAPSED_WINBACK, daysAgo: 14, hour: 8,  recipientIndexes: [2,3,4], deliveryRate: 0.89 },

      // birthday: 2 batches × 2 customers = 4
      { type: TriggerType.BIRTHDAY, daysAgo: 4,  hour: 8, recipientIndexes: [0,1], deliveryRate: 1.00 },
      { type: TriggerType.BIRTHDAY, daysAgo: 12, hour: 8, recipientIndexes: [2,3], deliveryRate: 1.00 },

      // purchase_confirmation: ~35 msgs spread across the period
      { type: TriggerType.PURCHASE_CONFIRMATION, daysAgo: 0,  hour: 11, recipientIndexes: [0,1,2],   deliveryRate: 0.97 },
      { type: TriggerType.PURCHASE_CONFIRMATION, daysAgo: 1,  hour: 14, recipientIndexes: [3,4],     deliveryRate: 0.97 },
      { type: TriggerType.PURCHASE_CONFIRMATION, daysAgo: 3,  hour: 10, recipientIndexes: [0,1,2,3], deliveryRate: 0.97 },
      { type: TriggerType.PURCHASE_CONFIRMATION, daysAgo: 5,  hour: 16, recipientIndexes: [0,2,4],   deliveryRate: 0.97 },
      { type: TriggerType.PURCHASE_CONFIRMATION, daysAgo: 7,  hour: 12, recipientIndexes: [1,3],     deliveryRate: 1.00 },
      { type: TriggerType.PURCHASE_CONFIRMATION, daysAgo: 9,  hour: 11, recipientIndexes: [0,1,2,3], deliveryRate: 0.97 },
      { type: TriggerType.PURCHASE_CONFIRMATION, daysAgo: 11, hour: 15, recipientIndexes: [0,2],     deliveryRate: 1.00 },
      { type: TriggerType.PURCHASE_CONFIRMATION, daysAgo: 13, hour: 10, recipientIndexes: [1,3,4],   deliveryRate: 0.97 },
      { type: TriggerType.PURCHASE_CONFIRMATION, daysAgo: 14, hour: 14, recipientIndexes: [0,1,2],   deliveryRate: 1.00 },
      { type: TriggerType.PURCHASE_CONFIRMATION, daysAgo: 15, hour: 11, recipientIndexes: [3,4],     deliveryRate: 0.97 },

      // welcome: 3 new customer sign-ups
      { type: TriggerType.WELCOME, daysAgo: 2,  hour: 10, recipientIndexes: [4], deliveryRate: 1.00 },
      { type: TriggerType.WELCOME, daysAgo: 8,  hour: 11, recipientIndexes: [3], deliveryRate: 1.00 },
      { type: TriggerType.WELCOME, daysAgo: 13, hour: 9,  recipientIndexes: [1], deliveryRate: 1.00 },

      // balance_bot_reply: customers checking balance
      { type: TriggerType.BALANCE_BOT_REPLY, daysAgo: 0,  hour: 12, recipientIndexes: [0,1],     deliveryRate: 1.00 },
      { type: TriggerType.BALANCE_BOT_REPLY, daysAgo: 2,  hour: 15, recipientIndexes: [2],       deliveryRate: 1.00 },
      { type: TriggerType.BALANCE_BOT_REPLY, daysAgo: 4,  hour: 10, recipientIndexes: [0,3],     deliveryRate: 1.00 },
      { type: TriggerType.BALANCE_BOT_REPLY, daysAgo: 6,  hour: 11, recipientIndexes: [1,4],     deliveryRate: 1.00 },
      { type: TriggerType.BALANCE_BOT_REPLY, daysAgo: 9,  hour: 14, recipientIndexes: [0,1,2],   deliveryRate: 1.00 },
      { type: TriggerType.BALANCE_BOT_REPLY, daysAgo: 11, hour: 12, recipientIndexes: [3,4],     deliveryRate: 1.00 },
      { type: TriggerType.BALANCE_BOT_REPLY, daysAgo: 14, hour: 10, recipientIndexes: [0,2,4],   deliveryRate: 1.00 },

      // threshold_nudge: customers nearing reward threshold
      { type: TriggerType.THRESHOLD_NUDGE, daysAgo: 3,  hour: 8, recipientIndexes: [0,2],   deliveryRate: 1.00 },
      { type: TriggerType.THRESHOLD_NUDGE, daysAgo: 9,  hour: 8, recipientIndexes: [1,3],   deliveryRate: 1.00 },
      { type: TriggerType.THRESHOLD_NUDGE, daysAgo: 14, hour: 8, recipientIndexes: [2,4],   deliveryRate: 1.00 },
      { type: TriggerType.THRESHOLD_NUDGE, daysAgo: 15, hour: 8, recipientIndexes: [0],     deliveryRate: 1.00 },

      // reward_unlocked: customers who hit threshold
      { type: TriggerType.REWARD_UNLOCKED, daysAgo: 5,  hour: 14, recipientIndexes: [0],  deliveryRate: 1.00 },
      { type: TriggerType.REWARD_UNLOCKED, daysAgo: 10, hour: 11, recipientIndexes: [1],  deliveryRate: 1.00 },
      { type: TriggerType.REWARD_UNLOCKED, daysAgo: 15, hour: 15, recipientIndexes: [2],  deliveryRate: 1.00 },

      // wallet_low_balance: system alert when wallet dips
      { type: TriggerType.WALLET_LOW_BALANCE, daysAgo: 5,  hour: 6, recipientIndexes: [0], deliveryRate: 1.00 },
      { type: TriggerType.WALLET_LOW_BALANCE, daysAgo: 12, hour: 6, recipientIndexes: [0], deliveryRate: 1.00 },

      // wallet_zero: wallet ran out once
      { type: TriggerType.WALLET_ZERO, daysAgo: 10, hour: 6, recipientIndexes: [0], deliveryRate: 1.00 },

      // ── LAST MONTH (days 17-46) ───────────────────────────────────────────

      // campaign_message: 10 blasts
      { type: TriggerType.CAMPAIGN_MESSAGE, daysAgo: 17, hour: 10, recipientIndexes: [0,1,2,3,4], deliveryRate: 0.95 },
      { type: TriggerType.CAMPAIGN_MESSAGE, daysAgo: 20, hour: 14, recipientIndexes: [0,1,2,3,4], deliveryRate: 1.00 },
      { type: TriggerType.CAMPAIGN_MESSAGE, daysAgo: 23, hour: 9,  recipientIndexes: [0,1,2],     deliveryRate: 0.90 },
      { type: TriggerType.CAMPAIGN_MESSAGE, daysAgo: 26, hour: 11, recipientIndexes: [0,1,2,3,4], deliveryRate: 0.95 },
      { type: TriggerType.CAMPAIGN_MESSAGE, daysAgo: 29, hour: 10, recipientIndexes: [0,1,2,3,4], deliveryRate: 1.00 },
      { type: TriggerType.CAMPAIGN_MESSAGE, daysAgo: 32, hour: 14, recipientIndexes: [0,1,2,3,4], deliveryRate: 0.95 },
      { type: TriggerType.CAMPAIGN_MESSAGE, daysAgo: 35, hour: 9,  recipientIndexes: [0,1,2,3,4], deliveryRate: 1.00 },
      { type: TriggerType.CAMPAIGN_MESSAGE, daysAgo: 38, hour: 11, recipientIndexes: [0,1,2,3,4], deliveryRate: 0.95 },
      { type: TriggerType.CAMPAIGN_MESSAGE, daysAgo: 41, hour: 10, recipientIndexes: [0,1,2],     deliveryRate: 1.00 },
      { type: TriggerType.CAMPAIGN_MESSAGE, daysAgo: 44, hour: 14, recipientIndexes: [0,1,2,3,4], deliveryRate: 0.95 },

      // lapsed_winback
      { type: TriggerType.LAPSED_WINBACK, daysAgo: 19, hour: 9,  recipientIndexes: [2,3,4], deliveryRate: 0.89 },
      { type: TriggerType.LAPSED_WINBACK, daysAgo: 27, hour: 8,  recipientIndexes: [2,3],   deliveryRate: 0.89 },
      { type: TriggerType.LAPSED_WINBACK, daysAgo: 35, hour: 9,  recipientIndexes: [3,4],   deliveryRate: 0.89 },
      { type: TriggerType.LAPSED_WINBACK, daysAgo: 43, hour: 8,  recipientIndexes: [2,3,4], deliveryRate: 0.89 },

      // birthday
      { type: TriggerType.BIRTHDAY, daysAgo: 21, hour: 8, recipientIndexes: [4],   deliveryRate: 1.00 },
      { type: TriggerType.BIRTHDAY, daysAgo: 30, hour: 8, recipientIndexes: [0,1], deliveryRate: 1.00 },
      { type: TriggerType.BIRTHDAY, daysAgo: 39, hour: 8, recipientIndexes: [2],   deliveryRate: 1.00 },

      // purchase_confirmation
      { type: TriggerType.PURCHASE_CONFIRMATION, daysAgo: 17, hour: 11, recipientIndexes: [0,1,2],   deliveryRate: 0.97 },
      { type: TriggerType.PURCHASE_CONFIRMATION, daysAgo: 19, hour: 14, recipientIndexes: [3,4],     deliveryRate: 0.97 },
      { type: TriggerType.PURCHASE_CONFIRMATION, daysAgo: 22, hour: 10, recipientIndexes: [0,1,2,3], deliveryRate: 1.00 },
      { type: TriggerType.PURCHASE_CONFIRMATION, daysAgo: 25, hour: 15, recipientIndexes: [0,2,4],   deliveryRate: 0.97 },
      { type: TriggerType.PURCHASE_CONFIRMATION, daysAgo: 28, hour: 12, recipientIndexes: [1,3],     deliveryRate: 1.00 },
      { type: TriggerType.PURCHASE_CONFIRMATION, daysAgo: 31, hour: 11, recipientIndexes: [0,1,2,3], deliveryRate: 0.97 },
      { type: TriggerType.PURCHASE_CONFIRMATION, daysAgo: 34, hour: 10, recipientIndexes: [2,3,4],   deliveryRate: 0.97 },
      { type: TriggerType.PURCHASE_CONFIRMATION, daysAgo: 37, hour: 14, recipientIndexes: [0,1],     deliveryRate: 1.00 },
      { type: TriggerType.PURCHASE_CONFIRMATION, daysAgo: 40, hour: 15, recipientIndexes: [0,1,2,3], deliveryRate: 0.97 },
      { type: TriggerType.PURCHASE_CONFIRMATION, daysAgo: 44, hour: 11, recipientIndexes: [3,4],     deliveryRate: 0.97 },

      // welcome
      { type: TriggerType.WELCOME, daysAgo: 20, hour: 10, recipientIndexes: [0], deliveryRate: 1.00 },
      { type: TriggerType.WELCOME, daysAgo: 30, hour: 11, recipientIndexes: [2], deliveryRate: 1.00 },
      { type: TriggerType.WELCOME, daysAgo: 40, hour: 9,  recipientIndexes: [4], deliveryRate: 1.00 },

      // balance_bot_reply
      { type: TriggerType.BALANCE_BOT_REPLY, daysAgo: 18, hour: 13, recipientIndexes: [0,1],   deliveryRate: 1.00 },
      { type: TriggerType.BALANCE_BOT_REPLY, daysAgo: 22, hour: 12, recipientIndexes: [2,3],   deliveryRate: 1.00 },
      { type: TriggerType.BALANCE_BOT_REPLY, daysAgo: 26, hour: 11, recipientIndexes: [0,4],   deliveryRate: 1.00 },
      { type: TriggerType.BALANCE_BOT_REPLY, daysAgo: 30, hour: 14, recipientIndexes: [1,2,3], deliveryRate: 1.00 },
      { type: TriggerType.BALANCE_BOT_REPLY, daysAgo: 35, hour: 10, recipientIndexes: [0],     deliveryRate: 1.00 },
      { type: TriggerType.BALANCE_BOT_REPLY, daysAgo: 40, hour: 15, recipientIndexes: [1,4],   deliveryRate: 1.00 },
      { type: TriggerType.BALANCE_BOT_REPLY, daysAgo: 44, hour: 12, recipientIndexes: [2],     deliveryRate: 1.00 },

      // threshold_nudge
      { type: TriggerType.THRESHOLD_NUDGE, daysAgo: 20, hour: 8, recipientIndexes: [1,3],   deliveryRate: 1.00 },
      { type: TriggerType.THRESHOLD_NUDGE, daysAgo: 29, hour: 8, recipientIndexes: [0,2],   deliveryRate: 1.00 },
      { type: TriggerType.THRESHOLD_NUDGE, daysAgo: 38, hour: 8, recipientIndexes: [3,4],   deliveryRate: 1.00 },

      // reward_unlocked
      { type: TriggerType.REWARD_UNLOCKED, daysAgo: 22, hour: 14, recipientIndexes: [3],  deliveryRate: 1.00 },
      { type: TriggerType.REWARD_UNLOCKED, daysAgo: 33, hour: 11, recipientIndexes: [4],  deliveryRate: 1.00 },
      { type: TriggerType.REWARD_UNLOCKED, daysAgo: 42, hour: 15, recipientIndexes: [0],  deliveryRate: 1.00 },

      // wallet_low_balance
      { type: TriggerType.WALLET_LOW_BALANCE, daysAgo: 22, hour: 6, recipientIndexes: [0], deliveryRate: 1.00 },
      { type: TriggerType.WALLET_LOW_BALANCE, daysAgo: 38, hour: 6, recipientIndexes: [0], deliveryRate: 1.00 },

      // wallet_zero
      { type: TriggerType.WALLET_ZERO, daysAgo: 30, hour: 6, recipientIndexes: [0], deliveryRate: 1.00 },

      // ── 2-3 MONTHS AGO (days 47-75) ──────────────────────────────────────

      // campaign_message: 5 blasts
      { type: TriggerType.CAMPAIGN_MESSAGE, daysAgo: 48, hour: 10, recipientIndexes: [0,1,2,3,4], deliveryRate: 0.95 },
      { type: TriggerType.CAMPAIGN_MESSAGE, daysAgo: 54, hour: 14, recipientIndexes: [0,1,2,3,4], deliveryRate: 1.00 },
      { type: TriggerType.CAMPAIGN_MESSAGE, daysAgo: 60, hour: 9,  recipientIndexes: [0,1,2],     deliveryRate: 0.90 },
      { type: TriggerType.CAMPAIGN_MESSAGE, daysAgo: 66, hour: 11, recipientIndexes: [0,1,2,3,4], deliveryRate: 0.95 },
      { type: TriggerType.CAMPAIGN_MESSAGE, daysAgo: 72, hour: 10, recipientIndexes: [0,1,2,3,4], deliveryRate: 1.00 },

      // lapsed_winback
      { type: TriggerType.LAPSED_WINBACK, daysAgo: 50, hour: 9,  recipientIndexes: [2,3],   deliveryRate: 0.89 },
      { type: TriggerType.LAPSED_WINBACK, daysAgo: 61, hour: 8,  recipientIndexes: [3,4],   deliveryRate: 0.89 },
      { type: TriggerType.LAPSED_WINBACK, daysAgo: 70, hour: 9,  recipientIndexes: [2,4],   deliveryRate: 0.89 },

      // birthday
      { type: TriggerType.BIRTHDAY, daysAgo: 52, hour: 8, recipientIndexes: [1],   deliveryRate: 1.00 },
      { type: TriggerType.BIRTHDAY, daysAgo: 63, hour: 8, recipientIndexes: [3,4], deliveryRate: 1.00 },

      // purchase_confirmation
      { type: TriggerType.PURCHASE_CONFIRMATION, daysAgo: 49, hour: 11, recipientIndexes: [0,1,2],   deliveryRate: 0.97 },
      { type: TriggerType.PURCHASE_CONFIRMATION, daysAgo: 55, hour: 14, recipientIndexes: [3,4],     deliveryRate: 0.97 },
      { type: TriggerType.PURCHASE_CONFIRMATION, daysAgo: 61, hour: 10, recipientIndexes: [0,1,2,3], deliveryRate: 1.00 },
      { type: TriggerType.PURCHASE_CONFIRMATION, daysAgo: 67, hour: 15, recipientIndexes: [0,2],     deliveryRate: 0.97 },
      { type: TriggerType.PURCHASE_CONFIRMATION, daysAgo: 73, hour: 12, recipientIndexes: [1,3,4],   deliveryRate: 1.00 },

      // welcome
      { type: TriggerType.WELCOME, daysAgo: 52, hour: 10, recipientIndexes: [1], deliveryRate: 1.00 },
      { type: TriggerType.WELCOME, daysAgo: 68, hour: 11, recipientIndexes: [3], deliveryRate: 1.00 },

      // balance_bot_reply
      { type: TriggerType.BALANCE_BOT_REPLY, daysAgo: 50, hour: 13, recipientIndexes: [0,2], deliveryRate: 1.00 },
      { type: TriggerType.BALANCE_BOT_REPLY, daysAgo: 58, hour: 12, recipientIndexes: [1,4], deliveryRate: 1.00 },
      { type: TriggerType.BALANCE_BOT_REPLY, daysAgo: 66, hour: 11, recipientIndexes: [3],   deliveryRate: 1.00 },
      { type: TriggerType.BALANCE_BOT_REPLY, daysAgo: 73, hour: 14, recipientIndexes: [0,1], deliveryRate: 1.00 },

      // threshold_nudge
      { type: TriggerType.THRESHOLD_NUDGE, daysAgo: 53, hour: 8, recipientIndexes: [0,2], deliveryRate: 1.00 },
      { type: TriggerType.THRESHOLD_NUDGE, daysAgo: 67, hour: 8, recipientIndexes: [1,4], deliveryRate: 1.00 },

      // reward_unlocked
      { type: TriggerType.REWARD_UNLOCKED, daysAgo: 55, hour: 14, recipientIndexes: [2], deliveryRate: 1.00 },
      { type: TriggerType.REWARD_UNLOCKED, daysAgo: 70, hour: 11, recipientIndexes: [0], deliveryRate: 1.00 },

      // wallet_low_balance
      { type: TriggerType.WALLET_LOW_BALANCE, daysAgo: 59, hour: 6, recipientIndexes: [0], deliveryRate: 1.00 },

    ];

    // ── Expand batches into individual log records and insert ────────────────
    let tlogSeq = 0;
    let tlogInserted = 0;

    for (const batch of batches) {
      for (const idx of batch.recipientIndexes) {
        const customer = c(idx);
        tlogSeq++;
        const msgId = `${TLOG_PREFIX}${tlogSeq.toString().padStart(4, '0')}`;
        // Deterministic status: floor(index / batchSize) alternates delivered/failed
        const isDelivered = (tlogSeq % 100) < Math.round(batch.deliveryRate * 100);
        const status = isDelivered ? TriggerStatus.DELIVERED : TriggerStatus.SENT;
        const createdAt = daysAgoAt(batch.daysAgo, batch.hour, (tlogSeq * 3) % 59);

        await mgr.query(
          `INSERT INTO trigger_logs
             (id, tenant_id, customer_id, trigger_type, wa_message_id, status, skip_reason, created_at)
           VALUES
             (gen_random_uuid(), $1, $2, $3, $4, $5, NULL, $6)`,
          [tenant.id, customer.id, batch.type, msgId, status, createdAt.toISOString()],
        );
        tlogInserted++;
      }
    }
    console.log(`[seed:wa-wallet] Inserted ${tlogInserted} trigger logs`);

    // ── Print summary by trigger type ────────────────────────────────────────
    const byType: Record<string, number> = {};
    for (const batch of batches) {
      const t = batch.type;
      byType[t] = (byType[t] ?? 0) + batch.recipientIndexes.length;
    }
    console.log('[seed:wa-wallet] Trigger type breakdown:');
    for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${type}: ${count}`);
    }

    // ════════════════════════════════════════════════════════════════════════
    //  2. WALLET TRANSACTIONS — debits spread across last 75 days
    //     Marketing rate: ₦130/message
    // ════════════════════════════════════════════════════════════════════════

    // Compute approximate message counts from batches
    const campaignCount = batches
      .filter((b) => b.type === TriggerType.CAMPAIGN_MESSAGE)
      .reduce((s, b) => s + b.recipientIndexes.length, 0);
    const lapsedCount = batches
      .filter((b) => b.type === TriggerType.LAPSED_WINBACK)
      .reduce((s, b) => s + b.recipientIndexes.length, 0);
    const birthdayCount = batches
      .filter((b) => b.type === TriggerType.BIRTHDAY)
      .reduce((s, b) => s + b.recipientIndexes.length, 0);

    console.log(`[seed:wa-wallet] Campaign msgs: ${campaignCount}, Lapsed: ${lapsedCount}, Birthday: ${birthdayCount}`);

    // Build wallet transaction list — one debit per campaign batch event
    const walletSpecs: WalletSpec[] = [];

    // Split campaign debits into per-blast entries (one per unique campaign batch day)
    const campaignBatchDays = [...new Set(
      batches.filter((b) => b.type === TriggerType.CAMPAIGN_MESSAGE).map((b) => b.daysAgo)
    )];
    for (const d of campaignBatchDays) {
      const batchMsgs = batches
        .filter((b) => b.type === TriggerType.CAMPAIGN_MESSAGE && b.daysAgo === d)
        .reduce((s, b) => s + b.recipientIndexes.length, 0);
      walletSpecs.push({
        type: WalletTransactionType.DEBIT_CAMPAIGN,
        amount: -(batchMsgs * MARKETING_RATE),
        daysAgo: d,
        description: `Campaign broadcast: ${batchMsgs} messages`,
      });
    }

    // Lapsed win-back debits — one per batch day
    const lapsedBatchDays = [...new Set(
      batches.filter((b) => b.type === TriggerType.LAPSED_WINBACK).map((b) => b.daysAgo)
    )];
    for (const d of lapsedBatchDays) {
      const batchMsgs = batches
        .filter((b) => b.type === TriggerType.LAPSED_WINBACK && b.daysAgo === d)
        .reduce((s, b) => s + b.recipientIndexes.length, 0);
      walletSpecs.push({
        type: WalletTransactionType.DEBIT_LAPSED,
        amount: -(batchMsgs * MARKETING_RATE),
        daysAgo: d,
        description: `Lapsed win-back: ${batchMsgs} messages`,
      });
    }

    // Birthday debits — one per batch day
    const birthdayBatchDays = [...new Set(
      batches.filter((b) => b.type === TriggerType.BIRTHDAY).map((b) => b.daysAgo)
    )];
    for (const d of birthdayBatchDays) {
      const batchMsgs = batches
        .filter((b) => b.type === TriggerType.BIRTHDAY && b.daysAgo === d)
        .reduce((s, b) => s + b.recipientIndexes.length, 0);
      walletSpecs.push({
        type: WalletTransactionType.DEBIT_BIRTHDAY,
        amount: -(batchMsgs * MARKETING_RATE),
        daysAgo: d,
        description: `Birthday messages: ${batchMsgs} messages`,
      });
    }

    // Sort chronologically (oldest first)
    walletSpecs.sort((a, b) => b.daysAgo - a.daysAgo);

    // Compute running balance (start high, end around current balance)
    const totalDebits = walletSpecs.reduce((s, w) => s + Math.abs(w.amount), 0);
    let runningBalance = Math.round(tenant.marketingWalletBalance ?? 25000) + totalDebits;

    let walletSeq = 0;
    let walletInserted = 0;

    for (const spec of walletSpecs) {
      walletSeq++;
      const ref = `${WALLET_PREFIX}${walletSeq.toString().padStart(3, '0')}`;
      runningBalance += spec.amount; // spec.amount is negative, so balance decreases
      const createdAt = daysAgoAt(spec.daysAgo, 7, 0); // wallet debits happen at 7am (auto-charged)

      await mgr.query(
        `INSERT INTO wallet_transactions
           (id, tenant_id, type, amount, balance_after, description, ref_id, paystack_ref, created_at)
         VALUES
           (gen_random_uuid(), $1, $2, $3, $4, $5, NULL, $6, $7)`,
        [
          tenant.id,
          spec.type,
          spec.amount,
          Math.round(runningBalance),
          spec.description,
          ref,
          createdAt.toISOString(),
        ],
      );
      walletInserted++;
    }

    console.log(`[seed:wa-wallet] Inserted ${walletInserted} wallet transactions`);
    console.log(`[seed:wa-wallet] Wallet spend totals:`);

    const byWalletType: Record<string, number> = {};
    for (const s of walletSpecs) {
      byWalletType[s.type] = (byWalletType[s.type] ?? 0) + Math.abs(s.amount);
    }
    for (const [type, total] of Object.entries(byWalletType)) {
      console.log(`  ${type}: ₦${total.toLocaleString()}`);
    }
    const grandTotal = Object.values(byWalletType).reduce((a, b) => a + b, 0);
    console.log(`  TOTAL: ₦${grandTotal.toLocaleString()}`);
  });

  await ds.destroy();
  console.log('[seed:wa-wallet] Done.');
}

main().catch((e: unknown) => { console.error(String(e)); process.exit(1); });
