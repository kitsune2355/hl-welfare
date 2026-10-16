import { AlertCircle, AlertTriangle, CheckCircle2, Info, RotateCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../shared/cn';
import type { Tone } from './Badge';
import { Button } from './Button';

// ----- Alert -----
const alertTone: Partial<Record<Tone, { cls: string; icon: ReactNode }>> = {
  info: { cls: 'border-info/25 bg-info-soft text-info', icon: <Info /> },
  success: { cls: 'border-success/25 bg-success-soft text-success', icon: <CheckCircle2 /> },
  warning: { cls: 'border-warning/25 bg-warning-soft text-warning', icon: <AlertTriangle /> },
  danger: { cls: 'border-danger/25 bg-danger-soft text-danger', icon: <AlertCircle /> },
};

interface AlertProps {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function Alert({ tone = 'info', title, children, action, className }: AlertProps) {
  const t = alertTone[tone]!;
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex items-start gap-3 rounded-xl border px-4 py-3', t.cls, className)}>
      <span className="mt-0.5 [&_svg]:size-[18px]">{t.icon}</span>
      <div className="min-w-0 flex-1 text-[13px] text-fg">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(!!title && 'mt-0.5', 'text-fg/80')}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

// ----- Skeleton -----
export { Skeleton } from './Skeleton';

// ----- EmptyState -----
interface EmptyProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-surface-2 text-muted [&_svg]:size-6">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ----- ErrorState -----
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาด';
  return (
    <Alert
      tone="danger"
      title="โหลดข้อมูลไม่สำเร็จ"
      action={
        onRetry && (
          <Button size="sm" variant="secondary" icon={<RotateCw />} onClick={onRetry}>
            ลองใหม่
          </Button>
        )
      }
    >
      {message}
    </Alert>
  );
}
