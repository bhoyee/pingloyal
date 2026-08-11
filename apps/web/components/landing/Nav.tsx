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
        <nav className="hidden items-center gap-8 md:flex" aria-label="Main">
          <a href="/#how-it-works" className="text-sm font-medium text-gray-600 transition-colors hover:text-[#0A1628]">How it works</a>
          <a href="/#features" className="text-sm font-medium text-gray-600 transition-colors hover:text-[#0A1628]">Features</a>
          <a href="/#pricing" className="text-sm font-medium text-gray-600 transition-colors hover:text-[#0A1628]">Pricing</a>
          <a href="/#testimonials" className="text-sm font-medium text-gray-600 transition-colors hover:text-[#0A1628]">Case studies</a>
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

        {/* Mobile: Start free trial + hamburger */}
        <div className="flex items-center gap-2 sm:hidden">
          <Link href="/register" className="rounded-lg bg-[#0DC56A] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0ab55e]">
            Start free trial
          </Link>
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
          <nav className="flex flex-col gap-4 py-4">
            <a href="/#how-it-works" onClick={() => setOpen(false)} className="text-sm font-medium text-gray-600 hover:text-[#0A1628]">How it works</a>
            <a href="/#features" onClick={() => setOpen(false)} className="text-sm font-medium text-gray-600 hover:text-[#0A1628]">Features</a>
            <a href="/#pricing" onClick={() => setOpen(false)} className="text-sm font-medium text-gray-600 hover:text-[#0A1628]">Pricing</a>
            <a href="/#testimonials" onClick={() => setOpen(false)} className="text-sm font-medium text-gray-600 hover:text-[#0A1628]">Case studies</a>
          </nav>
          <div className="flex flex-col gap-2 border-t border-gray-100 pt-4">
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-gray-200 px-4 py-2.5 text-center text-sm font-medium text-[#0A1628] hover:border-[#0A1628]"
            >
              Sign in
            </Link>
            <BookDemoButton className="rounded-lg border border-gray-200 px-4 py-2.5 text-center text-sm font-medium text-[#0A1628] hover:border-[#0A1628]">
              Book a demo
            </BookDemoButton>
          </div>
        </div>
      )}
    </header>
  );
}
