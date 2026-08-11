import { Logo } from './Logo';

const NAV = [
  {
    heading: 'Product',
    links: [
      { label: 'Features', href: '/#features' },
      { label: 'Pricing', href: '/#pricing' },
      { label: 'How it works', href: '/#how-it-works' },
      { label: 'Case studies', href: '/#testimonials' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Careers', href: '/careers' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Terms of Service', href: '/terms' },
      { label: 'Cookie Policy', href: '/cookies' },
    ],
  },
  {
    heading: 'Social',
    links: [
      { label: 'WhatsApp', href: 'https://wa.me/2349094135585' },
      { label: 'Instagram', href: 'https://instagram.com/pingloyal' },
      { label: 'LinkedIn', href: 'https://linkedin.com/company/pingloyal' },
      { label: 'X (Twitter)', href: 'https://x.com/pingloyal' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative overflow-hidden bg-[#0d0f12] px-6 pt-16 lg:px-8">
      <div className="mx-auto max-w-6xl">

        {/* Top grid */}
        <div className="grid grid-cols-2 gap-10 md:grid-cols-5">
          {/* Brand — spans 2 cols on md */}
          <div className="col-span-2 md:col-span-2">
            {/* Logo shown white on dark bg */}
            <div className="brightness-0 invert">
              <Logo />
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-gray-400">
              WhatsApp loyalty automation for African SMBs — retail, food, and
              service businesses alike. Turn every visit into a loyal customer.
            </p>
            <a
              href="/register"
              className="mt-6 inline-flex rounded-lg bg-[#0DC56A] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0ab55e]"
            >
              Start free trial →
            </a>
          </div>

          {/* Nav columns */}
          {NAV.map((col) => (
            <div key={col.heading}>
              <p className="text-xs font-semibold uppercase tracking-widest text-white">
                {col.heading}
              </p>
              <ul className="mt-4 space-y-3">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      className="text-sm text-gray-400 transition-colors hover:text-white"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="mt-12 border-t border-white/10" />

        {/* Bottom bar */}
        <div className="flex flex-col items-center justify-between gap-3 py-6 sm:flex-row">
          <p className="text-sm text-gray-500">
            © {new Date().getFullYear()} PingLoyal · Lagos, Nigeria ·{' '}
            <a href="mailto:hello@pingloyal.com" className="hover:text-white">
              hello@pingloyal.com
            </a>
          </p>
          <p className="text-sm text-gray-500">
            Dev by{' '}
            <a href="https://salisu.dev" className="hover:text-white">
              salisu.dev
            </a>
          </p>
        </div>
      </div>

      {/* Large watermark brand text */}
      <div className="pointer-events-none select-none overflow-hidden">
        <p
          className="whitespace-nowrap bg-gradient-to-r from-[#0DC56A]/20 via-white/5 to-transparent bg-clip-text text-transparent font-black leading-none tracking-tighter"
          style={{ fontSize: 'clamp(72px, 14vw, 180px)' }}
        >
          PINGLOYAL
        </p>
      </div>
    </footer>
  );
}
