'use client';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { StepCard } from '@/components/onboarding/StepCard';
import { StepNavigation } from '@/components/onboarding/StepNavigation';
import { api, type TenantMe } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Info, Link, Sparkles } from 'lucide-react';

type Mode = 'native' | 'connected';

interface Step1ModeProps {
  onComplete: (mode: Mode) => void;
}

const options: {
  mode: Mode;
  icon: React.ReactNode;
  title: string;
  desc: string;
  features: string[];
}[] = [
  {
    mode: 'native',
    icon: <Sparkles className="h-6 w-6" />,
    title: 'Starting Fresh',
    desc: "You don't have a loyalty system yet. PingLoyal handles everything — customer registration, purchase logging, and WhatsApp automation.",
    features: [
      'QR code customer registration',
      'Cashier app for logging purchases',
      'Full loyalty management',
    ],
  },
  {
    mode: 'connected',
    icon: <Link className="h-6 w-6" />,
    title: 'Existing System',
    desc: 'You already have a loyalty or POS system. PingLoyal connects to it and adds WhatsApp automation on top — without disrupting your current workflow.',
    features: [
      'Keep your existing POS system',
      'Webhook or API integration',
      'WhatsApp layer only',
    ],
  },
];

export function Step1Mode({ onComplete }: Step1ModeProps) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Mode>('native');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleContinue() {
    setLoading(true);
    setError('');
    try {
      const updated = await api.patch<TenantMe>('/tenants/settings', { mode: selected });
      queryClient.setQueryData(['tenant-me'], updated);
      localStorage.setItem('onboarding_mode', selected);
      onComplete(selected);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <StepCard
      title="How does your business work?"
      subtitle="This determines how PingLoyal connects to your store."
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {options.map((opt) => {
          const active = selected === opt.mode;
          return (
            <button
              key={opt.mode}
              type="button"
              onClick={() => setSelected(opt.mode)}
              className={cn(
                'relative text-left rounded-xl border-2 p-5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F1E35]',
                active
                  ? 'border-[#0F1E35] bg-slate-50 shadow-md'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
              )}
            >
              {active && (
                <span className="absolute top-3 right-3 h-5 w-5 rounded-full bg-[#0F1E35] flex items-center justify-center">
                  <span className="h-2 w-2 rounded-full bg-white" />
                </span>
              )}
              <div
                className={cn(
                  'inline-flex items-center justify-center h-12 w-12 rounded-xl mb-3',
                  active
                    ? 'bg-[#0F1E35] text-white'
                    : 'bg-slate-100 text-slate-600',
                )}
              >
                {opt.icon}
              </div>
              <h3 className="font-semibold text-slate-900 text-base mb-1">
                {opt.title}
              </h3>
              <p className="text-sm text-slate-500 mb-3">{opt.desc}</p>
              <ul className="space-y-1">
                {opt.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-slate-600">
                    <span className="text-green-500 font-bold">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3">
        <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
        <p className="text-sm text-blue-700">
          Not sure? Start with <strong>Native Mode</strong>. You can connect
          your existing system later from Settings.
        </p>
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-600">{error}</p>
      )}

      <StepNavigation
        onContinue={handleContinue}
        loading={loading}
        hideBack
      />
    </StepCard>
  );
}
