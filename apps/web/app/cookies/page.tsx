import { Nav } from '@/components/landing/Nav';
import { Footer } from '@/components/landing/Footer';
import { ManagePreferencesButton } from './ManagePreferencesButton';

export const metadata = {
  title: 'Cookie Policy — PingLoyal',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold text-[#0A1628]">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-gray-600">{children}</div>
    </section>
  );
}

export default function CookiesPage() {
  return (
    <>
      <Nav />
      <main className="bg-white px-6 py-16 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-[#0DC56A]">Legal</p>
          <h1 className="mt-2 text-3xl font-bold text-[#0A1628] lg:text-4xl">Cookie Policy</h1>
          <p className="mt-3 text-sm text-gray-500">Last updated: 25 June 2026</p>

          <Section title="1. What this covers">
            <p>
              This explains how PingLoyal uses cookies and similar local storage technology on
              our website and dashboard, and how you can manage your preferences.
            </p>
          </Section>

          <Section title="2. Categories we use">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <strong>Strictly necessary:</strong> keeps you signed in to the dashboard or
                cashier app. PingLoyal primarily uses browser local storage (not third-party
                tracking cookies) for this, but it serves the same purpose and is covered by this
                policy. Always active — the Service can&apos;t function without it.
              </li>
              <li>
                <strong>Analytics:</strong> would help us understand how PingLoyal is used, to
                improve the product. <strong>Not currently active</strong> — we don&apos;t run
                any analytics scripts today, but we store your preference so it&apos;s respected
                the moment we do.
              </li>
              <li>
                <strong>Marketing:</strong> would measure ad performance.{' '}
                <strong>Not currently active</strong>, for the same reason as above.
              </li>
            </ul>
          </Section>

          <Section title="3. Managing your preferences">
            <p>
              You chose your cookie preferences the first time you visited PingLoyal. You can
              change your mind at any time:
            </p>
            <ManagePreferencesButton />
          </Section>

          <Section title="4. Changes to this policy">
            <p>
              If we start using analytics or marketing cookies, we&apos;ll update this page and
              the preference toggle above will take effect immediately — nothing new will load
              until you&apos;ve made a choice.
            </p>
          </Section>

          <Section title="5. Contact us">
            <p>
              Questions about cookies? Email{' '}
              <a href="mailto:hello@pingloyal.com" className="font-medium text-[#0A1628] underline">
                hello@pingloyal.com
              </a>
              .
            </p>
          </Section>
        </div>
      </main>
      <Footer />
    </>
  );
}
