import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { SubscriptionGuard } from '../../src/common/guards/subscription.guard';
import { REDIS_CLIENT } from '../../src/common/redis/redis.constants';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeContext(
  opts: {
    method?: string;
    path?: string;
    tenantId?: string;
    isPublic?: boolean;
    skipSubscription?: boolean;
  } = {},
): ExecutionContext {
  const {
    method = 'GET',
    path = '/api/v1/customers',
    tenantId = 'tenant-1',
    isPublic = false,
    skipSubscription = false,
  } = opts;

  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        path,
        user: tenantId ? { tenantId, userId: 'user-1', role: 'owner' } : null,
      }),
    }),
    __isPublic: isPublic,
    __skipSub: skipSubscription,
  } as unknown as ExecutionContext;
}

function makeSubRow(
  status: string,
  trialEndsAt: string | null = null,
): Record<string, unknown> {
  return {
    status,
    trial_ends_at: trialEndsAt,
    plan_tier: 'starter',
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('SubscriptionGuard', () => {
  let guard: SubscriptionGuard;
  let mockReflector: { getAllAndOverride: jest.Mock };
  let mockDataSource: { query: jest.Mock };
  let mockRedis: { get: jest.Mock; setex: jest.Mock; del: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockReflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    mockDataSource = {
      query: jest.fn().mockResolvedValue([makeSubRow('active')]),
    };
    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionGuard,
        { provide: Reflector, useValue: mockReflector },
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();

    guard = module.get(SubscriptionGuard);
  });

  // T1: active → allowed ────────────────────────────────────────────────────

  it('T1 — active subscription allows all requests', async () => {
    mockDataSource.query.mockResolvedValue([makeSubRow('active')]);
    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
  });

  // T2: trialing, not expired → allowed ─────────────────────────────────────

  it('T2 — trialing with future trial end date allows all requests', async () => {
    const future = new Date(Date.now() + 7 * 86_400_000).toISOString();
    mockDataSource.query.mockResolvedValue([makeSubRow('trialing', future)]);
    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
  });

  // T3: trialing, expired → 402 ─────────────────────────────────────────────

  it('T3 — trialing with expired trial throws 402 with action=subscribe', async () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    mockDataSource.query.mockResolvedValue([makeSubRow('trialing', past)]);

    await expect(guard.canActivate(makeContext())).rejects.toThrow(
      HttpException,
    );
    try {
      await guard.canActivate(makeContext());
    } catch (err) {
      expect(err instanceof HttpException).toBe(true);
      const body = (err as HttpException).getResponse() as Record<
        string,
        unknown
      >;
      expect(body.action).toBe('subscribe');
      expect(body.statusCode).toBe(402);
    }
  });

  // T4: past_due, GET → allowed ─────────────────────────────────────────────

  it('T4 — past_due subscription allows GET requests', async () => {
    mockDataSource.query.mockResolvedValue([makeSubRow('past_due')]);
    await expect(
      guard.canActivate(makeContext({ method: 'GET' })),
    ).resolves.toBe(true);
  });

  // T5: past_due, POST → 402 ────────────────────────────────────────────────

  it('T5 — past_due subscription blocks POST requests with action=update_payment', async () => {
    mockDataSource.query.mockResolvedValue([makeSubRow('past_due')]);

    try {
      await guard.canActivate(makeContext({ method: 'POST' }));
      fail('should have thrown');
    } catch (err) {
      expect(err instanceof HttpException).toBe(true);
      const body = (err as HttpException).getResponse() as Record<
        string,
        unknown
      >;
      expect(body.action).toBe('update_payment');
    }
  });

  // T6: past_due, POST /billing/subscribe → allowed ─────────────────────────

  it('T6 — past_due allows POST /billing/subscribe (payment exception)', async () => {
    mockDataSource.query.mockResolvedValue([makeSubRow('past_due')]);
    await expect(
      guard.canActivate(
        makeContext({ method: 'POST', path: '/api/v1/billing/subscribe' }),
      ),
    ).resolves.toBe(true);
  });

  // T7: suspended, GET → 402 ────────────────────────────────────────────────

  it('T7 — suspended account blocks GET requests with action=subscribe', async () => {
    mockDataSource.query.mockResolvedValue([makeSubRow('suspended')]);

    try {
      await guard.canActivate(makeContext({ method: 'GET' }));
      fail('should have thrown');
    } catch (err) {
      expect(err instanceof HttpException).toBe(true);
      const body = (err as HttpException).getResponse() as Record<
        string,
        unknown
      >;
      expect(body.action).toBe('subscribe');
      expect(body.error).toBe('Account Suspended');
    }
  });

  // T8: suspended, POST → 402 ───────────────────────────────────────────────

  it('T8 — suspended account blocks POST requests', async () => {
    mockDataSource.query.mockResolvedValue([makeSubRow('suspended')]);
    await expect(
      guard.canActivate(makeContext({ method: 'POST' })),
    ).rejects.toThrow(HttpException);
  });

  // T9: bypass route GET /health → skip entirely ────────────────────────────

  it('T9 — bypass route GET /health skips guard entirely', async () => {
    await expect(
      guard.canActivate(makeContext({ path: '/api/v1/health' })),
    ).resolves.toBe(true);
    expect(mockDataSource.query).not.toHaveBeenCalled();
  });

  // T10: bypass route POST /auth/login → skip ───────────────────────────────

  it('T10 — bypass route POST /auth/login skips guard entirely', async () => {
    await expect(
      guard.canActivate(
        makeContext({ method: 'POST', path: '/api/v1/auth/login' }),
      ),
    ).resolves.toBe(true);
    expect(mockDataSource.query).not.toHaveBeenCalled();
  });

  // T11: Redis cache hit → no DB call ───────────────────────────────────────

  it('T11 — Redis cache hit returns without querying DB', async () => {
    mockRedis.get.mockResolvedValue(
      JSON.stringify({
        status: 'active',
        trialEndsAt: null,
        planTier: 'starter',
      }),
    );

    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    expect(mockDataSource.query).not.toHaveBeenCalled();
  });

  // T12: Redis cache miss → loads from DB and caches ────────────────────────

  it('T12 — Redis cache miss loads from DB and stores result', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockDataSource.query.mockResolvedValue([makeSubRow('active')]);

    await guard.canActivate(makeContext());

    expect(mockDataSource.query).toHaveBeenCalledTimes(1);
    expect(mockRedis.setex).toHaveBeenCalledWith(
      'sub:status:tenant-1',
      60,
      expect.stringContaining('active'),
    );
  });

  // T13: No subscription in DB → allows (fail open) ─────────────────────────

  it('T13 — no subscription in DB allows access (fail open)', async () => {
    mockDataSource.query.mockResolvedValue([]);
    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
  });

  // T14: Cache invalidated (via Redis del) ──────────────────────────────────

  it('T14 — after status change, fresh DB query used when cache is cleared', async () => {
    // First call: active from cache
    mockRedis.get.mockResolvedValueOnce(
      JSON.stringify({
        status: 'active',
        trialEndsAt: null,
        planTier: 'starter',
      }),
    );
    await guard.canActivate(makeContext());
    expect(mockDataSource.query).not.toHaveBeenCalled();

    // After cache cleared: DB queried again
    mockRedis.get.mockResolvedValue(null);
    mockDataSource.query.mockResolvedValue([makeSubRow('active')]);
    await guard.canActivate(makeContext());
    expect(mockDataSource.query).toHaveBeenCalledTimes(1);
  });

  // T15: Unknown status → fails closed, not open ────────────────────────────

  it('T15 — unknown status blocks access by default and logs an error', async () => {
    mockDataSource.query.mockResolvedValue([makeSubRow('unknown_status')]);
    const errorSpy = jest
      .spyOn(guard['logger'], 'error')
      .mockImplementation(() => {});

    await expect(guard.canActivate(makeContext())).rejects.toThrow(
      HttpException,
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unknown subscription status'),
    );
    errorSpy.mockRestore();
  });

  it('T15b — unknown status still allows the exempt POST paths through', async () => {
    mockDataSource.query.mockResolvedValue([makeSubRow('unknown_status')]);
    await expect(
      guard.canActivate(
        makeContext({ method: 'POST', path: '/api/v1/billing/subscribe' }),
      ),
    ).resolves.toBe(true);
  });

  // T16: pending_payment → blocks everything except the exempt POSTs ────────

  it('T16 — pending_payment blocks GET requests with action=start_trial', async () => {
    mockDataSource.query.mockResolvedValue([makeSubRow('pending_payment')]);

    try {
      await guard.canActivate(makeContext({ method: 'GET' }));
      fail('should have thrown');
    } catch (err) {
      expect(err instanceof HttpException).toBe(true);
      const body = (err as HttpException).getResponse() as Record<
        string,
        unknown
      >;
      expect(body.action).toBe('start_trial');
      expect(body.statusCode).toBe(402);
    }
  });

  it('T17 — pending_payment allows POST /billing/start-trial', async () => {
    mockDataSource.query.mockResolvedValue([makeSubRow('pending_payment')]);
    await expect(
      guard.canActivate(
        makeContext({ method: 'POST', path: '/api/v1/billing/start-trial' }),
      ),
    ).resolves.toBe(true);
  });

  it('T18 — pending_payment allows POST /billing/cancel-trial', async () => {
    mockDataSource.query.mockResolvedValue([makeSubRow('pending_payment')]);
    await expect(
      guard.canActivate(
        makeContext({ method: 'POST', path: '/api/v1/billing/cancel-trial' }),
      ),
    ).resolves.toBe(true);
  });

  it('T19 — pending_payment blocks POST to an arbitrary other route', async () => {
    mockDataSource.query.mockResolvedValue([makeSubRow('pending_payment')]);
    await expect(
      guard.canActivate(
        makeContext({ method: 'POST', path: '/api/v1/customers' }),
      ),
    ).rejects.toThrow(HttpException);
  });

  // T20: cancelled → blocks everything except the exempt POSTs ──────────────

  it('T20 — cancelled blocks GET requests with action=subscribe', async () => {
    mockDataSource.query.mockResolvedValue([makeSubRow('cancelled')]);

    try {
      await guard.canActivate(makeContext({ method: 'GET' }));
      fail('should have thrown');
    } catch (err) {
      expect(err instanceof HttpException).toBe(true);
      const body = (err as HttpException).getResponse() as Record<
        string,
        unknown
      >;
      expect(body.action).toBe('subscribe');
    }
  });

  it('T21 — cancelled allows POST /billing/subscribe', async () => {
    mockDataSource.query.mockResolvedValue([makeSubRow('cancelled')]);
    await expect(
      guard.canActivate(
        makeContext({ method: 'POST', path: '/api/v1/billing/subscribe' }),
      ),
    ).resolves.toBe(true);
  });
});
