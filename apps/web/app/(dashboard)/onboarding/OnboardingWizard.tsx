'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, type TenantMe } from '@/lib/api';
import { WizardProgress } from '@/components/onboarding/WizardProgress';
import { Spinner } from '@/components/ui/spinner';
import { Step1Mode } from './steps/Step1Mode';
import { Step2Points } from './steps/Step2Points';
import { Step3Tiers } from './steps/Step3Tiers';
import { Step4Whatsapp } from './steps/Step4Whatsapp';
import { Step4bVerification } from './steps/Step4bVerification';
import { Step5aNative } from './steps/Step5aNative';
import { Step5bConnected } from './steps/Step5bConnected';

type WizardStep = 1 | 2 | 3 | 4 | 5;

function readStep(): WizardStep {
  if (typeof window === 'undefined') return 1;
  const raw = localStorage.getItem('onboarding_step');
  const n = Number(raw);
  if (n >= 1 && n <= 5) return n as WizardStep;
  return 1;
}

function writeStep(step: WizardStep | 'complete') {
  localStorage.setItem('onboarding_step', String(step));
}

function readMode(): 'native' | 'connected' {
  if (typeof window === 'undefined') return 'native';
  return (localStorage.getItem('onboarding_mode') as 'native' | 'connected') ?? 'native';
}

function readShowVerification(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('onboarding_show_verification') === 'true';
}

function writeShowVerification(v: boolean) {
  localStorage.setItem('onboarding_show_verification', String(v));
}

export function OnboardingWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<WizardStep>(1);
  const [showVerification, setShowVerification] = useState(false);
  const [verificationPhone, setVerificationPhone] = useState('');
  const [tenant, setTenant] = useState<TenantMe | null>(null);
  const [initialising, setInitialising] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.replace('/login');
      return;
    }

    // A `?step=` param lets users jump back into a specific step (e.g. from
    // Settings to reconnect WhatsApp) even after onboarding is complete.
    const stepParam = Number(searchParams.get('step'));
    const requestedStep =
      stepParam >= 1 && stepParam <= 5 ? (stepParam as WizardStep) : null;

    // Restore local state
    const savedStep = requestedStep ?? readStep();
    const savedVerification = readShowVerification();
    setStep(savedStep);
    setShowVerification(requestedStep ? false : savedVerification);
    if (requestedStep) {
      writeStep(requestedStep);
      writeShowVerification(false);
    }

    // Check server state
    api
      .get<TenantMe>('/tenants/me')
      .then((t) => {
        setTenant(t);

        if (requestedStep) return;

        // Already complete
        if (t.qrCodeUrl) {
          router.replace('/dashboard');
          return;
        }

        // WhatsApp already verified — skip to step 5
        if (
          t.whatsapp.verificationStatus === 'verified' &&
          savedStep < 5
        ) {
          setStep(5);
          writeStep(5);
          setShowVerification(false);
          writeShowVerification(false);
        }
      })
      .catch(() => {
        // If API fails, continue with local state
      })
      .finally(() => setInitialising(false));
  }, [router, searchParams]);

  function goToStep(s: WizardStep) {
    setStep(s);
    writeStep(s);
  }

  if (initialising) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Spinner className="h-8 w-8" />
          <p className="text-sm text-slate-500">Loading your progress…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Logo */}
        <div className="text-center">
          <span className="text-2xl font-bold text-[#0F1E35]">PingLoyal</span>
          <p className="text-sm text-slate-500 mt-1">Business Setup</p>
        </div>

        {/* Progress bar */}
        <WizardProgress currentStep={step} />

        {/* Step content */}
        {step === 1 && (
          <Step1Mode
            onComplete={(mode) => {
              localStorage.setItem('onboarding_mode', mode);
              goToStep(2);
            }}
          />
        )}

        {step === 2 && (
          <Step2Points
            initialValues={
              tenant
                ? {
                    pointsEarnRate: tenant.pointsEarnRate,
                    pointsThreshold: tenant.pointsThreshold,
                    rewardValue: tenant.rewardValue,
                    lapsedDays: tenant.lapsedDays,
                  }
                : undefined
            }
            onComplete={() => goToStep(3)}
            onBack={() => goToStep(1)}
          />
        )}

        {step === 3 && (
          <Step3Tiers
            onComplete={() => goToStep(4)}
            onBack={() => goToStep(2)}
          />
        )}

        {step === 4 && !showVerification && (
          <Step4Whatsapp
            businessName={tenant?.businessName}
            onComplete={(phone) => {
              setVerificationPhone(phone);
              setShowVerification(true);
              writeShowVerification(true);
            }}
            onBack={() => goToStep(3)}
            onSkip={() => goToStep(5)}
          />
        )}

        {step === 4 && showVerification && (
          <Step4bVerification
            phoneNumber={verificationPhone || tenant?.whatsapp.phoneNumber || ''}
            onVerified={() => {
              setShowVerification(false);
              writeShowVerification(false);
              goToStep(5);
            }}
            onChangeDetails={() => {
              setShowVerification(false);
              writeShowVerification(false);
            }}
          />
        )}

        {step === 5 && readMode() === 'native' && (
          <Step5aNative businessName={tenant?.businessName ?? 'Your Store'} />
        )}

        {step === 5 && readMode() === 'connected' && (
          <Step5bConnected tenantSlug={tenant?.slug ?? ''} />
        )}
      </div>
    </div>
  );
}
