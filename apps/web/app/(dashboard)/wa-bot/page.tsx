import { Bot } from 'lucide-react';
import { ComingSoon } from '@/components/layout/ComingSoon';

export default function WaBotPage() {
  return (
    <ComingSoon
      icon={Bot}
      title="WA Bot"
      description="Configure your WhatsApp bot's automated replies and conversation flows for customer enquiries."
    />
  );
}
