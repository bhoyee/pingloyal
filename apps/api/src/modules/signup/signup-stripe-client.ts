// Minimal Stripe interface, mirroring billing.service.ts's local interface.
// Duplicated rather than imported from billing/ — SignupService intentionally
// does not depend on BillingService (see signup.module.ts).

export interface StripeCheckoutSession {
  url: string | null;
}

export interface StripeClient {
  checkout: {
    sessions: {
      create: (params: object) => Promise<StripeCheckoutSession>;
    };
  };
}

export function createStripeClient(key: string): StripeClient {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-call
  return new (require('stripe'))(key, {
    apiVersion: '2024-12-18.acacia',
  }) as StripeClient;
}
