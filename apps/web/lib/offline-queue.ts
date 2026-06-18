import Dexie, { type Table } from 'dexie';

export interface PendingTransaction {
  id?: number;
  tenantId: string;
  customerId: string;
  customerName: string;
  amount: string;
  categoryId: string | null;
  idempotencyKey: string;
  createdAt: string;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  errorMessage?: string;
  retryCount: number;
}

export interface CachedCustomer {
  id: string;
  fullName: string;
  phoneE164: string;
  pointsBalance: number;
  tierId: string | null;
  tier: string | null;
  lastPurchaseAt: string | null;
  purchaseCount: number;
  progressPercent: number;
}

class CashierDB extends Dexie {
  pendingTransactions!: Table<PendingTransaction>;
  cachedCustomers!: Table<CachedCustomer, string>;

  constructor() {
    super('pingloyal_cashier');
    this.version(1).stores({
      pendingTransactions: '++id, status, createdAt, idempotencyKey',
    });
    this.version(2).stores({
      pendingTransactions: '++id, status, createdAt, idempotencyKey',
      cachedCustomers: 'id, phoneE164',
    });
  }
}

export const db = new CashierDB();

export async function addToQueue(
  tx: Omit<PendingTransaction, 'id'>,
): Promise<number> {
  return db.pendingTransactions.add(tx);
}

export async function getPendingCount(): Promise<number> {
  return db.pendingTransactions
    .where('status')
    .anyOf(['pending', 'syncing'])
    .count();
}

export async function getPending(): Promise<PendingTransaction[]> {
  return db.pendingTransactions
    .where('status')
    .anyOf(['pending', 'syncing'])
    .toArray();
}

export async function markSynced(id: number): Promise<void> {
  await db.pendingTransactions.update(id, { status: 'synced' });
}

export async function markFailed(id: number, error: string): Promise<void> {
  await db.pendingTransactions.update(id, {
    status: 'failed',
    errorMessage: error,
  });
}

export async function markSyncing(id: number): Promise<void> {
  await db.pendingTransactions.update(id, { status: 'syncing' });
}

export async function getAll(): Promise<PendingTransaction[]> {
  return db.pendingTransactions.toArray();
}

// ── Customer cache ─────────────────────────────────────────────────────────────

export async function upsertCustomerCache(
  customers: CachedCustomer[],
): Promise<void> {
  await db.cachedCustomers.bulkPut(customers);
}

export async function lookupCustomerByPhone(
  phoneE164: string,
): Promise<CachedCustomer | undefined> {
  return db.cachedCustomers.where('phoneE164').equals(phoneE164).first();
}

export async function getCachedCustomerCount(): Promise<number> {
  return db.cachedCustomers.count();
}
