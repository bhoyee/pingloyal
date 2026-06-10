'use client';
import { useEffect, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { api, type QrCodeResult, type TenantMe } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

export default function QrRegistrationPage() {
  const [tenant, setTenant] = useState<TenantMe | null>(null);
  const [qr, setQr] = useState<QrCodeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void api.get<TenantMe>('/api/v1/tenants/me').then(setTenant).catch(() => null);
    api
      .get<QrCodeResult>('/api/v1/tenants/qr-code')
      .then(setQr)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Failed to load QR code'),
      )
      .finally(() => setLoading(false));
  }, []);

  function handleDownload() {
    if (!qr) return;
    const a = document.createElement('a');
    a.href = qr.qrCodeUrl;
    a.download = `${(tenant?.businessName ?? 'pingloyal').replace(/\s+/g, '-').toLowerCase()}-qr.png`;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function handlePrint() {
    if (!qr) return;
    const win = window.open('', '_blank');
    if (!win) return;
    const businessName = tenant?.businessName ?? 'PingLoyal';
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
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-xl font-bold text-slate-900">QR Registration</h1>
          <p className="text-sm text-slate-500">
            Print this QR code and place it at every till point. Customers scan
            it to join your loyalty programme.
          </p>
        </div>
      </div>

      <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 py-6 sm:px-6">
        {loading && (
          <div className="flex flex-col items-center gap-3 py-12">
            <Spinner className="h-8 w-8" />
            <p className="text-sm text-slate-500">Loading your QR code…</p>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        {qr && (
          <div className="flex w-full flex-col items-center gap-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col items-center gap-2">
              <div className="rounded-xl border-4 border-[#0F1E35] p-2 shadow-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qr.qrCodeUrl}
                  alt={`QR code for ${tenant?.businessName ?? 'your business'}`}
                  className="h-64 w-64 sm:h-72 sm:w-72"
                />
              </div>
              {tenant && (
                <p className="text-lg font-semibold text-slate-900">{tenant.businessName}</p>
              )}
              <p className="break-all text-center text-xs text-slate-400">
                {qr.registrationUrl}
              </p>
            </div>

            <div className="flex w-full max-w-sm flex-col gap-3 sm:flex-row">
              <Button variant="outline" size="md" onClick={handleDownload} className="flex-1">
                <Download className="h-4 w-4" />
                Download QR
              </Button>
              <Button variant="outline" size="md" onClick={handlePrint} className="flex-1">
                <Printer className="h-4 w-4" />
                Print Guide
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
