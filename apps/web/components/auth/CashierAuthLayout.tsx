import Link from 'next/link';
import type { ReactNode } from 'react';
import { BrandMark } from './AuthSplitLayout';

const POINTS = [
  'Works offline — syncs the moment you're back online',
  'Awards points the instant a sale is logged',
  'No extra hardware — runs in any browser',
];

export function CashierAuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-white">
      <div className="relative hidden w-[42%] shrink-0 overflow-hidden lg:flex lg:flex-col">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/cashier-bg.jpg"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center"
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(130% 90% at 0% 100%, rgba(13,197,106,0.30) 0%, rgba(10,22,40,0.05) 55%), linear-gradient(165deg, rgba(10,22,40,0.78) 0%, rgba(8,29,20,0.72) 55%, rgba(6,19,9,0.82) 100%)',
          }}
        />
        <div className="relative z-10 flex flex-1 flex-col px-12 py-12">
          <Link href="/" className="inline-flex w-fit items-center" aria-label="PingLoyal home">
            <BrandMark light />
          </Link>

          <span className="mt-14 inline-flex w-fit items-center gap-1.5 rounded-full border border-[#0DC56A]/25 bg-[#0DC56A]/10 px-3.5 py-1.5 text-xs font-semibold text-[#0DC56A]">
            Point of sale
          </span>

          <h2 className="mt-6 max-w-md text-[2.25rem] font-bold leading-[1.15] tracking-tight text-white">
            Award points on <span className="text-[#0DC56A]">every sale</span>
          </h2>
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/55">
            Log a purchase and PingLoyal handles the rest — points, tiers, and a WhatsApp message
            to the customer, automatically.
          </p>

          <div className="mt-auto space-y-3 pt-12">
            {POINTS.map((point) => (
              <div
                key={point}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0" aria-hidden="true">
                  <circle cx="8" cy="8" r="8" fill="#0DC56A" fillOpacity="0.2" />
                  <path
                    d="M5 8l2 2 4-4"
                    stroke="#0DC56A"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="text-sm text-white/70">{point}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">{children}</div>
    </div>
  );
}
