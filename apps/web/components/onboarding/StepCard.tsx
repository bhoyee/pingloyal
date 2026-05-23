import type { ReactNode } from 'react';

interface StepCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function StepCard({ title, subtitle, children }: StepCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-6 pt-6 pb-4 border-b border-slate-100">
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        {subtitle && (
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        )}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}
