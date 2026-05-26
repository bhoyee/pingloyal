import { OfflineSyncService } from '../lib/offline-sync';
import { ApiError } from '../lib/api';
import type { PendingTransaction } from '../lib/offline-queue';

// ── Mock offline-queue ────────────────────────────────────────────────────────

jest.mock('../lib/offline-queue', () => ({
  getPending: jest.fn(),
  markSynced: jest.fn().mockResolvedValue(undefined),
  markFailed: jest.fn().mockResolvedValue(undefined),
  markSyncing: jest.fn().mockResolvedValue(undefined),
  getPendingCount: jest.fn(),
}));

import {
  getPending,
  markSynced,
  markFailed,
  markSyncing,
  getPendingCount,
} from '../lib/offline-queue';

const mockGetPending = getPending as jest.Mock;
const mockMarkSynced = markSynced as jest.Mock;
const mockMarkFailed = markFailed as jest.Mock;
const mockMarkSyncing = markSyncing as jest.Mock;
const mockGetPendingCount = getPendingCount as jest.Mock;

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeTx(
  overrides: Partial<PendingTransaction> & { id: number },
): PendingTransaction {
  return {
    tenantId: 'tenant-1',
    customerId: 'cust-1',
    customerName: 'Ada',
    amount: '1000',
    categoryId: null,
    idempotencyKey: `key-${overrides.id}`,
    createdAt: new Date().toISOString(),
    status: 'pending',
    retryCount: 0,
    ...overrides,
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

let service: OfflineSyncService;
let mockApiPost: jest.Mock;

beforeEach(() => {
  service = new OfflineSyncService();
  mockApiPost = jest.fn().mockResolvedValue({ id: 'server-tx' });
  jest.resetAllMocks();
  mockMarkSynced.mockResolvedValue(undefined);
  mockMarkFailed.mockResolvedValue(undefined);
  mockMarkSyncing.mockResolvedValue(undefined);
});

// ── T94 — FIFO order ──────────────────────────────────────────────────────────

it('T94 — processes pending transactions FIFO (oldest createdAt first)', async () => {
  const newer = makeTx({ id: 1, createdAt: '2026-05-02T10:00:00Z' });
  const older = makeTx({ id: 2, createdAt: '2026-05-01T10:00:00Z' });
  mockGetPending.mockResolvedValue([newer, older]); // arrives newest-first

  mockApiPost.mockResolvedValue({ id: 'ok' });

  await service.sync({ post: mockApiPost });

  // older (id=2) must be processed first
  expect(mockMarkSyncing).toHaveBeenNthCalledWith(1, 2);
  expect(mockMarkSyncing).toHaveBeenNthCalledWith(2, 1);
});

// ── T95 — successful sync marks as synced ─────────────────────────────────────

it('T95 — successful API call marks transaction as synced', async () => {
  const tx = makeTx({ id: 5 });
  mockGetPending.mockResolvedValue([tx]);
  mockApiPost.mockResolvedValue({ id: 'server-tx' });

  const result = await service.sync({ post: mockApiPost });

  expect(mockMarkSynced).toHaveBeenCalledWith(5);
  expect(mockMarkFailed).not.toHaveBeenCalled();
  expect(result).toEqual({ synced: 1, failed: 0 });
});

// ── T96 — 5xx marks as failed ─────────────────────────────────────────────────

it('T96 — 5xx response marks transaction as failed', async () => {
  const tx = makeTx({ id: 7 });
  mockGetPending.mockResolvedValue([tx]);
  mockApiPost.mockRejectedValue(new ApiError('Server error', 500));

  const result = await service.sync({ post: mockApiPost });

  expect(mockMarkFailed).toHaveBeenCalledWith(7, 'Server error');
  expect(mockMarkSynced).not.toHaveBeenCalled();
  expect(result).toEqual({ synced: 0, failed: 1 });
});

// ── T97 — 409 treated as success (idempotency) ───────────────────────────────

it('T97 — 409 response is treated as success and marked synced', async () => {
  const tx = makeTx({ id: 9 });
  mockGetPending.mockResolvedValue([tx]);
  mockApiPost.mockRejectedValue(new ApiError('Already processed', 409));

  const result = await service.sync({ post: mockApiPost });

  expect(mockMarkSynced).toHaveBeenCalledWith(9);
  expect(mockMarkFailed).not.toHaveBeenCalled();
  expect(result).toEqual({ synced: 1, failed: 0 });
});

// ── T98 — concurrent sync prevention ─────────────────────────────────────────

it('T98 — second sync call returns immediately if already syncing', async () => {
  mockGetPending.mockResolvedValue([makeTx({ id: 3 })]);

  // First call — don't await yet
  const first = service.sync({ post: mockApiPost });
  // Second call — should return { synced:0, failed:0 } immediately
  const second = await service.sync({ post: mockApiPost });

  expect(second).toEqual({ synced: 0, failed: 0 });
  await first; // let first finish
});

// ── T99 — empty queue returns zero counts ────────────────────────────────────

it('T99 — returns {synced:0, failed:0} when there are no pending transactions', async () => {
  mockGetPending.mockResolvedValue([]);

  const result = await service.sync({ post: mockApiPost });

  expect(result).toEqual({ synced: 0, failed: 0 });
  expect(mockApiPost).not.toHaveBeenCalled();
});
