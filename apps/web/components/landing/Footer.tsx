import { Logo } from './Logo';

export function Footer() {
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
                { label: 'Features', href: '/#features' },
                { label: 'Pricing', href: '/#pricing' },
                { label: 'How it works', href: '/#how-it-works' },
                { label: 'Case studies', href: '/#testimonials' },
              ].map((l) => (
                <li key={l.label}>
                  <a href={l.href} className="text-sm text-gray-500 hover:text-[#0A1628]">
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
                { label: 'Careers', href: '/careers' },
                { label: 'Contact', href: '/contact' },
              ].map((l) => (
                <li key={l.label}>
                  <a href={l.href} className="text-sm text-gray-500 hover:text-[#0A1628]">
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
                  <a href={l.href} className="text-sm text-gray-500 hover:text-[#0A1628]">
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
            <a href="mailto:hello@pingloyal.com" className="hover:text-[#0A1628]">
              hello@pingloyal.com
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
