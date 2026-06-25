import Link from 'next/link';
import Hero from '@/components/landing/Hero';
import HowItWorks from '@/components/landing/HowItWorks';
import MessagesSection from '@/components/landing/MessagesSection';
import PricingSection from '@/components/landing/PricingSection';
import Testimonials from '@/components/landing/Testimonials';
import { Nav } from '@/components/landing/Nav';
import { Footer } from '@/components/landing/Footer';

// ── Social Proof Strip ────────────────────────────────────────────────────────

function SocialProofStrip() {
  const stats = [
    { value: '200+', label: 'Active stores in Lagos' },
    { value: '95%', label: 'WhatsApp open rate' },
    { value: '₦0', label: 'Setup cost — ever' },
    { value: '10min', label: 'Average time to go live' },
  ];

  return (
    <div className="bg-[#0A1628] px-6 py-12 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-3xl font-bold text-[#0DC56A] lg:text-4xl">
                {s.value}
              </p>
              <p className="mt-1 text-sm text-white/60">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Features Grid ─────────────────────────────────────────────────────────────

function FeaturesGrid() {
  return (
    <section id="features" className="bg-white px-6 py-24 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <span className="inline-block rounded-full bg-[#0DC56A]/10 px-4 py-1.5 text-sm font-semibold text-[#0DC56A]">
            Features
          </span>
          <h2 className="mt-4 text-4xl font-bold tracking-tight text-[#0A1628] lg:text-5xl">
            Built for African retail
          </h2>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* Card 1 — featured / navy */}
          <div className="group rounded-2xl bg-[#0A1628] p-8 text-white transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-black/20">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-[#0DC56A]/20 transition-transform duration-300 group-hover:scale-110">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M20 2H4C2.9 2 2 2.9 2 4v16l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"
                  stroke="#0DC56A"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                  fill="none"
                />
                <path
                  d="M8 9h8M8 13h5"
                  stroke="#0DC56A"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <h3 className="text-xl font-bold">WhatsApp-first automation</h3>
            <p className="mt-2 leading-relaxed text-white/70">
              Every customer interaction happens where your customers already
              are — WhatsApp. Points, rewards, win-backs, and birthday messages
              delivered automatically.
            </p>
          </div>

          {/* Card 2 */}
          <div className="group rounded-2xl border border-gray-200 bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-[#0DC56A]/30 hover:shadow-lg">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-[#0DC56A]/10 transition-transform duration-300 group-hover:scale-110">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <rect
                  x="5"
                  y="2"
                  width="14"
                  height="20"
                  rx="2"
                  stroke="#0DC56A"
                  strokeWidth="1.8"
                />
                <path
                  d="M9 7h6M9 11h6M9 15h4"
                  stroke="#0DC56A"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <circle cx="19" cy="18" r="4" fill="#0DC56A" />
                <path
                  d="M17.5 18l1 1 2-2"
                  stroke="white"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-[#0A1628]">
              Cashier PWA — works offline
            </h3>
            <p className="mt-2 leading-relaxed text-gray-600">
              Your cashier app keeps working even when the internet goes down.
              Transactions queue locally in IndexedDB and sync the moment
              connectivity returns.
            </p>
          </div>

          {/* Card 3 */}
          <div className="group rounded-2xl border border-gray-200 bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-[#0DC56A]/30 hover:shadow-lg">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-[#0DC56A]/10 transition-transform duration-300 group-hover:scale-110">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  cx="9"
                  cy="7"
                  r="4"
                  stroke="#0DC56A"
                  strokeWidth="1.8"
                />
                <path
                  d="M2 21c0-4 3.1-7 7-7s7 3 7 7"
                  stroke="#0DC56A"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <path
                  d="M16 3.5c1.7.6 3 2.2 3 4s-1.3 3.4-3 4M19 14.5c2.1.7 4 2.5 4 5.5"
                  stroke="#0DC56A"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-[#0A1628]">
              Unlimited customers, all plans
            </h3>
            <p className="mt-2 leading-relaxed text-gray-600">
              We don&apos;t charge per customer. Grow your loyalty programme to
              thousands of members without watching the bill climb.
            </p>
          </div>

          {/* Card 4 */}
          <div className="group rounded-2xl border border-gray-200 bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-[#0DC56A]/30 hover:shadow-lg">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-[#0DC56A]/10 transition-transform duration-300 group-hover:scale-110">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <rect
                  x="2"
                  y="3"
                  width="20"
                  height="14"
                  rx="2"
                  stroke="#0DC56A"
                  strokeWidth="1.8"
                />
                <path
                  d="M7 13l3-4 3 3 3-5"
                  stroke="#0DC56A"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M8 20h8M12 17v3"
                  stroke="#0DC56A"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-[#0A1628]">
              Real-time analytics dashboard
            </h3>
            <p className="mt-2 leading-relaxed text-gray-600">
              See delivery rates, repeat visit trends, top spenders, and
              campaign performance — all in one place, updated in real time.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── CTA Section ───────────────────────────────────────────────────────────────

function CTASection() {
  return (
    <section className="bg-white px-6 py-16 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col items-center justify-between gap-6 rounded-2xl bg-[#0A1628] px-10 py-12 sm:flex-row">
          <div>
            <h2 className="text-2xl font-bold text-white lg:text-3xl">
              Ready to grow your loyal customer base?
            </h2>
            <p className="mt-2 text-white/60">
              Join 200+ stores across Lagos. 14-day free trial — card required, nothing charged until day 14.
            </p>
          </div>
          <Link
            href="/register"
            className="shrink-0 rounded-xl bg-[#0DC56A] px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-[#0DC56A]/25 transition-colors hover:bg-[#0ab55e]"
          >
            Start free trial →
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <SocialProofStrip />
        <HowItWorks />
        <MessagesSection />
        <FeaturesGrid />
        <div id="pricing">
          <PricingSection />
        </div>
        <div id="testimonials">
          <Testimonials />
        </div>
        <CTASection />
      </main>
      <Footer />
    </>
  );
}
