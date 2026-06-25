import { Nav } from '@/components/landing/Nav';
import { Footer } from '@/components/landing/Footer';

export const metadata = {
  title: 'About — PingLoyal',
};

const VALUES = [
  {
    title: 'Built for how Nigerian retail actually works',
    body: 'No POS overhaul, no app your customers have to download — WhatsApp is where they already are, so that’s where loyalty happens.',
  },
  {
    title: 'Simple enough to run without a dev team',
    body: 'Most of our merchants are small, busy retail teams. If a feature needs a manual to use, we’ve done it wrong.',
  },
  {
    title: 'We charge for value delivered, not seats',
    body: 'Pricing scales with the WhatsApp messages a business actually sends — not per-user fees that punish a growing team.',
  },
];

export default function AboutPage() {
  return (
    <>
      <Nav />
      <main className="bg-white px-6 py-16 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-[#0DC56A]">
            About us
          </p>
          <h1 className="mt-2 text-3xl font-bold text-[#0A1628] lg:text-4xl">
            Turning one-time shoppers into loyal customers
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-gray-600">
            PingLoyal is a WhatsApp loyalty automation platform built for retail businesses in
            Nigeria. We help store owners reward repeat customers, win back the ones who&apos;ve
            drifted, and do it all without hiring a marketing team or learning new software —
            because it runs on WhatsApp, the app their customers already check every day.
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-gray-600">
            We&apos;re operated by Bhoyee Global Enterprise and based in Lagos, where we started
            by working closely with local retailers to understand what actually keeps customers
            coming back — and built PingLoyal around that, not around what a typical SaaS loyalty
            tool looks like elsewhere.
          </p>

          <h2 className="mt-12 text-xl font-bold text-[#0A1628]">What we believe</h2>
          <div className="mt-6 space-y-6">
            {VALUES.map((v) => (
              <div key={v.title} className="rounded-2xl border border-gray-200 p-5">
                <h3 className="font-semibold text-[#0A1628]">{v.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{v.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 rounded-2xl bg-[#0A1628] p-8 text-center">
            <h2 className="text-xl font-bold text-white">We&apos;re hiring</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/60">
              If you want to help small businesses grow, take a look at our open roles.
            </p>
            <a
              href="/careers"
              className="mt-5 inline-flex rounded-lg bg-[#0DC56A] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0ab55e]"
            >
              View open roles →
            </a>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
