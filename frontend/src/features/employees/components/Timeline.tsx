import type { ISODate } from '../../../domain/types';
import { cn } from '../../../shared/cn';
import { thaiDate } from '../../../shared/format';

export interface TimelineStep {
  label: string;
  date: ISODate | null;
  tone?: 'default' | 'danger' | 'warning';
}

/** เส้นเวลาแนวตั้ง: จุดที่ผ่านมาแล้วเป็นสีทึบ */
export function Timeline({ steps, today }: { steps: TimelineStep[]; today: ISODate }) {
  return (
    <ol className="relative space-y-3 pl-5 before:absolute before:top-1.5 before:bottom-1.5 before:left-[5px] before:w-px before:bg-border">
      {steps.map((s) => {
        const done = !!s.date && s.date <= today;
        const color = s.tone === 'danger' ? 'bg-danger' : s.tone === 'warning' ? 'bg-warning' : 'bg-primary';
        return (
          <li key={s.label} className="relative flex items-center justify-between gap-3 text-[13px]">
            <span
              className={cn('absolute top-1/2 -left-5 size-[11px] -translate-y-1/2 rounded-full border-2', done ? cn(color, 'border-transparent') : 'border-border bg-surface')}
              aria-hidden
            />
            <span className={done ? 'text-fg' : 'text-muted'}>{s.label}</span>
            <span className="num font-medium">{thaiDate(s.date)}</span>
          </li>
        );
      })}
    </ol>
  );
}
