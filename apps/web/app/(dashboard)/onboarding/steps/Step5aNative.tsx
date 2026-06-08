'use client';
import { useEffect, useState } from 'react';
import { api, type QrCodeResult } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Download, Printer } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Step5aNativeProps {
  businessName: string;
}

export function Step5aNative({ businessName }: Step5aNativeProps) {
  const router = useRouter();
  const [qr, setQr] = useState<QrCodeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<QrCodeResult>('/tenants/qr-code')
      .then(setQr)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Failed to generate QR code'),
      )
      .finally(() => setLoading(false));
  }, []);

  function handleComplete() {
    localStorage.setItem('onboarding_step', 'complete');
    router.push('/dashboard');
  }

  function handleDownload() {
    if (!qr) return;
    const a = document.createElement('a');
    a.href = qr.qrCodeUrl;
    a.download = `${businessName.replace(/\s+/g, '-').toLowerCase()}-qr.png`;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function handlePrint() {
    if (!qr) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>QR Code — ${businessName}</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 40px; }
            img { width: 300px; height: 300px; margin: 20px auto; display: block; }
            h1 { font-size: 24px; color: #0F1E35; margin: 0; }
            p { color: #555; font-size: 14px; }
            .url { font-size: 11px; color: #888; word-break: break-all; }
            @media print { button { display: none; } }
          </style>
        </head>
        <body>
          <h1>${businessName}</h1>
          <img src="${qr.qrCodeUrl}" alt="QR Code" />
          <p>Scan to join our loyalty programme and earn points!</p>
          <p class="url">${qr.registrationUrl}</p>
          <br/>
          <button onclick="window.print()">Print</button>
        </body>
      </html>
    `);
    win.document.close();
    setTimeout(() => win.print(), 500);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 pt-5 pb-4 border-b border-slate-100 sm:px-6 sm:pt-6">
        <h2 className="text-xl font-semibold text-slate-900 sm:text-2xl">
          You&apos;re ready to go! 🎉
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Print this QR code and place it at every till point. Customers scan
          it to join your loyalty programme.
        </p>
      </div>

      <div className="p-4 flex flex-col items-center gap-6 sm:p-6">
        {loading && (
          <div className="flex flex-col items-center gap-3 py-12">
            <Spinner className="h-8 w-8" />
            <p className="text-sm text-slate-500">Generating your QR code…</p>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        {qr && (
          <>
            <div className="flex flex-col items-center gap-2">
              <div className="rounded-xl border-4 border-[#0F1E35] p-2 shadow-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qr.qrCodeUrl}
                  alt={`QR code for ${businessName}`}
                  className="h-64 w-64 sm:h-72 sm:w-72"
                />
              </div>
              <p className="font-semibold text-slate-900 text-lg">
                {businessName}
              </p>
              <p className="text-xs text-slate-400 break-all text-center">
                {qr.registrationUrl}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
              <Button
                variant="outline"
                size="md"
                onClick={handleDownload}
                className="flex-1"
              >
                <Download className="h-4 w-4" />
                Download QR
              </Button>
              <Button
                variant="outline"
                size="md"
                onClick={handlePrint}
                className="flex-1"
              >
                <Printer className="h-4 w-4" />
                Print Guide
              </Button>
            </div>
          </>
        )}

        {/* Next steps */}
        <div className="w-full rounded-xl bg-slate-50 border border-slate-200 p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Next steps
          </p>
          <ol className="space-y-2">
            {[
              'Print and laminate the QR code poster',
              'Place at every till point in your store',
              'Train cashiers to use the Cashier App on their phone',
              'First customer message fires automatically ✓',
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="h-5 w-5 rounded-full bg-[#0F1E35]/10 text-[#0F1E35] text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>

        <Button
          variant="primary"
          size="lg"
          onClick={handleComplete}
          className="w-full max-w-sm"
        >
          Go to Dashboard →
        </Button>
      </div>
    </div>
  );
}
