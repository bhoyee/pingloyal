import Link from 'next/link';
import Hero from '@/components/landing/Hero';
import HowItWorks from '@/components/landing/HowItWorks';
import MessagesSection from '@/components/landing/MessagesSection';
import PricingSection from '@/components/landing/PricingSection';
import Testimonials from '@/components/landing/Testimonials';
import { BookDemoButton } from '@/components/landing/BookDemoModal';

// ── Logo ─────────────────────────────────────────────────────────────────────

function Logo({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0A1628]">
        <svg
          width="22"
          height="22"
          viewBox="0 0 22 22"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M18 2H4C2.9 2 2 2.9 2 4v10c0 1.1.9 2 2 2h4l3 3 3-3h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"
            stroke="rgba(255,255,255,0.65)"
            strokeWidth="1.5"
            fill="none"
          />
          <path
            d="M7 11l2.5 2.5 5.5-5.5"
            stroke="#0DC56A"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <span
        className={`text-lg font-bold ${light ? 'text-white' : 'text-[#0A1628]'}`}
      >
        PingLoyal
      </span>
    </div>
  );
}

// ── Nav ───────────────────────────────────────────────────────────────────────

function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 lg:px-8">
        <Link href="/" aria-label="PingLoyal home">
          <Logo />
        </Link>

        {/* Centre links — hidden on mobile */}
        <nav className="hidden items-center gap-8 md:flex" aria-label="Main">
          <a
            href="#how-it-works"
            className="text-sm font-medium text-gray-600 transition-colors hover:text-[#0A1628]"
          >
            How it works
          </a>
          <a
            href="#features"
            className="text-sm font-medium text-gray-600 transition-colors hover:text-[#0A1628]"
          >
            Features
          </a>
          <a
            href="#pricing"
            className="text-sm font-medium text-gray-600 transition-colors hover:text-[#0A1628]"
          >
            Pricing
          </a>
          <a
            href="#testimonials"
            className="text-sm font-medium text-gray-600 transition-colors hover:text-[#0A1628]"
          >
            Case studies
          </a>
        </nav>

        {/* Right CTAs */}
        <div className="flex items-center gap-3">
          <BookDemoButton className="hidden rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-[#0A1628] transition-colors hover:border-[#0A1628] sm:inline-flex">
            Book a demo
          </BookDemoButton>
          <Link
            href="/login"
            className="hidden rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-[#0A1628] transition-colors hover:border-[#0A1628] sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="inline-flex rounded-lg bg-[#0DC56A] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0ab55e]"
          >
            Start free trial
          </Link>
        </div>
      </div>
    </header>
  );
}

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
          <div className="rounded-2xl bg-[#0A1628] p-8 text-white">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-[#0DC56A]/20">
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
          <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-[#0DC56A]/10">
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
          <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-[#0DC56A]/10">
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
          <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-[#0DC56A]/10">
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

// ── Footer ────────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white px-6 py-16 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-4">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-gray-500">
              WhatsApp loyalty automation built for African retail. Turn every
              purchase into a loyal customer.
            </p>
          </div>

          {/* Product */}
          <div>
            <p className="text-sm font-semibold text-[#0A1628]">Product</p>
            <ul className="mt-4 space-y-3">
              {[
                { label: 'Features', href: '#features' },
                { label: 'Pricing', href: '#pricing' },
                { label: 'How it works', href: '#how-it-works' },
                { label: 'Case studies', href: '#testimonials' },
              ].map((l) => (
                <li key={l.label}>
                  <a
                    href={l.href}
                    className="text-sm text-gray-500 hover:text-[#0A1628]"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <p className="text-sm font-semibold text-[#0A1628]">Company</p>
            <ul className="mt-4 space-y-3">
              {[
                { label: 'About', href: '/about' },
                { label: 'Blog', href: '/blog' },
                { label: 'Careers', href: '/careers' },
                { label: 'Contact', href: '/contact' },
              ].map((l) => (
                <li key={l.label}>
                  <a
                    href={l.href}
                    className="text-sm text-gray-500 hover:text-[#0A1628]"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <p className="text-sm font-semibold text-[#0A1628]">Legal</p>
            <ul className="mt-4 space-y-3">
              {[
                { label: 'Privacy Policy', href: '/privacy' },
                { label: 'Terms of Service', href: '/terms' },
                { label: 'Cookie Policy', href: '/cookies' },
              ].map((l) => (
                <li key={l.label}>
                  <a
                    href={l.href}
                    className="text-sm text-gray-500 hover:text-[#0A1628]"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-gray-200 pt-8 sm:flex-row">
          <p className="text-sm text-gray-400">
            © 2025 PingLoyal — Operated by Bhoyee Global Enterprise
          </p>
          <p className="text-sm text-gray-400">
            Lagos, Nigeria ·{' '}
            <a
              href="mailto:hello@pingloyal.com"
              className="hover:text-[#0A1628]"
            >
              hello@pingloyal.com
            </a>
          </p>
        </div>
      </div>
    </footer>
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
