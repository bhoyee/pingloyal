import { cn } from '@/lib/utils';
import { type TextareaHTMLAttributes, forwardRef } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition-colors resize-none',
        'focus:outline-none focus:ring-2 focus:ring-[#0F1E35] focus:border-transparent',
        'disabled:cursor-not-allowed disabled:opacity-50',
        error ? 'border-red-500 focus:ring-red-500' : 'border-slate-300',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
