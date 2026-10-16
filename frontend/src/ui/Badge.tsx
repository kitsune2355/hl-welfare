import type { ReactNode } from 'react';
import { cn } from '../shared/cn';

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary';

const tones: Record<Tone, string> = {
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  neutral: 'bg-surface-2 text-muted',
  primary: 'bg-primary-soft text-primary',
};

interface Props {
  tone?: Tone;
  dot?: boolean;
  size?: 'sm' | 'lg';
  children: ReactNode;
  className?: string;
}

/** สถานะ = สี + จุด + ข้อความ (ไม่ใช้สีอย่างเดียว) */
export function Badge({ tone = 'neutral', dot = true, size = 'sm', children, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap',
        size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-[13px]',
        tones[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
