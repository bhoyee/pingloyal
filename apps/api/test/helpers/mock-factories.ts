import { TriggerType, WaVerificationStatus } from '@pingloyal/types';
import type { CampaignStatus } from '@pingloyal/types';

export const mockTenant = (overrides: Record<string, unknown> = {}) => ({
  id: 'tenant-uuid',
  businessName: 'FreshMart',
  slug: 'freshmart',
  pointsThreshold: 1000,
  pointsEarnRate: 100,
  rewardValue: 1000,
  lapsedDays: 60,
  currency: 'NGN',
  timezone: 'Africa/Lagos',
  waVerificationStatus: WaVerificationStatus.VERIFIED,
  marketingWalletBalance: 50_000,
  gupshupAppId: 'test-app-id',
  gupshupApiKey: 'encrypted:test:key',
  waPhoneNumber: '+2348000000000',
  ...overrides,
});

export const mockCustomer = (overrides: Record<string, unknown> = {}) => ({
  id: 'customer-uuid',
  tenantId: 'tenant-uuid',
  fullName: 'Adaeze Obi',
  phoneE164: '+2348012345678',
  pointsBalance: 500,
  waOptedIn: true,
  nudgeSentAt: null,
  rewardSentAt: null,
  lapsedSentAt: null,
  lastPurchaseAt: new Date(Date.now() - 5 * 24 * 3600 * 1000),
  tierId: null,
  isActive: true,
  ...overrides,
});

export const mockSubscription = (overrides: Record<string, unknown> = {}) => ({
  id: 'sub-uuid',
  tenantId: 'tenant-uuid',
  planTier: 'starter',
  currency: 'NGN',
  amount: 8000,
  marketingRate: 130,
  utilityIncluded: 300,
  utilityUsedThisPeriod: 0,
  utilityOverageRate: 20,
  status: 'active',
  ...overrides,
});

export function makeJob(data: Record<string, unknown> = {}) {
  return {
    id: 'job-uuid',
    data: {
      type: TriggerType.WELCOME,
      tenantId: 'tenant-uuid',
      customerId: 'customer-uuid',
      data: {},
      ...data,
    },
    opts: { attempts: 3 },
    attemptsMade: 0,
  };
}

export function makeCampaign(overrides: Record<string, unknown> = {}) {
  return {
    id: 'campaign-uuid',
    tenantId: 'tenant-uuid',
    name: 'Test Campaign',
    messageBody: 'Hi {{firstName}}!',
    segmentRules: {},
    status: 'draft' as CampaignStatus,
    totalRecipients: 0,
    sentCount: 0,
    deliveredCount: 0,
    failedCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
