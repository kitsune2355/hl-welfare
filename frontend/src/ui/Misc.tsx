import { ChevronRight } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '../shared/cn';

// ===================== PageHeader =====================
interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: { label: string; to?: string }[];
}

export function PageHeader({ title, description, actions, breadcrumbs }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {breadcrumbs && (
          <nav aria-label="breadcrumb" className="mb-1.5 flex items-center gap-1 text-[13px] text-muted">
            {breadcrumbs.map((b, i) => (
              <Fragment key={i}>
                {i > 0 && <ChevronRight className="size-3.5" />}
                {b.to ? (
                  <Link to={b.to} className="hover:text-fg">
                    {b.label}
                  </Link>
                ) : (
                  <span className="text-fg">{b.label}</span>
                )}
              </Fragment>
            ))}
          </nav>
        )}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ===================== Avatar =====================
const PALETTE = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const initial = [...name.trim()].find((c) => /[\p{L}]/u.test(c) && !/[ะ-๎]/.test(c)) ?? '?';
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white',
        size === 'sm' ? 'size-7 text-xs' : size === 'md' ? 'size-9 text-sm' : 'size-14 text-xl',
      )}
      style={{ background: PALETTE[h % PALETTE.length] }}
    >
      {initial}
    </span>
  );
}

// ===================== Switch =====================
interface SwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50', checked ? 'bg-success' : 'bg-border')}
    >
      <span className={cn('inline-block size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
    </button>
  );
}

// ===================== Tabs =====================
interface TabsProps<V extends string> {
  items: { value: V; label: string; count?: number }[];
  value: V;
  onChange: (v: V) => void;
}

export function Tabs<V extends string>({ items, value, onChange }: TabsProps<V>) {
  return (
    <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto border-b border-border">
      {items.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              '-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
              active ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-fg',
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={cn('num rounded-full px-1.5 text-xs', active ? 'bg-primary-soft' : 'bg-surface-2')}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ===================== Progress =====================
export function Progress({ value, tone = 'primary' }: { value: number; tone?: 'primary' | 'success' | 'warning' }) {
  const bar = { primary: 'bg-primary', success: 'bg-success', warning: 'bg-warning' }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn('h-full rounded-full transition-[width]', bar)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

// ===================== DescriptionList =====================
export function InfoList({ items, cols = 2 }: { items: { label: string; value: ReactNode }[]; cols?: 2 | 3 | 4 }) {
  const grid = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }[cols];
  return (
    <dl className={cn('grid gap-x-6 gap-y-4', grid)}>
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-xs text-muted">{i.label}</dt>
          <dd className="mt-0.5 truncate font-medium">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
