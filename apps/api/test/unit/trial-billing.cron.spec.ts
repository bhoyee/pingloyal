import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { TrialBillingCronService } from '../../src/modules/billing/trial-billing.cron';
import { BillingService } from '../../src/modules/billing/billing.service';

const TENANT_ID = 'tenant-1';

function makeDueRow(overrides: Record<string, unknown> = {}) {
  return {
    tenant_id: TENANT_ID,
    subscription_id: 'sub-1',
    plan_tier: 'starter',
    currency: 'NGN',
    amount: '8000',
    paystack_authorization_code: 'AUTH_abc',
    owner_email: 'owner@store.ng',
    ...overrides,
  };
}

describe('TrialBillingCronService', () => {
  let service: TrialBillingCronService;
  let mockQuery: jest.Mock;
  let mockBillingService: {
    attemptPaystackCharge: jest.Mock;
    cancelTenant: jest.Mock;
    suspendTenant: jest.Mock;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockQuery = jest.fn();
    mockBillingService = {
      attemptPaystackCharge: jest.fn().mockResolvedValue(undefined),
      cancelTenant: jest.fn().mockResolvedValue(undefined),
      suspendTenant: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrialBillingCronService,
        { provide: getDataSourceToken(), useValue: { query: mockQuery } },
        { provide: BillingService, useValue: mockBillingService },
      ],
    }).compile();

    service = module.get(TrialBillingCronService);
  });

  // ── chargeExpiredPaystackTrials ───────────────────────────────────────────

  describe('chargeExpiredPaystackTrials', () => {
    it('T1 — no tenants due: nothing is charged, cancelled, or suspended', async () => {
      mockQuery
        .mockResolvedValueOnce([]) // due charges
        .mockResolvedValueOnce([]) // cancelled+expired
        .mockResolvedValueOnce([]); // no auth code

      await service.chargeExpiredPaystackTrials();

      expect(mockBillingService.attemptPaystackCharge).not.toHaveBeenCalled();
      expect(mockBillingService.cancelTenant).not.toHaveBeenCalled();
      expect(mockBillingService.suspendTenant).not.toHaveBeenCalled();
    });

    it('T2 — one tenant due with an authorization code: charge is attempted with the correct params', async () => {
      mockQuery
        .mockResolvedValueOnce([makeDueRow()])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await service.chargeExpiredPaystackTrials();

      expect(mockBillingService.attemptPaystackCharge).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        subscriptionId: 'sub-1',
        planId: 'starter_ngn',
        authorizationCode: 'AUTH_abc',
        amount: 8000,
        ownerEmail: 'owner@store.ng',
      });
    });

    it('T3 — trial cancelled before conversion: cancelTenant is called, no charge attempted', async () => {
      mockQuery
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ tenant_id: TENANT_ID }])
        .mockResolvedValueOnce([]);

      await service.chargeExpiredPaystackTrials();

      expect(mockBillingService.cancelTenant).toHaveBeenCalledWith(TENANT_ID);
      expect(mockBillingService.attemptPaystackCharge).not.toHaveBeenCalled();
    });

    it('T4 — trial expired with no authorization code on file: defensively suspended', async () => {
      mockQuery
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ tenant_id: TENANT_ID }]);

      await service.chargeExpiredPaystackTrials();

      expect(mockBillingService.suspendTenant).toHaveBeenCalledWith(TENANT_ID);
    });

    it('T5 — one charge attempt throws: the other due tenant is still processed', async () => {
      mockQuery
        .mockResolvedValueOnce([
          makeDueRow({ tenant_id: 'tenant-fail' }),
          makeDueRow({ tenant_id: 'tenant-ok' }),
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      mockBillingService.attemptPaystackCharge
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValueOnce(undefined);

      await expect(
        service.chargeExpiredPaystackTrials(),
      ).resolves.not.toThrow();
      expect(mockBillingService.attemptPaystackCharge).toHaveBeenCalledTimes(2);
    });
  });

  // ── retryFailedPaystackCharges ────────────────────────────────────────────

  describe('retryFailedPaystackCharges', () => {
    it('T6 — attempts exhausted: suspended without another charge attempt', async () => {
      mockQuery
        .mockResolvedValueOnce([
          makeDueRow({
            trial_charge_attempts: 3,
            grace_period_started_at: new Date().toISOString(),
          }),
        ])
        .mockResolvedValueOnce([]);

      await service.retryFailedPaystackCharges();

      expect(mockBillingService.suspendTenant).toHaveBeenCalledWith(TENANT_ID);
      expect(mockBillingService.attemptPaystackCharge).not.toHaveBeenCalled();
    });

    it('T7 — grace window exceeded even under the attempt limit: suspended', async () => {
      const eightDaysAgo = new Date(
        Date.now() - 8 * 24 * 60 * 60 * 1000,
      ).toISOString();
      mockQuery
        .mockResolvedValueOnce([
          makeDueRow({
            trial_charge_attempts: 1,
            grace_period_started_at: eightDaysAgo,
          }),
        ])
        .mockResolvedValueOnce([]);

      await service.retryFailedPaystackCharges();

      expect(mockBillingService.suspendTenant).toHaveBeenCalledWith(TENANT_ID);
      expect(mockBillingService.attemptPaystackCharge).not.toHaveBeenCalled();
    });

    it('T8 — within attempts and grace window: retried, not suspended', async () => {
      mockQuery
        .mockResolvedValueOnce([
          makeDueRow({
            trial_charge_attempts: 1,
            grace_period_started_at: new Date().toISOString(),
          }),
        ])
        .mockResolvedValueOnce([]);

      await service.retryFailedPaystackCharges();

      expect(mockBillingService.attemptPaystackCharge).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        subscriptionId: 'sub-1',
        planId: 'starter_ngn',
        authorizationCode: 'AUTH_abc',
        amount: 8000,
        ownerEmail: 'owner@store.ng',
      });
      expect(mockBillingService.suspendTenant).not.toHaveBeenCalled();
    });

    it('T9 — Stripe tenant stuck past_due beyond the grace window: suspended as a safety net', async () => {
      mockQuery
        .mockResolvedValueOnce([]) // no NGN past_due rows
        .mockResolvedValueOnce([{ tenant_id: 'tenant-gbp' }]);

      await service.retryFailedPaystackCharges();

      expect(mockBillingService.suspendTenant).toHaveBeenCalledWith(
        'tenant-gbp',
      );
    });
  });
});
