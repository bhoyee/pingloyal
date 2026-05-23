'use client';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface StepNavigationProps {
  onBack?: () => void;
  onContinue: () => void;
  continueLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  hideBack?: boolean;
}

export function StepNavigation({
  onBack,
  onContinue,
  continueLabel = 'Continue',
  loading = false,
  disabled = false,
  hideBack = false,
}: StepNavigationProps) {
  return (
    <div className="flex items-center justify-between pt-6 mt-6 border-t border-slate-100">
      {!hideBack && onBack ? (
        <Button variant="ghost" size="md" onClick={onBack} type="button">
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
      ) : (
        <div />
      )}
      <Button
        variant="primary"
        size="lg"
        onClick={onContinue}
        loading={loading}
        disabled={disabled}
        type="button"
      >
        {continueLabel}
        {!loading && <ChevronRight className="h-4 w-4" />}
      </Button>
    </div>
  );
}
