'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Nav } from '@/components/landing/Nav';
import { Footer } from '@/components/landing/Footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { publicPost, ApiError } from '@/lib/api';

const contactSchema = z.object({
  name: z.string().min(2, 'Name is too short').max(200),
  email: z.string().email('Enter a valid email address'),
  subject: z.string().min(3, 'Subject is too short').max(200),
  message: z.string().min(10, 'Message is too short').max(4000),
  // Honeypot — left blank by real visitors, hidden from view; a filled-in
  // value tells the backend a bot submitted the form.
  website: z.string().max(255).optional(),
});
type ContactFormValues = z.infer<typeof contactSchema>;

interface ContactResponse {
  message: string;
}

export default function ContactPage() {
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  );

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: '', email: '', subject: '', message: '', website: '' },
  });

  async function onSubmit(values: ContactFormValues) {
    setStatus(null);
    try {
      const res = await publicPost<ContactResponse>('/contact', values);
      setStatus({ type: 'success', message: res.message });
      form.reset();
    } catch (err) {
      setStatus({
        type: 'error',
        message:
          err instanceof ApiError
            ? err.message
            : 'Something went wrong — please try again or email hello@pingloyal.com directly.',
      });
    }
  }

  return (
    <>
      <Nav />
      <main className="bg-white px-6 py-16 lg:px-8">
        <div className="mx-auto max-w-xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-[#0DC56A]">Get in touch</p>
          <h1 className="mt-2 text-3xl font-bold text-[#0A1628] lg:text-4xl">Contact us</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-gray-600">
            Questions about pricing, a feature, or anything else? Send us a message and
            we&apos;ll reply by email — usually within a business day.
          </p>

          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="mt-8 space-y-4 rounded-2xl border border-gray-200 p-6 shadow-sm sm:p-8"
          >
            {/* Honeypot — invisible to real visitors and screen readers,
                left out of normal tab order. Bots that auto-fill every
                field trip this and get silently no-op'd server-side. */}
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="absolute left-[-9999px] top-auto h-0 w-0 overflow-hidden"
              {...form.register('website')}
            />

            <div className="space-y-1.5">
              <Label htmlFor="name">Your name</Label>
              <Input
                id="name"
                {...form.register('name')}
                error={!!form.formState.errors.name}
              />
              {form.formState.errors.name && (
                <p className="text-xs text-red-600">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                {...form.register('email')}
                error={!!form.formState.errors.email}
              />
              {form.formState.errors.email && (
                <p className="text-xs text-red-600">{form.formState.errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                {...form.register('subject')}
                error={!!form.formState.errors.subject}
              />
              {form.formState.errors.subject && (
                <p className="text-xs text-red-600">{form.formState.errors.subject.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                rows={5}
                {...form.register('message')}
                error={!!form.formState.errors.message}
              />
              {form.formState.errors.message && (
                <p className="text-xs text-red-600">{form.formState.errors.message.message}</p>
              )}
            </div>

            {status && (
              <p
                className={`rounded-lg px-3 py-2 text-sm ${
                  status.type === 'success'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-red-50 text-red-600'
                }`}
              >
                {status.message}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              loading={form.formState.isSubmitting}
            >
              Send message
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Prefer email?{' '}
            <a href="mailto:hello@pingloyal.com" className="font-medium text-[#0A1628] underline">
              hello@pingloyal.com
            </a>
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
