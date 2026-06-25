import Link from 'next/link';
import { Logo } from './Logo';

export function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 lg:px-8">
        <Link href="/" aria-label="PingLoyal home">
          <Logo />
        </Link>

        {/* Centre links — hidden on mobile */}
        <nav className="hidden items-center gap-8 md:flex" aria-label="Main">
          <a
            href="/#how-it-works"
            className="text-sm font-medium text-gray-600 transition-colors hover:text-[#0A1628]"
          >
            How it works
          </a>
          <a
            href="/#features"
            className="text-sm font-medium text-gray-600 transition-colors hover:text-[#0A1628]"
          >
            Features
          </a>
          <a
            href="/#pricing"
            className="text-sm font-medium text-gray-600 transition-colors hover:text-[#0A1628]"
          >
            Pricing
          </a>
          <a
            href="/#testimonials"
            className="text-sm font-medium text-gray-600 transition-colors hover:text-[#0A1628]"
          >
            Case studies
          </a>
        </nav>

        {/* Right CTAs */}
        <div className="flex items-center gap-3">
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
