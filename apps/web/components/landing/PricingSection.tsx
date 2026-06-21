import Link from 'next/link';

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

const plans: Plan[] = [
  {
    name: 'Starter',
    price: '₦8,000',
    period: '/month',
    tagline: 'For solo retailers & kiosks',
    utility: '500 utility messages/month',
    wallet: '₦4 per marketing message',
    features: [
      'WhatsApp automation',
      'QR customer registration',
      'Cashier PWA (offline-ready)',
      'Points & tier system',
      'Up to 500 customers',
      'Email support',
    ],
    cta: 'Start free trial',
    popular: false,
  },
  {
    name: 'Growth',
    price: '₦20,000',
    period: '/month',
    tagline: 'For growing retail stores',
    utility: '2,000 utility messages/month',
    wallet: '₦3 per marketing message',
    features: [
      'Everything in Starter',
      'Unlimited customers',
      'Campaign scheduler',
      'Analytics dashboard',
      'Win-back automations',
      'Priority WhatsApp support',
    ],
    cta: 'Start free trial',
    popular: true,
  },
  {
    name: 'Connect',
    price: '₦45,000',
    period: '/month',
    tagline: 'For multi-location & existing POS',
    utility: '10,000 utility messages/month',
    wallet: '₦2 per marketing message',
    features: [
      'Everything in Growth',
      'Webhook & REST API access',
      'Custom POS integrations',
      'Dedicated onboarding session',
      'Multi-location support',
      'SLA-backed support',
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
        </div>

        {/* Cards */}
        <div className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex flex-col rounded-2xl border p-8 ${
                plan.popular
                  ? 'border-[#0DC56A] bg-white shadow-xl shadow-[#0DC56A]/10'
                  : 'border-gray-200 bg-white shadow-sm'
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
