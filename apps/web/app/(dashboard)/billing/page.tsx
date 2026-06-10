import { CreditCard } from 'lucide-react';
import { ComingSoon } from '@/components/layout/ComingSoon';

export default function BillingPage() {
  return (
    <ComingSoon
      icon={CreditCard}
      title="Billing"
      description="View your subscription plan, manage payment methods, and see your billing history."
    />
  );
}
