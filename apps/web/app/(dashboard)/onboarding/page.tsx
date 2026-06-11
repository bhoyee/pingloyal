import { Suspense } from 'react';
import { OnboardingWizard } from './OnboardingWizard';

export const metadata = {
  title: 'Set up your account — PingLoyal',
};

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingWizard />
    </Suspense>
  );
}
