import type { ReactNode } from 'react';
import { cn } from '../shared/cn';

interface Props {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** false = ไม่มี padding ในเนื้อหา (ใช้กับตาราง) */
  padded?: boolean;
}

export function Card({ title, description, actions, icon, children, className, padded = true }: Props) {
  return (
    <section className={cn('overflow-hidden rounded-xl border border-border bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.04)]', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {icon && <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted [&_svg]:size-[18px]">{icon}</span>}
            <div className="min-w-0">
              {title && <h2 className="text-base font-semibold leading-6">{title}</h2>}
              {description && <p className="text-[13px] text-muted">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={padded ? 'p-5' : undefined}>{children}</div>
    </section>
  );
}
