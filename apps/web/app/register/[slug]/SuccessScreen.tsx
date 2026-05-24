'use client';

import type { TenantInfo } from '@/lib/api';

interface Props {
  tenantInfo: TenantInfo;
}

export default function SuccessScreen({ tenantInfo }: Props) {
  const isVerified = tenantInfo.waVerificationStatus === 'verified';

  return (
    <div className="text-center space-y-4 py-8">
      <div className="text-5xl">🎉</div>
      <h2 className="text-2xl font-bold text-gray-900">Registration Successful!</h2>
      {isVerified ? (
        <p className="text-gray-600">
          Check WhatsApp for your welcome message from{' '}
          <strong>{tenantInfo.businessName}</strong>!
        </p>
      ) : (
        <p className="text-gray-600">
          You&apos;ve successfully joined{' '}
          <strong>{tenantInfo.businessName}</strong>&apos;s loyalty programme.
        </p>
      )}
      <p className="text-sm text-gray-500">
        Earn {tenantInfo.pointsThreshold} points to redeem a{' '}
        {tenantInfo.currency} {tenantInfo.rewardValue} reward.
      </p>
    </div>
  );
}
