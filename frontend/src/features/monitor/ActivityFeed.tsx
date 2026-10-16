import { Ban, Building2, Pencil, Plus, Shirt, ShieldPlus, Trash2, User } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { ActivityAction, ActivityEntity, ActivityLog } from '../../domain/types';
import { cn } from '../../shared/cn';
import { timeAgo } from '../../shared/format';
import { ACTIVITY_ENTITY_LABEL } from '../../shared/labels';
import { EmptyState, Skeleton } from '../../ui';

const ENTITY_ICON: Record<ActivityEntity, ReactNode> = {
  EMPLOYEE: <User />,
  SITE: <Building2 />,
  INSURANCE_BATCH: <ShieldPlus />,
  UNIFORM_ISSUE: <Shirt />,
};

const ACTION: Record<ActivityAction, { icon: ReactNode; cls: string; label: string }> = {
  CREATE: { icon: <Plus />, cls: 'bg-success-soft text-success', label: 'สร้าง' },
  UPDATE: { icon: <Pencil />, cls: 'bg-info-soft text-info', label: 'แก้ไข' },
  DELETE: { icon: <Trash2 />, cls: 'bg-danger-soft text-danger', label: 'ลบ' },
  CANCEL: { icon: <Ban />, cls: 'bg-warning-soft text-warning', label: 'ยกเลิก' },
};

/** ไทม์ไลน์บันทึกกิจกรรม — ใช้ในศูนย์ติดตามงานและหน้ารายละเอียดพนักงาน */
export function ActivityFeed({ items, loading, showEmployeeLink = true }: { items: ActivityLog[] | undefined; loading?: boolean; showEmployeeLink?: boolean }) {
  if (loading && !items) {
    return (
      <div className="space-y-4 p-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (!items?.length) return <EmptyState title="ยังไม่มีกิจกรรม" description="การเพิ่ม/แก้ไข/ลบข้อมูลทุกครั้งจะแสดงที่นี่" />;

  return (
    <ol className="relative px-5 py-4">
      {items.map((a, i) => {
        const act = ACTION[a.action];
        return (
          <li key={a.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < items.length - 1 && <span className="absolute top-8 bottom-0 left-4 w-px bg-border" aria-hidden />}
            <span className={cn('relative z-[1] flex size-8 shrink-0 items-center justify-center rounded-full [&_svg]:size-3.5', act.cls)} title={act.label}>
              {act.icon}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-[13px] leading-snug">
                {showEmployeeLink && a.employeeId ? (
                  <Link to={`/employees/${a.employeeId}`} className="hover:text-primary hover:underline">
                    {a.summary}
                  </Link>
                ) : (
                  a.summary
                )}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                <span className="inline-flex items-center gap-1 [&_svg]:size-3">
                  {ENTITY_ICON[a.entity]}
                  {ACTIVITY_ENTITY_LABEL[a.entity]}
                </span>
                <span>·</span>
                <span>{a.user}</span>
                <span>·</span>
                <time dateTime={a.at} title={a.at.replace('T', ' ')}>
                  {timeAgo(a.at)}
                </time>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
