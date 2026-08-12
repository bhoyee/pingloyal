'use client';
import { useState } from 'react';
import Link from 'next/link';
import { HeroImageCarousel, HERO_SLIDES } from './HeroImageCarousel';

export default function Hero() {
  const [index, setIndex] = useState(0);
  const slide = HERO_SLIDES[index];

  return (
    <section className="bg-white px-6 pb-24 pt-16 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-2">
          {/* ── Left column ── */}
          <div className="space-y-8">
            {/* Badge — static, no blinking dot */}
            <div className="inline-flex items-center rounded-full border border-gray-200 bg-white px-4 py-2 shadow-sm">
              <span className="text-sm font-medium text-gray-600">
                Now live in Nigeria — 14-day free trial
              </span>
            </div>

            {/* Headline */}
            <h1 className="text-5xl font-bold leading-tight tracking-tight text-[#0A1628] lg:text-6xl">
              Turn every visit into a{' '}
              <span className="text-[#0DC56A]">loyal customer</span>
            </h1>

            {/* Subtext */}
            <p className="max-w-lg text-lg leading-relaxed text-gray-600">
              PingLoyal sends automated WhatsApp messages that bring customers
              back — points updates, birthday greetings, win-back nudges. Set
              it up in 10 minutes.
            </p>

            {/* CTAs */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Link
                href="/register"
                className="inline-flex items-center justify-center rounded-xl bg-[#0DC56A] px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-[#0DC56A]/25 transition-colors hover:bg-[#0ab55e] active:bg-[#09a354]"
              >
                Start your free trial →
              </Link>
              <a
                href="#how-it-works"
                className="group inline-flex items-center gap-2.5 text-base font-medium text-[#0A1628]"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#0A1628] bg-white shadow-sm transition-all duration-300 group-hover:scale-110 group-hover:border-[#0DC56A] group-hover:bg-[#0DC56A]">
                  <svg
                    width="12"
                    height="14"
                    viewBox="0 0 12 14"
                    fill="none"
                    aria-hidden="true"
                    className="transition-transform duration-300 group-hover:translate-x-0.5"
                  >
                    <path
                      d="M2 1L10 7L2 13"
                      className="stroke-[#0A1628] transition-colors duration-300 group-hover:stroke-white"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="transition-colors duration-300 group-hover:text-[#0DC56A]">
                  See how it works
                </span>
              </a>
            </div>

            {/* Trust bar */}
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#0DC56A]/30 bg-[#0DC56A]/5 px-3 py-1.5 text-sm font-medium text-[#0DC56A]">
                🚀 Now in early access — be among the first stores in Lagos
              </span>
            </div>
          </div>

          {/* ── Right column ── */}
          <div className="relative pb-10 pr-2">
            {/* Main image carousel */}
            <div className="relative aspect-[5/4] overflow-hidden rounded-2xl bg-[#0A1628] shadow-2xl">
              <HeroImageCarousel index={index} onIndexChange={setIndex} />
            </div>

            {/* Floating revenue card — synced with slide */}
            <div className="absolute -right-3 -top-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-xl">
              <p className="text-xs text-gray-500">This month</p>
              <p className="mt-0.5 text-xl font-bold text-[#0A1628]">{slide.revenue}</p>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="text-xs font-semibold text-[#0DC56A]">{slide.revenueChange}</span>
                <span className="text-xs text-gray-500">from repeat customers</span>
              </div>
            </div>

            {/* Floating WhatsApp card — synced with slide */}
            <div className="absolute -bottom-4 -right-3 w-60 rounded-2xl border border-gray-200 bg-white p-4 shadow-xl">
              <div className="mb-2.5 flex items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#25D366]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="white" aria-hidden="true">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.135.559 4.136 1.535 5.873L.057 23.55a.75.75 0 00.921.916l5.595-1.468A11.95 11.95 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0z" />
                  </svg>
                </div>
                <span className="text-xs font-semibold text-[#0A1628]">PingLoyal</span>
                <span className="ml-auto text-xs text-gray-400">now</span>
              </div>
              <div className="rounded-lg bg-gray-50 p-2.5">
                <p className="text-xs leading-relaxed text-[#0A1628]">
                  Hi {slide.customerName}! 🎉 You just earned{' '}
                  <span className="font-semibold">{slide.pointsEarned} points</span>. Only{' '}
                  {slide.pointsNeeded} pts from a free item!
                </p>
              </div>
              <div className="mt-1.5 flex justify-end">
                <span className="text-xs text-gray-400">9:41 AM ✓✓</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
