import Link from 'next/link';
import { BookDemoButton } from './BookDemoModal';

interface Plan {
  name: string;
  price: string;
  period: string;
  tagline: string;
  utility: string;
  wallet: string;
  features: string[];
  cta: string;
  popular: boolean;
}

// Kept in lockstep with apps/api/src/modules/billing/plans.config.ts (NGN
// rates) and the PLAN_COPY feature lists on the dashboard Billing page
// (apps/web/app/(dashboard)/billing/page.tsx) — these are the same plans
// a tenant sees and gets charged for, just before they sign up.
const plans: Plan[] = [
  {
    name: 'Starter',
    price: '₦8,000',
    period: '/month',
    tagline: 'Solo Store — for a single store doing up to 300 purchases per month',
    utility: '300 utility messages/month',
    wallet: '₦130 per marketing message',
    features: [
      'Unlimited customers',
      'All 5 automated triggers',
      'Cashier app (PWA)',
      'QR customer registration',
      'Campaign broadcast builder',
      'VIP tier segmentation',
      'Category targeting',
      'CSV customer import',
      'Self-service WhatsApp bot',
      'Integration connector',
      'Full dashboard & analytics',
      'Unlimited bot replies (free)',
    ],
    cta: 'Start free trial',
    popular: false,
  },
  {
    name: 'Growth',
    price: '₦20,000',
    period: '/month',
    tagline: 'Growing Chain — for stores doing up to 800 purchases per month',
    utility: '800 utility messages/month',
    wallet: '₦115 per marketing message',
    features: [
      'Everything in Starter',
      'Priority email support',
    ],
    cta: 'Start free trial',
    popular: true,
  },
  {
    name: 'Connect',
    price: '₦45,000',
    period: '/month',
    tagline: 'Existing System — for stores doing 800+ purchases using their own loyalty system',
    utility: '2,000 utility messages/month',
    wallet: '₦105 per marketing message',
    features: [
      'Everything in Growth',
      'Webhook + API pull',
      'Dedicated onboarding support',
    ],
    cta: 'Start free trial',
    popular: false,
  },
];

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className="shrink-0"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="8" fill="#0DC56A" fillOpacity="0.15" />
      <path
        d="M5 8l2 2 4-4"
        stroke="#0DC56A"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function PricingSection() {
  return (
    <section className="bg-[#F9FAFB] px-6 py-24 lg:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="text-center">
          <span className="inline-block rounded-full bg-[#0DC56A]/10 px-4 py-1.5 text-sm font-semibold text-[#0DC56A]">
            Pricing
          </span>
          <h2 className="mt-4 text-4xl font-bold tracking-tight text-[#0A1628] lg:text-5xl">
            Simple, transparent pricing
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-gray-600">
            All plans include a 14-day free trial. Card required — nothing
            charged until day 14.
          </p>
          <p className="mt-3 text-sm text-gray-500">
            Not sure which plan fits?{' '}
            <BookDemoButton className="font-semibold text-[#0A1628] underline">
              Book a demo
            </BookDemoButton>{' '}
            and we&apos;ll help you decide.
          </p>
        </div>

        {/* Cards */}
        <div className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`group relative flex flex-col rounded-2xl border p-8 transition-all duration-300 hover:-translate-y-1.5 ${
                plan.popular
                  ? 'border-[#0DC56A] bg-white shadow-xl shadow-[#0DC56A]/10 hover:shadow-2xl hover:shadow-[#0DC56A]/20'
                  : 'border-gray-200 bg-white shadow-sm hover:border-[#0DC56A]/30 hover:shadow-lg'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-[#0DC56A] px-4 py-1 text-xs font-bold text-white shadow-md">
                    Most popular
                  </span>
                </div>
              )}

              <div>
                <p className="text-sm font-semibold text-gray-500">{plan.name}</p>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-[#0A1628]">
                    {plan.price}
                  </span>
                  <span className="text-sm text-gray-500">{plan.period}</span>
                </div>
                <p className="mt-1 text-sm text-gray-500">{plan.tagline}</p>

                {/* Included messages */}
                <div className="mt-5 space-y-2 rounded-xl bg-gray-50 p-4">
                  <div className="flex items-center gap-2">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      aria-hidden="true"
                    >
                      <circle cx="7" cy="7" r="7" fill="#0A1628" fillOpacity="0.08" />
                      <path
                        d="M4 7l2 2 4-4"
                        stroke="#0A1628"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span className="text-xs font-medium text-[#0A1628]">
                      {plan.utility}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      aria-hidden="true"
                    >
                      <circle cx="7" cy="7" r="7" fill="#f59e0b" fillOpacity="0.12" />
                      <path
                        d="M7 4v3l2 1"
                        stroke="#f59e0b"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span className="text-xs font-medium text-[#0A1628]">
                      {plan.wallet}
                    </span>
                  </div>
                </div>
              </div>

              {/* Feature list */}
              <ul className="mt-6 flex-1 space-y-3">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <CheckIcon />
                    <span className="text-sm text-gray-700">{f}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/register"
                className={`mt-8 block w-full rounded-xl py-3 text-center text-sm font-semibold transition-colors ${
                  plan.popular
                    ? 'bg-[#0DC56A] text-white shadow-md hover:bg-[#0ab55e]'
                    : 'border border-[#0A1628] text-[#0A1628] hover:bg-[#0A1628] hover:text-white'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-gray-500">
          Marketing Wallet is pay-as-you-go — top up only when you need it.
          Utility messages are always included in your plan.
        </p>
      </div>
    </section>
  );
}
