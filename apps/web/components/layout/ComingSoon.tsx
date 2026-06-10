import type { LucideIcon } from 'lucide-react';

interface ComingSoonProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function ComingSoon({ icon: Icon, title, description }: ComingSoonProps) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        </div>
      </div>

      <div className="mx-auto flex max-w-5xl flex-col items-center justify-center gap-3 px-4 py-24 text-center sm:px-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
          <Icon size={28} className="text-slate-400" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900">Coming soon</h2>
        <p className="max-w-sm text-sm text-slate-500">{description}</p>
      </div>
    </div>
  );
}
