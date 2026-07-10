'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { staffApi, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

export default function NewStaffPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'super_admin' | 'support_agent'>('support_agent');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('staff_role') !== 'super_admin') {
      router.replace('/staff');
    }
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await staffApi.post('/staff/accounts', { fullName, email, password, role });
      router.replace('/staff/team');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create staff account');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="px-4 py-6 sm:px-6">
      <h1 className="mb-4 text-xl font-bold text-slate-900">New staff account</h1>

      <form onSubmit={(e) => void handleSubmit(e)} className="max-w-md space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="fullName">Full name</Label>
          <Input
            id="fullName"
            required
            minLength={2}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="role">Role</Label>
          <Select
            id="role"
            value={role}
            onChange={(e) => setRole(e.target.value as 'super_admin' | 'support_agent')}
          >
            <option value="support_agent">Support Agent</option>
            <option value="super_admin">Super Admin</option>
          </Select>
        </div>

        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

        <Button type="submit" loading={isSubmitting}>
          Create staff account
        </Button>
      </form>
    </div>
  );
}
