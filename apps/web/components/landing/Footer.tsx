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
];

export function Footer() {
  return (
    <footer className="relative overflow-hidden bg-[#0d0f12] px-6 pt-16 lg:px-8">
      <div className="mx-auto max-w-6xl">

        {/* Top grid */}
        <div className="grid grid-cols-2 gap-10 md:grid-cols-5">
          {/* Brand — spans 2 cols on md */}
          <div className="col-span-2 md:col-span-2">
            <Logo light />
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

          {/* Social icons column */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-white">Social</p>
            <div className="mt-4 flex flex-wrap gap-3">
              {/* WhatsApp */}
              <a href="https://wa.me/2349094135585" aria-label="WhatsApp" className="flex-shrink-0 text-gray-400 transition-colors hover:text-[#25D366]">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.373 0 0 5.373 0 12c0 2.135.559 4.136 1.535 5.873L.057 23.55a.75.75 0 00.921.916l5.595-1.468A11.95 11.95 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0z" />
                </svg>
              </a>
              {/* Instagram */}
              <a href="https://instagram.com/pingloyal" aria-label="Instagram" className="flex-shrink-0 text-gray-400 transition-colors hover:text-[#E1306C]">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 1.17.054 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.058 1.265.07 1.645.07 4.849s-.012 3.584-.07 4.849c-.054 1.17-.249 1.805-.413 2.227-.217.562-.477.96-.896 1.382-.42.419-.82.679-1.382.896-.422.164-1.057.36-2.227.413-1.265.058-1.645.07-4.849.07s-3.584-.012-4.849-.07c-1.17-.054-1.805-.249-2.227-.413a3.697 3.697 0 01-1.382-.896 3.697 3.697 0 01-.896-1.382c-.164-.422-.36-1.057-.413-2.227C2.175 15.584 2.163 15.204 2.163 12s.012-3.584.07-4.849c.054-1.17.249-1.805.413-2.227.217-.562.477-.96.896-1.382a3.697 3.697 0 011.382-.896c.422-.164 1.057-.36 2.227-.413C8.416 2.175 8.796 2.163 12 2.163zm0-2.163C8.741 0 8.332.014 7.052.072 5.775.13 4.902.333 4.14.63a5.86 5.86 0 00-2.126 1.384A5.86 5.86 0 00.63 4.14C.333 4.902.13 5.775.072 7.052.014 8.332 0 8.741 0 12c0 3.259.014 3.668.072 4.948.058 1.277.261 2.15.558 2.912a5.86 5.86 0 001.384 2.126A5.86 5.86 0 004.14 23.37c.762.297 1.635.5 2.912.558C8.332 23.986 8.741 24 12 24s3.668-.014 4.948-.072c1.277-.058 2.15-.261 2.912-.558a5.86 5.86 0 002.126-1.384 5.86 5.86 0 001.384-2.126c.297-.762.5-1.635.558-2.912.058-1.28.072-1.689.072-4.948s-.014-3.668-.072-4.948c-.058-1.277-.261-2.15-.558-2.912a5.86 5.86 0 00-1.384-2.126A5.86 5.86 0 0019.86.63C19.098.333 18.225.13 16.948.072 15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                </svg>
              </a>
              {/* LinkedIn */}
              <a href="https://linkedin.com/company/pingloyal" aria-label="LinkedIn" className="flex-shrink-0 text-gray-400 transition-colors hover:text-[#0A66C2]">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
              </a>
              {/* X / Twitter */}
              <a href="https://x.com/pingloyal" aria-label="X (Twitter)" className="flex-shrink-0 text-gray-400 transition-colors hover:text-white">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              {/* Facebook */}
              <a href="https://facebook.com/pingloyal" aria-label="Facebook" className="flex-shrink-0 text-gray-400 transition-colors hover:text-[#1877F2]">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.791-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.874v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
                </svg>
              </a>
              {/* TikTok */}
              <a href="https://tiktok.com/@pingloyal" aria-label="TikTok" className="flex-shrink-0 text-gray-400 transition-colors hover:text-white">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z" />
                </svg>
              </a>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="mt-12 border-t border-white/10" />
      </div>

      {/* Large watermark brand text — responsive, above copyright */}
      <div className="pointer-events-none select-none overflow-hidden text-center">
        <p
          className="whitespace-nowrap bg-gradient-to-r from-[#0DC56A]/20 via-white/5 to-transparent bg-clip-text text-transparent font-black leading-none tracking-tighter"
          style={{ fontSize: 'clamp(36px, 10vw, 180px)' }}
        >
          PINGLOYAL
        </p>
      </div>

      {/* Bottom bar */}
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-3 border-t border-white/10 py-6 sm:flex-row">
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
    </footer>
  );
}
