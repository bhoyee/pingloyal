import { Nav } from '@/components/landing/Nav';
import { Footer } from '@/components/landing/Footer';

export const metadata = {
  title: 'Careers — PingLoyal',
};

interface Role {
  title: string;
  type: string;
  location: string;
  summary: string;
  responsibilities: string[];
  requirements: string[];
}

const ROLES: Role[] = [
  {
    title: 'Marketing Intern',
    type: 'Internship',
    location: 'Lagos, Nigeria (Hybrid)',
    summary:
      'Help us reach more Nigerian retail businesses — content, social media, and campaign support for the PingLoyal brand.',
    responsibilities: [
      'Draft social media posts and short-form content for Instagram, X, and WhatsApp Status',
      'Support email and WhatsApp marketing campaigns to prospective merchants',
      'Research retail businesses in target markets for outreach',
      'Help track and report on marketing campaign performance',
    ],
    requirements: [
      'Currently studying or recently graduated in Marketing, Communications, or a related field',
      'Comfortable writing in a clear, friendly brand voice',
      'Familiar with Instagram, X, and basic design tools (Canva or similar)',
      'Based in or able to work from Lagos',
    ],
  },
  {
    title: 'Sales Associate',
    type: 'Full-time',
    location: 'Lagos, Nigeria',
    summary:
      'Bring PingLoyal to retail business owners across Lagos — from first conversation through to a signed-up, active store.',
    responsibilities: [
      'Identify and reach out to retail businesses that fit PingLoyal',
      'Run product demos and answer pricing/feature questions',
      'Follow up with trial sign-ups to help them go live',
      'Share market feedback with the product team',
    ],
    requirements: [
      '1+ years in a sales, business development, or customer-facing role',
      'Comfortable speaking with small business owners in person and by phone/WhatsApp',
      'Organized — able to track a pipeline of leads without things falling through',
      'Based in or able to work from Lagos',
    ],
  },
];

function RoleCard({ role }: { role: Role }) {
  return (
    <div className="rounded-2xl border border-gray-200 p-6 sm:p-8">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold text-[#0A1628]">{role.title}</h2>
        <span className="rounded-full bg-[#0DC56A]/10 px-3 py-1 text-xs font-semibold text-[#0DC56A]">
          {role.type}
        </span>
        <span className="text-sm text-gray-500">{role.location}</span>
      </div>
      <p className="mt-3 text-[15px] leading-relaxed text-gray-600">{role.summary}</p>

      <div className="mt-5 grid gap-6 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            What you&apos;ll do
          </p>
          <ul className="mt-2.5 space-y-2">
            {role.responsibilities.map((item) => (
              <li key={item} className="flex gap-2 text-sm text-gray-600">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gray-400" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            What we&apos;re looking for
          </p>
          <ul className="mt-2.5 space-y-2">
            {role.requirements.map((item) => (
              <li key={item} className="flex gap-2 text-sm text-gray-600">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gray-400" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <a
        href={`mailto:hello@pingloyal.com?subject=${encodeURIComponent(
          `Application: ${role.title}`,
        )}`}
        className="mt-6 inline-flex rounded-lg bg-[#0A1628] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#16294a]"
      >
        Apply for this role →
      </a>
    </div>
  );
}

export default function CareersPage() {
  return (
    <>
      <Nav />
      <main className="bg-white px-6 py-16 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-[#0DC56A]">Careers</p>
          <h1 className="mt-2 text-3xl font-bold text-[#0A1628] lg:text-4xl">
            Help Nigerian retail businesses grow
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-gray-600">
            We&apos;re a small team based in Lagos, building tools that help local retailers keep
            their customers coming back. Here&apos;s what we&apos;re hiring for right now.
          </p>

          <div className="mt-10 space-y-6">
            {ROLES.map((role) => (
              <RoleCard key={role.title} role={role} />
            ))}
          </div>

          <p className="mt-10 text-center text-sm text-gray-500">
            Don&apos;t see a fit but think you&apos;d be great here?{' '}
            <a
              href="mailto:hello@pingloyal.com"
              className="font-medium text-[#0A1628] underline"
            >
              Reach out anyway
            </a>
            .
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
