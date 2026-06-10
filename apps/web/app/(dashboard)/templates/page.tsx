import { FileText } from 'lucide-react';
import { ComingSoon } from '@/components/layout/ComingSoon';

export default function TemplatesPage() {
  return (
    <ComingSoon
      icon={FileText}
      title="Templates"
      description="Browse and manage your approved WhatsApp message templates used in campaigns and triggers."
    />
  );
}
