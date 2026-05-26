import { ApiError } from './api';
import { getPending, markSynced, markFailed, markSyncing } from './offline-queue';

export interface ApiClient {
  post: <T>(path: string, body: unknown) => Promise<T>;
}

export interface SyncResult {
  synced: number;
  failed: number;
}

export class OfflineSyncService {
  private syncing = false;

  async sync(apiClient: ApiClient): Promise<SyncResult> {
    if (this.syncing) return { synced: 0, failed: 0 };
    this.syncing = true;

    try {
      const pending = await getPending();
      if (pending.length === 0) {
        return { synced: 0, failed: 0 };
      }

      let synced = 0;
      let failed = 0;

      // Process FIFO — oldest first
      const sorted = [...pending].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );

      for (const tx of sorted) {
        try {
          await markSyncing(tx.id!);

          await apiClient.post('/transactions', {
            customerId: tx.customerId,
            amount: tx.amount,
            categoryId: tx.categoryId,
            idempotencyKey: tx.idempotencyKey,
          });

          await markSynced(tx.id!);
          synced++;
        } catch (error) {
          if (error instanceof ApiError && error.status === 409) {
            // Already processed — idempotency handled on server
            await markSynced(tx.id!);
            synced++;
          } else {
            const msg =
              error instanceof ApiError ? error.message : String(error);
            await markFailed(tx.id!, msg);
            failed++;
          }
        }
      }

      return { synced, failed };
    } finally {
      this.syncing = false;
    }
  }
}

export const offlineSyncService = new OfflineSyncService();
