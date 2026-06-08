import { notFound } from 'next/navigation';
import { publicGet, ApiError } from '@/lib/api';
import type { TenantInfo } from '@/lib/api';
import RegisterForm from './RegisterForm';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function RegisterPage({ params }: Props) {
  const { slug } = await params;

  let tenantInfo: TenantInfo;
  try {
    tenantInfo = await publicGet<TenantInfo>(`/api/v1/register/${slug}/tenant-info`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-md">
        <RegisterForm slug={slug} tenantInfo={tenantInfo} />
      </div>
    </main>
  );
}
