import { ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '../shared/cn';
import type { Tone } from './Badge';

const iconTone: Record<Tone, string> = {
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  neutral: 'bg-surface-2 text-muted',
  primary: 'bg-primary-soft text-primary',
};

interface Props {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  to?: string;
}

export function StatCard({ label, value, hint, icon, tone = 'primary', to }: Props) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="text-[13px] font-medium text-muted">{label}</span>
        {icon && <span className={cn('flex size-9 items-center justify-center rounded-lg [&_svg]:size-[18px]', iconTone[tone])}>{icon}</span>}
      </div>
      <div className="num mt-2 text-3xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-[13px] text-muted">{hint}</div>}
      {to && <ArrowUpRight className="absolute right-4 bottom-4 size-4 text-muted opacity-0 transition-opacity group-hover:opacity-100" />}
    </>
  );
  const cls = 'group relative block rounded-xl border border-border bg-surface p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04)]';
  return to ? (
    <Link to={to} className={cn(cls, 'transition-colors hover:border-primary/40')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
