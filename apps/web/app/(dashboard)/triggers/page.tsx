import { Zap } from 'lucide-react';
import { ComingSoon } from '@/components/layout/ComingSoon';

export default function TriggersPage() {
  return (
    <ComingSoon
      icon={Zap}
      title="Triggers"
      description="Configure automated WhatsApp triggers — welcome messages, threshold nudges, birthdays, and win-back campaigns — all in one place."
    />
  );
}
