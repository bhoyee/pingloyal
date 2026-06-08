import type { ReactNode } from 'react';

interface StepCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function StepCard({ title, subtitle, children }: StepCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 pt-5 pb-4 border-b border-slate-100 sm:px-6 sm:pt-6">
        <h2 className="text-lg font-semibold text-slate-900 sm:text-xl">{title}</h2>
        {subtitle && (
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        )}
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </div>
  );
}
