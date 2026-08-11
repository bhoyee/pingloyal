import { Nav } from '@/components/landing/Nav';
import { Footer } from '@/components/landing/Footer';

export const metadata = {
  title: 'Terms of Service — PingLoyal',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold text-[#0A1628]">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-gray-600">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <>
      <Nav />
      <section className="bg-[#0A1628] px-6 py-16 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-[#0DC56A]">Legal</p>
          <h1 className="mt-3 text-3xl font-bold text-white lg:text-5xl">Terms of Service</h1>
          <p className="mt-3 text-sm text-white/50">Last updated: 25 June 2026</p>
        </div>
      </section>
      <main className="bg-white px-6 py-12 lg:px-8">
        <div className="mx-auto max-w-3xl">

          <Section title="1. Acceptance of these terms">
            <p>
              By creating a PingLoyal account or using the dashboard, cashier app, or any related
              service (together, the &quot;Service&quot;), you agree to these Terms of Service. If
              you don&apos;t agree, please don&apos;t use the Service.
            </p>
          </Section>

          <Section title="2. The Service">
            <p>
              PingLoyal is a WhatsApp-based customer loyalty platform for retail businesses. It
              lets a business (&quot;tenant&quot;) register customers, award and track loyalty
              points, send WhatsApp campaigns and automated messages, and manage their loyalty
              programme from a dashboard.
            </p>
          </Section>

          <Section title="3. Accounts and eligibility">
            <p>
              You must be at least 18 and have the authority to act on behalf of the business you
              register. You&apos;re responsible for the accuracy of the information you provide
              and for keeping your login credentials secure.
            </p>
          </Section>

          <Section title="4. Subscriptions, trials, and billing">
            <p>
              New accounts start on a 14-day free trial. A valid payment card is required to
              start a trial. If you don&apos;t cancel before the trial ends, we will
              automatically charge your card for your selected plan; if a charge fails, we&apos;ll
              retry it and may suspend access until payment succeeds. You can change plans or
              cancel anytime from the Billing page in your dashboard — cancelling stops future
              charges but doesn&apos;t refund amounts already billed for the current period.
            </p>
          </Section>

          <Section title="5. Your data and customer data">
            <p>
              You own the data you and your customers provide. We process it solely to operate
              the Service on your behalf, as described in our{' '}
              <a href="/privacy" className="font-medium text-[#0A1628] underline">
                Privacy Policy
              </a>
              . You&apos;re responsible for having a lawful basis to message your customers on
              WhatsApp — including obtaining their consent where required — and for the accuracy
              of any data you upload.
            </p>
          </Section>

          <Section title="6. Acceptable use">
            <p>You agree not to use the Service to:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Send unsolicited messages or spam, or message anyone who hasn&apos;t opted in.</li>
              <li>Violate WhatsApp&apos;s/Meta&apos;s Business Messaging Policy or any applicable law.</li>
              <li>Upload unlawful, fraudulent, or harmful content.</li>
              <li>Attempt to disrupt, reverse-engineer, or gain unauthorised access to the Service.</li>
            </ul>
            <p>
              We may suspend or terminate accounts that violate this section, including to comply
              with WhatsApp/Meta platform requirements.
            </p>
          </Section>

          <Section title="7. Intellectual property">
            <p>
              PingLoyal and its branding, software, and design are our property or licensed to us.
              These Terms don&apos;t grant you any rights to our intellectual property beyond what
              is reasonably needed to use the Service.
            </p>
          </Section>

          <Section title="8. Cancellation and deletion">
            <p>
              You can request account deletion at any time from the dashboard. Deletion is
              scheduled with a 24-hour grace period during which you can cancel the request;
              after that, your data is permanently and irreversibly deleted.
            </p>
          </Section>

          <Section title="9. Disclaimer and limitation of liability">
            <p>
              The Service is provided &quot;as is&quot; without warranties of any kind. To the
              fullest extent permitted by law, PingLoyal and Bhoyee Global Enterprise are not
              liable for indirect, incidental, or consequential damages arising from your use of
              the Service, including message delivery delays or failures caused by third-party
              platforms (such as WhatsApp/Meta, Paystack, or Stripe) that are outside our control.
            </p>
          </Section>

          <Section title="10. Governing law">
            <p>
              These Terms are governed by the laws of the Federal Republic of Nigeria, without
              regard to conflict-of-law principles.
            </p>
          </Section>

          <Section title="11. Changes to these terms">
            <p>
              We may update these Terms from time to time. Continuing to use the Service after a
              change means you accept the updated Terms.
            </p>
          </Section>

          <Section title="12. Contact us">
            <p>
              Questions about these Terms? Email{' '}
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
