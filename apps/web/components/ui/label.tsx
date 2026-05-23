import { cn } from '@/lib/utils';
import { type LabelHTMLAttributes, forwardRef } from 'react';

export const Label = forwardRef<
  HTMLLabelElement,
  LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      'text-sm font-medium text-slate-700 leading-none',
      className,
    )}
    {...props}
  />
));
Label.displayName = 'Label';
