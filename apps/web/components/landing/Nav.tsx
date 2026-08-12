'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Logo } from './Logo';
import { BookDemoButton } from './BookDemoModal';

export function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 lg:px-8">
        <Link href="/" aria-label="PingLoyal home">
          <Logo />
        </Link>

        {/* Centre links — desktop only */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {[
            { label: 'How it works', href: '/#how-it-works' },
            { label: 'Features', href: '/#features' },
            { label: 'Pricing', href: '/#pricing' },
            { label: 'Case studies', href: '/#testimonials' },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-[#0A1628]"
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* Desktop CTAs */}
        <div className="hidden items-center gap-3 sm:flex">
          <Link href="/login" className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-[#0A1628] transition-colors hover:border-[#0A1628]">
            Sign in
          </Link>
          <Link href="/register" className="inline-flex rounded-lg bg-[#0DC56A] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0ab55e]">
            Start free trial
          </Link>
          <BookDemoButton className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-[#0A1628] transition-colors hover:border-[#0A1628]">
            Book a demo
          </BookDemoButton>
        </div>

        {/* Mobile: hamburger only */}
        <div className="flex items-center sm:hidden">
          <button
            onClick={() => setOpen(!open)}
            aria-label="Toggle menu"
            className="rounded-lg border border-gray-200 p-2 text-[#0A1628]"
          >
            {open ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {open && (
        <div className="border-t border-gray-200 bg-white px-6 pb-5 sm:hidden">
          <nav className="flex flex-col py-2">
            {[
              { label: 'How it works', href: '/#how-it-works' },
              { label: 'Features', href: '/#features' },
              { label: 'Pricing', href: '/#pricing' },
              { label: 'Case studies', href: '/#testimonials' },
            ].map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 hover:text-[#0A1628]"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="flex flex-col gap-2 border-t border-gray-100 pt-4">
            <Link
              href="/register"
              onClick={() => setOpen(false)}
              className="rounded-lg bg-[#0DC56A] px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-[#0ab55e]"
            >
              Start free trial →
            </Link>
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-[#0A1628] bg-[#0A1628] px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-[#1a3050]"
            >
              Sign in
            </Link>
            <BookDemoButton className="rounded-lg border border-[#0DC56A] px-4 py-2.5 text-center text-sm font-medium text-[#0DC56A] hover:bg-[#0DC56A] hover:text-white">
              Book a demo
            </BookDemoButton>
          </div>
        </div>
      )}
    </header>
  );
}
