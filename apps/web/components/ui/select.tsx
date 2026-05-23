import { cn } from '@/lib/utils';
import { type SelectHTMLAttributes, forwardRef } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-[#0F1E35] focus:border-transparent',
        'disabled:cursor-not-allowed disabled:opacity-50',
        error ? 'border-red-500 focus:ring-red-500' : 'border-slate-300',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';
