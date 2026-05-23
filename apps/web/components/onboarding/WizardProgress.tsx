'use client';
import { Progress } from '@/components/ui/progress';

const STEP_LABELS = [
  'Business Mode',
  'Points Setup',
  'Customer Tiers',
  'WhatsApp',
  'All Done',
];

interface WizardProgressProps {
  currentStep: number;
}

export function WizardProgress({ currentStep }: WizardProgressProps) {
  return (
    <div className="w-full space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-slate-700">
          Step {currentStep} of {STEP_LABELS.length}
        </span>
        <span className="text-slate-500">{STEP_LABELS[currentStep - 1]}</span>
      </div>
      <Progress value={currentStep} max={STEP_LABELS.length} />
      <div className="hidden sm:flex justify-between">
        {STEP_LABELS.map((label, i) => {
          const step = i + 1;
          const done = step < currentStep;
          const active = step === currentStep;
          return (
            <div key={label} className="flex flex-col items-center gap-1">
              <div
                className={`h-2 w-2 rounded-full transition-colors ${
                  done
                    ? 'bg-[#0F1E35]'
                    : active
                      ? 'bg-[#0F1E35] ring-2 ring-[#0F1E35]/30'
                      : 'bg-slate-300'
                }`}
              />
              <span
                className={`text-xs ${active ? 'text-[#0F1E35] font-medium' : 'text-slate-400'}`}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
