'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ConfirmationScreen, {
  type ConfirmationData,
} from '../transaction/ConfirmationScreen';

export default function ConfirmationPage() {
  const router = useRouter();
  const [data, setData] = useState<ConfirmationData | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem('cashier_last_transaction');
    if (!raw) {
      router.replace('/cashier');
      return;
    }
    try {
      setData(JSON.parse(raw) as ConfirmationData);
    } catch {
      router.replace('/cashier');
    }
  }, [router]);

  if (!data) return null;

  return <ConfirmationScreen data={data} />;
}
