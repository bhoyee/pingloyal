import { Nav } from '@/components/landing/Nav';
import { Footer } from '@/components/landing/Footer';

export const metadata = {
  title: 'About — PingLoyal',
  description: 'Learn about PingLoyal — our mission, vision, and why we build loyalty tools for African SMBs.',
};

const VALUES = [
  {
    title: 'Built for how Nigerian SMBs actually work',
    body: "No POS overhaul, no app your customers have to download — WhatsApp is where they already are, so that is where loyalty happens, whether you run a store, a salon, or a restaurant.",
  },
  {
    title: 'Simple enough to run without a dev team',
    body: "Most of our merchants are small, busy teams. If a feature needs a manual to use, we have done it wrong.",
  },
  {
    title: 'We charge for value delivered, not seats',
    body: 'Pricing scales with the WhatsApp messages a business actually sends — not per-user fees that punish a growing team.',
  },
];

const STATS = [
  { value: '200+', label: 'Stores onboarded' },
  { value: '50K+', label: 'Loyalty messages sent' },
  { value: '34%', label: 'Avg. repeat visit increase' },
  { value: '10 min', label: 'Average setup time' },
];

export default function AboutPage() {
  return (
    <>
      <Nav />
      <main className="bg-white">

        {/* Hero */}
        <section className="bg-[#0A1628] px-6 py-20 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-[#0DC56A]">
              About PingLoyal
            </p>
            <h1 className="mt-3 text-3xl font-bold text-white lg:text-5xl">
              Turning one-time customers into loyal regulars
            </h1>
            <p className="mt-5 text-[15px] leading-relaxed text-white/60">
              We build WhatsApp loyalty tools for small businesses across Nigeria — so every
              owner can compete with the big chains, without the big budgets.
            </p>
          </div>
        </section>

        {/* Stats */}
        <section className="border-b border-gray-100 px-6 py-12 lg:px-8">
          <div className="mx-auto max-w-4xl grid grid-cols-2 gap-8 sm:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-3xl font-bold text-[#0A1628]">{s.value}</p>
                <p className="mt-1 text-sm text-gray-500">{s.label}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="mx-auto max-w-3xl px-6 py-16 lg:px-8 space-y-16">

          {/* Our story */}
          <section>
            <p className="text-sm font-semibold uppercase tracking-wide text-[#0DC56A]">Our story</p>
            <h2 className="mt-2 text-2xl font-bold text-[#0A1628]">Where we started</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-gray-600">
              PingLoyal was born out of a simple observation: Nigerian retail business owners are
              some of the most hardworking entrepreneurs in the world, yet most loyalty software
              was built for malls in the US, not markets in Lagos. The tools were too expensive,
              too complicated, or required customers to download yet another app they'd forget
              about by next week.
            </p>
            <p className="mt-4 text-[15px] leading-relaxed text-gray-600">
              We started by sitting with local store owners — provisions shops, bakeries, salons,
              restaurants — listening to how they actually keep customers coming back. The answer
              was always personal, always WhatsApp. So we built PingLoyal around that: loyalty
              automation that works on the app their customers already open every single day.
            </p>
          </section>

          {/* Mission */}
          <section className="rounded-2xl border border-[#0DC56A]/30 bg-[#0DC56A]/5 p-8">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#0DC56A]">Our mission</p>
            <h2 className="mt-2 text-xl font-bold text-[#0A1628]">
              Make world-class customer loyalty accessible to every African SMB
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-gray-600">
              We believe the corner store, the neighbourhood salon, and the family-run restaurant
              deserve the same customer retention tools that big chains take for granted — without
              enterprise pricing, complex integrations, or a dedicated IT team to run them.
            </p>
          </section>

          {/* Vision */}
          <section className="rounded-2xl border border-[#0A1628]/10 bg-[#0A1628]/5 p-8">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#0A1628]">Our vision</p>
            <h2 className="mt-2 text-xl font-bold text-[#0A1628]">
              The loyalty layer for African commerce
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-gray-600">
              In five years, we want every WhatsApp-using customer in Africa to be part of a
              loyalty programme powered by PingLoyal — and every SMB owner to know, down to the
              last naira, exactly what their repeat customers are worth to their business.
            </p>
          </section>

          {/* Values */}
          <section>
            <p className="text-sm font-semibold uppercase tracking-wide text-[#0DC56A]">What we believe</p>
            <h2 className="mt-2 text-2xl font-bold text-[#0A1628]">Our principles</h2>
            <div className="mt-6 space-y-4">
              {VALUES.map((v) => (
                <div key={v.title} className="rounded-2xl border border-gray-200 p-5">
                  <h3 className="font-semibold text-[#0A1628]">{v.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{v.body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* CTA */}
          <div className="rounded-2xl bg-[#0A1628] p-8 text-center">
            <h2 className="text-xl font-bold text-white">We&apos;re hiring</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/60">
              If you want to help small businesses grow across Nigeria, take a look at our open roles.
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
