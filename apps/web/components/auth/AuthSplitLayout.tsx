import Link from 'next/link';
import type { ReactNode } from 'react';

const STATS = [
  { value: '41%', label: 'Lift in return visits' },
  { value: '95%', label: 'WhatsApp open rate' },
  { value: '₦0', label: 'Setup cost — ever' },
  { value: '10min', label: 'Average time to go live' },
];

function BrandMark({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-xl ${
          light ? 'bg-white/10' : 'bg-[#0A1628]'
        }`}
      >
        <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true">
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
      <span className={`text-lg font-bold ${light ? 'text-white' : 'text-[#0A1628]'}`}>
        PingLoyal
      </span>
    </div>
  );
}

export function AuthSplitLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-white">
      {/* Brand panel — hidden below lg, where the form alone needs the
          full screen. */}
      <div className="relative hidden w-[42%] shrink-0 overflow-hidden lg:flex lg:flex-col">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(130% 90% at 0% 100%, rgba(13,197,106,0.28) 0%, rgba(10,22,40,0) 55%), linear-gradient(165deg, #0A1628 0%, #081d14 55%, #061309 100%)',
          }}
        />
        <div className="relative z-10 flex flex-1 flex-col px-12 py-12">
          <Link href="/" className="inline-flex w-fit items-center" aria-label="PingLoyal home">
            <BrandMark light />
          </Link>

          <span className="mt-14 inline-flex w-fit items-center gap-1.5 rounded-full border border-[#0DC56A]/25 bg-[#0DC56A]/10 px-3.5 py-1.5 text-xs font-semibold text-[#0DC56A]">
            🇳🇬 Built for African retail
          </span>

          <h2 className="mt-6 max-w-md text-[2.25rem] font-bold leading-[1.15] tracking-tight text-white">
            Turn every purchase into a <span className="text-[#0DC56A]">loyal customer</span>
          </h2>
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/55">
            PingLoyal sends automated WhatsApp messages that bring customers back — points
            updates, birthday greetings, win-back nudges. Set it up in 10 minutes.
          </p>

          <div className="mt-auto grid grid-cols-2 gap-3 pt-12">
            {STATS.map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-3.5"
              >
                <p className="text-2xl font-bold text-[#0DC56A]">{s.value}</p>
                <p className="mt-1 text-xs text-white/50">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        {children}
      </div>
    </div>
  );
}

export { BrandMark };
