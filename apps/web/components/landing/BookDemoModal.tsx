'use client';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { publicPost, ApiError } from '@/lib/api';

const demoRequestSchema = z.object({
  fullName: z.string().min(2, 'Name is too short').max(200),
  email: z.string().email('Enter a valid email address'),
  companyName: z.string().min(2, 'Company name is too short').max(200),
  // Honeypot — left blank by real visitors, hidden from view.
  website: z.string().max(255).optional(),
});
type DemoRequestFormValues = z.infer<typeof demoRequestSchema>;

interface DemoRequestResponse {
  message: string;
}

interface BookDemoButtonProps {
  className?: string;
  children?: React.ReactNode;
}

export function BookDemoButton({ className, children }: BookDemoButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children ?? 'Book a demo'}
      </button>
      {open && <BookDemoModal onClose={() => setOpen(false)} />}
    </>
  );
}

function BookDemoModal({ onClose }: { onClose: () => void }) {
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<DemoRequestFormValues>({
    resolver: zodResolver(demoRequestSchema),
    defaultValues: { fullName: '', email: '', companyName: '', website: '' },
  });

  async function onSubmit(values: DemoRequestFormValues) {
    setError(null);
    try {
      const res = await publicPost<DemoRequestResponse>('/demo-requests', values);
      setSuccess(res.message);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Something went wrong — please try again or email hello@pingloyal.com directly.',
      );
    }
  }

  // Portaled to <body> — the trigger button can sit inside inline text
  // (e.g. a <p>), and a fixed-position overlay <div> can't legally nest
  // inside that without breaking HTML structure.
  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-[#0A1628]/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-[#0A1628]">Book a demo</h2>
            <p className="mt-1 text-sm text-gray-500">
              {success
                ? ''
                : "Tell us a bit about your business and we'll set up a time to walk you through PingLoyal."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-[#0A1628]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {success ? (
          <div className="mt-6">
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {success}
            </p>
            <Button type="button" className="mt-4 w-full" onClick={onClose}>
              Close
            </Button>
          </div>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-4">
            {/* Honeypot — see app/contact/page.tsx for the full rationale. */}
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="absolute left-[-9999px] top-auto h-0 w-0 overflow-hidden"
              {...form.register('website')}
            />

            <div className="space-y-1.5">
              <Label htmlFor="demo-fullName">Full name</Label>
              <Input
                id="demo-fullName"
                {...form.register('fullName')}
                error={!!form.formState.errors.fullName}
              />
              {form.formState.errors.fullName && (
                <p className="text-xs text-red-600">{form.formState.errors.fullName.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="demo-email">Email address</Label>
              <Input
                id="demo-email"
                type="email"
                {...form.register('email')}
                error={!!form.formState.errors.email}
              />
              {form.formState.errors.email && (
                <p className="text-xs text-red-600">{form.formState.errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="demo-companyName">Company name</Label>
              <Input
                id="demo-companyName"
                {...form.register('companyName')}
                error={!!form.formState.errors.companyName}
              />
              {form.formState.errors.companyName && (
                <p className="text-xs text-red-600">
                  {form.formState.errors.companyName.message}
                </p>
              )}
            </div>

            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

            <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
              Request a demo
            </Button>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
