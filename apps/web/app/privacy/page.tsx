import { Nav } from '@/components/landing/Nav';
import { Footer } from '@/components/landing/Footer';

export const metadata = {
  title: 'Privacy Policy — PingLoyal',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold text-[#0A1628]">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-gray-600">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <>
      <Nav />
      <section className="bg-[#0A1628] px-6 py-16 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-[#0DC56A]">Legal</p>
          <h1 className="mt-3 text-3xl font-bold text-white lg:text-5xl">Privacy Policy</h1>
          <p className="mt-3 text-sm text-white/50">Last updated: 25 June 2026</p>
        </div>
      </section>
      <main className="bg-white px-6 py-12 lg:px-8">
        <div className="mx-auto max-w-3xl">

          <Section title="1. Who we are">
            <p>
              PingLoyal (&quot;PingLoyal&quot;, &quot;we&quot;, &quot;us&quot;) is a WhatsApp
              loyalty automation platform operated by Bhoyee Global Enterprise, Lagos, Nigeria.
              This policy explains what personal data we collect, why, and what rights you have
              over it — whether you&apos;re a business using PingLoyal (a &quot;tenant&quot;) or
              a customer of one of our tenants.
            </p>
          </Section>

          <Section title="2. Information we collect">
            <p>
              <strong>Account &amp; business information:</strong> business name, owner/staff
              name, email address, phone number, and business address, collected when you
              register and use the dashboard.
            </p>
            <p>
              <strong>Customer information (collected by our tenants):</strong> when a business
              uses PingLoyal, their customers&apos; names and phone numbers are collected — either
              entered manually, imported via CSV, or captured when a customer scans a QR code or
              messages the business&apos;s WhatsApp number. We process this data on behalf of the
              tenant, who controls and is responsible for it.
            </p>
            <p>
              <strong>Payment information:</strong> subscription payments are handled by Paystack
              and/or Stripe. We never see or store full card numbers — only a payment reference
              and the last four digits, where applicable.
            </p>
            <p>
              <strong>Usage data:</strong> log data, device/browser information, and how you
              interact with the dashboard, used to keep the service reliable and improve it.
            </p>
            <p>
              <strong>Cookies and similar technology:</strong> see our{' '}
              <a href="/cookies" className="font-medium text-[#0A1628] underline">
                Cookie Policy
              </a>{' '}
              for details.
            </p>
          </Section>

          <Section title="3. How we use this information">
            <p>
              To provide and maintain the service (sending WhatsApp messages on a tenant&apos;s
              behalf, tracking loyalty points, processing transactions); to process subscription
              payments and prevent fraud; to send transactional emails (verification codes,
              receipts, support replies); to provide customer support; and to improve and secure
              the platform.
            </p>
          </Section>

          <Section title="4. Who we share data with">
            <p>We only share data with service providers who help us run PingLoyal:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <strong>Meta / WhatsApp Business Platform</strong> (via our messaging partner) —
                to deliver WhatsApp messages.
              </li>
              <li>
                <strong>Paystack and Stripe</strong> — to process subscription payments.
              </li>
              <li>
                <strong>Resend</strong> — to deliver transactional emails.
              </li>
              <li>
                <strong>Cloudflare</strong> — to store uploaded files (logos, support
                attachments).
              </li>
            </ul>
            <p>
              We do not sell personal data to third parties, and we only disclose it elsewhere if
              required by law.
            </p>
          </Section>

          <Section title="5. Data retention">
            <p>
              We keep account and customer data for as long as a tenant&apos;s account is active.
              If a tenant deletes their account, we permanently erase their data after the 24-hour
              cancellation grace period shown in the dashboard. We may retain limited records
              where required for tax, accounting, or legal purposes.
            </p>
          </Section>

          <Section title="6. Your rights">
            <p>
              Depending on where you&apos;re located, you may have rights under the Nigeria Data
              Protection Act/Regulation (NDPR/NDPA) or, for EU/UK visitors, the GDPR — including
              the right to access, correct, delete, or export your personal data, and to object to
              certain processing. Tenants can manage and delete their own account data directly
              from the dashboard; customers of a tenant should contact that business directly, or
              reach us at the email below and we&apos;ll route the request.
            </p>
          </Section>

          <Section title="7. Children's privacy">
            <p>
              PingLoyal is intended for business use and is not directed at children. We do not
              knowingly collect personal data from children under 13.
            </p>
          </Section>

          <Section title="8. Security">
            <p>
              We use industry-standard measures — encryption in transit, hashed passwords, and
              access controls — to protect personal data. No system is perfectly secure, but we
              work to keep yours as safe as possible.
            </p>
          </Section>

          <Section title="9. Changes to this policy">
            <p>
              We may update this policy from time to time. Material changes will be announced on
              this page with an updated &quot;last updated&quot; date.
            </p>
          </Section>

          <Section title="10. Contact us">
            <p>
              Questions about this policy or your data? Email{' '}
              <a href="mailto:hello@pingloyal.com" className="font-medium text-[#0A1628] underline">
                hello@pingloyal.com
              </a>{' '}
              or use our{' '}
              <a href="/contact" className="font-medium text-[#0A1628] underline">
                Contact page
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
