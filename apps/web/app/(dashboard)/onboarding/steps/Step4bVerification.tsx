'use client';
import { useEffect, useState, useCallback } from 'react';
import { api, type WaStatus } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { CheckCircle, RotateCcw } from 'lucide-react';

const TOTAL_SECONDS = 10 * 60; // 10 min
const RESEND_AFTER = 90; // show resend after 90s

interface Step4bVerificationProps {
  phoneNumber: string;
  onVerified: () => void;
  onChangeDetails: () => void;
}

export function Step4bVerification({
  phoneNumber,
  onVerified,
  onChangeDetails,
}: Step4bVerificationProps) {
  const [secondsLeft, setSecondsLeft] = useState(TOTAL_SECONDS);
  const [elapsed, setElapsed] = useState(0);
  const [resendMsg, setResendMsg] = useState('');
  const [resending, setResending] = useState(false);
  const [verified, setVerified] = useState(false);

  // Countdown
  useEffect(() => {
    const t = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
      setElapsed((e) => e + 1);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Poll for verification
  const poll = useCallback(async () => {
    try {
      const status = await api.get<WaStatus>('/whatsapp/onboarding/status');
      if (status.verificationStatus === 'verified') {
        setVerified(true);
        setTimeout(onVerified, 1500);
      }
    } catch {
      // silently ignore poll errors
    }
  }, [onVerified]);

  useEffect(() => {
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [poll]);

  async function handleResend() {
    setResending(true);
    setResendMsg('');
    try {
      await api.post('/whatsapp/onboarding/resend', {});
      setResendMsg('Message resent ✓');
      setTimeout(() => setResendMsg(''), 3000);
    } catch (e) {
      setResendMsg(e instanceof Error ? e.message : 'Failed to resend');
    } finally {
      setResending(false);
    }
  }

  const mins = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const secs = String(secondsLeft % 60).padStart(2, '0');

  if (verified) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-10 flex flex-col items-center gap-4">
        <CheckCircle className="h-16 w-16 text-green-500" />
        <h2 className="text-xl font-semibold text-green-800">
          WhatsApp Connected!
        </h2>
        <p className="text-sm text-green-700">Moving to the next step…</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-6 pt-6 pb-4 border-b border-slate-100">
        <h2 className="text-xl font-semibold text-slate-900">
          Check your WhatsApp
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          We sent a verification message to{' '}
          <strong className="text-slate-700">{phoneNumber}</strong>. Open
          WhatsApp and reply YES to complete the connection.
        </p>
      </div>

      <div className="p-6 flex flex-col items-center gap-6">
        {/* WhatsApp icon with pulsing glow */}
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-green-400/30 animate-ping" />
          <div className="relative h-20 w-20 rounded-full bg-green-500 flex items-center justify-center shadow-lg">
            <span className="text-white text-4xl">💬</span>
          </div>
        </div>

        {/* Fake WhatsApp conversation mockup */}
        <div className="w-full max-w-xs rounded-xl bg-[#e5ddd5] p-3 space-y-2">
          <p className="text-[10px] text-center text-slate-500 uppercase font-semibold tracking-wide">
            WhatsApp
          </p>
          {/* Incoming message */}
          <div className="flex justify-start">
            <div className="bg-white rounded-2xl rounded-tl-sm px-3 py-2 max-w-[85%] shadow-sm">
              <p className="text-xs font-semibold text-green-700 mb-0.5">
                PingLoyal
              </p>
              <p className="text-sm text-slate-800">
                Hi! Please reply{' '}
                <strong className="text-green-700">YES</strong> to confirm your
                WhatsApp Business number.
              </p>
              <p className="text-[10px] text-slate-400 text-right mt-1">
                Just now
              </p>
            </div>
          </div>
          {/* Outgoing reply */}
          <div className="flex justify-end">
            <div className="bg-[#dcf8c6] rounded-2xl rounded-tr-sm px-3 py-2 max-w-[40%] shadow-sm">
              <p className="text-sm text-slate-800 font-semibold">YES</p>
              <p className="text-[10px] text-slate-400 text-right mt-1">✓✓</p>
            </div>
          </div>
        </div>

        {/* Status + countdown */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <Spinner className="h-4 w-4 text-slate-400" />
            <p className="text-sm text-slate-500">
              Waiting for your reply…
            </p>
          </div>
          <p className="text-sm font-mono text-slate-600">
            {mins}:{secs} remaining
          </p>
        </div>

        {/* Resend */}
        {elapsed >= RESEND_AFTER && (
          <div className="flex flex-col items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={handleResend}
              loading={resending}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Resend message
            </Button>
            {resendMsg && (
              <p className="text-xs text-green-600">{resendMsg}</p>
            )}
          </div>
        )}

        {/* Change details link */}
        <button
          type="button"
          onClick={onChangeDetails}
          className="text-sm text-slate-500 hover:text-slate-700 underline"
        >
          ← Change details
        </button>
      </div>
    </div>
  );
}
