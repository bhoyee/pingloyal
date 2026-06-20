export const PLANS = {
  starter_ngn: {
    planTier: 'starter' as const,
    currency: 'NGN' as const,
    amount: 8000,
    utilityIncluded: 300,
    utilityOverageRate: 20.0,
    marketingRate: 130.0,
    paystackPlanCode: process.env.PAYSTACK_PLAN_STARTER_NGN,
  },
  growth_ngn: {
    planTier: 'growth' as const,
    currency: 'NGN' as const,
    amount: 20000,
    utilityIncluded: 800,
    utilityOverageRate: 16.0,
    marketingRate: 115.0,
    paystackPlanCode: process.env.PAYSTACK_PLAN_GROWTH_NGN,
  },
  connect_ngn: {
    planTier: 'connect' as const,
    currency: 'NGN' as const,
    amount: 45000,
    utilityIncluded: 2000,
    utilityOverageRate: 13.0,
    marketingRate: 105.0,
    paystackPlanCode: process.env.PAYSTACK_PLAN_CONNECT_NGN,
  },
  starter_gbp: {
    planTier: 'starter' as const,
    currency: 'GBP' as const,
    amount: 800,
    utilityIncluded: 300,
    utilityOverageRate: 0.2,
    marketingRate: 1.3,
    stripePriceId: process.env.STRIPE_PRICE_STARTER_GBP,
  },
  growth_gbp: {
    planTier: 'growth' as const,
    currency: 'GBP' as const,
    amount: 2000,
    utilityIncluded: 800,
    utilityOverageRate: 0.16,
    marketingRate: 1.15,
    stripePriceId: process.env.STRIPE_PRICE_GROWTH_GBP,
  },
  connect_gbp: {
    planTier: 'connect' as const,
    currency: 'GBP' as const,
    amount: 4500,
    utilityIncluded: 2000,
    utilityOverageRate: 0.13,
    marketingRate: 1.05,
    stripePriceId: process.env.STRIPE_PRICE_CONNECT_GBP,
  },
} as const;

export type PlanId = keyof typeof PLANS;

// Small refundable charge used to capture a reusable Paystack authorization
// code at trial start, since Paystack has no true zero-amount authorization.
// Refunded automatically once the authorization code is captured.
export const PAYSTACK_VERIFICATION_CHARGE_NAIRA = 50;
