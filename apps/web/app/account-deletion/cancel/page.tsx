'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { publicPost, ApiError } from '@/lib/api';

interface CancelResponse {
  businessName: string;
}

type Status = 'loading' | 'success' | 'error';

export default function CancelAccountDeletionPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<Status>('loading');
  const [businessName, setBusinessName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError('Missing cancellation link — please use the link from your email.');
      return;
    }
    publicPost<CancelResponse>('/api/v1/tenants/delete-request/cancel', { token })
      .then((res) => {
        setBusinessName(res.businessName);
        setStatus('success');
      })
      .catch((err: unknown) => {
        setStatus('error');
        setError(
          err instanceof ApiError
            ? err.message
            : 'Something went wrong. Please try again.',
        );
      });
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex items-center justify-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0A1628]">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
              <path
                d="M18 2H4C2.9 2 2 2.9 2 4v10c0 1.1.9 2 2 2h4l3 3 3-3h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"
                stroke="rgba(255,255,255,0.65)"
                strokeWidth="1.5"
                fill="none"
              />
              <path
                d="M7 11l2.5 2.5 5.5-5.5"
                stroke="#0DC56A"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span className="text-xl font-bold text-[#0A1628]">PingLoyal</span>
        </div>

        {status === 'loading' && (
          <p className="text-sm text-slate-500">Cancelling deletion…</p>
        )}

        {status === 'success' && (
          <>
            <h1 className="text-lg font-semibold text-slate-900">Deletion cancelled</h1>
            <p className="mt-2 text-sm text-slate-500">
              <span className="font-medium text-slate-700">{businessName}</span> will not be
              deleted. You can sign back in right away.
            </p>
            <a
              href="/login"
              className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg bg-[#0F1E35] text-sm font-semibold text-white hover:bg-[#1a3050]"
            >
              Back to sign in
            </a>
          </>
        )}

        {status === 'error' && (
          <>
            <h1 className="text-lg font-semibold text-red-700">Couldn't cancel deletion</h1>
            <p role="alert" className="mt-2 text-sm text-slate-500">
              {error}
            </p>
            <a
              href="/login"
              className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-900 hover:bg-slate-50"
            >
              Back to sign in
            </a>
          </>
        )}
      </div>
    </div>
  );
}

