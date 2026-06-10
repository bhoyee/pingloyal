import { Settings } from 'lucide-react';
import { ComingSoon } from '@/components/layout/ComingSoon';

export default function SettingsPage() {
  return (
    <ComingSoon
      icon={Settings}
      title="Settings"
      description="Manage your business profile, points and rewards configuration, and account preferences."
    />
  );
}
