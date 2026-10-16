import { Activity, AlertOctagon, ArrowRight, CircleCheck, ClipboardList, Eye, ListTodo, RefreshCw, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useApi } from '../../app/ApiContext';
import { todayISO } from '../../domain/date';
import type { ActivityEntity, MonitorTask, TaskKind, TaskSeverity } from '../../domain/types';
import { cn } from '../../shared/cn';
import { clock, thaiDate } from '../../shared/format';
import { useAsync } from '../../shared/hooks/useAsync';
import { ACTIVITY_ENTITY_LABEL, SEVERITY_LABEL, SEVERITY_TONE, TASK_KIND_LABEL } from '../../shared/labels';
import { Badge, Button, ButtonLink, Card, Combobox, EmptyState, ErrorState, Input, PageHeader, Skeleton, StatCard, Switch, Table } from '../../ui';
import { EmployeeCell } from '../common';
import { ActivityFeed } from './ActivityFeed';

const REFRESH_MS = 60_000;
const AUTO_KEY = 'hl-monitor-auto';

/** ลิงก์ไปหน้าที่ใช้แก้งานนั้น */
function taskLink(t: MonitorTask): { to: string; label: string } {
  switch (t.kind) {
    case 'INSURANCE_URGENT':
    case 'INSURANCE_IN':
    case 'INSURANCE_OUT':
      return { to: '/insurance', label: 'ไปส่งแจ้ง' };
    case 'UNIFORM_ISSUE':
      return { to: '/uniform', label: 'ไปแจกชุด' };
    case 'PROBATION_MISSING':
      return { to: `/employees/${t.employee.id}/edit`, label: 'บันทึกข้อมูล' };
    case 'UNIFORM_RULE_MISSING':
      return { to: `/employees/${t.employee.id}`, label: 'ดูพนักงาน' };
  }
}

function readAuto() {
  try {
    return localStorage.getItem(AUTO_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function MonitorPage() {
  const { api } = useApi();
  const today = todayISO();
  const [params, setParams] = useSearchParams();
  const severity = (params.get('severity') ?? '') as TaskSeverity | '';
  const kind = (params.get('kind') ?? '') as TaskKind | '';
  const [q, setQ] = useState('');
  const [entity, setEntity] = useState<ActivityEntity | ''>('');
  const [limit, setLimit] = useState(20);
  const [auto, setAuto] = useState(readAuto);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const tasks = useAsync(() => api.getWorkQueue(), [api]);
  const activity = useAsync(() => api.listActivity({ entity: entity || undefined, limit }), [api, entity, limit]);

  const { reload: reloadTasks } = tasks;
  const { reload: reloadActivity } = activity;
  const refresh = useCallback(() => {
    reloadTasks();
    reloadActivity();
  }, [reloadTasks, reloadActivity]);

  useEffect(() => {
    if (tasks.data) setUpdatedAt(new Date());
  }, [tasks.data]);

  // รีเฟรชอัตโนมัติทุก 60 วินาที + เมื่อกลับมาที่แท็บนี้
  useEffect(() => {
    if (!auto) return;
    const id = setInterval(refresh, REFRESH_MS);
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [auto, refresh]);

  const toggleAuto = (v: boolean) => {
    setAuto(v);
    try {
      localStorage.setItem(AUTO_KEY, v ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  };

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value && next.get(key) !== value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const all = useMemo(() => tasks.data ?? [], [tasks.data]);
  const count = (s: TaskSeverity) => all.filter((t) => t.severity === s).length;
  const kindCounts = useMemo(() => {
    const m = new Map<TaskKind, number>();
    for (const t of all) if (!severity || t.severity === severity) m.set(t.kind, (m.get(t.kind) ?? 0) + 1);
    return m;
  }, [all, severity]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return all.filter(
      (t) =>
        (!severity || t.severity === severity) &&
        (!kind || t.kind === kind) &&
        (!term || `${t.employee.empCode} ${t.employee.firstName} ${t.employee.lastName} ${t.title}`.toLowerCase().includes(term)),
    );
  }, [all, severity, kind, q]);

  const todayCount = activity.data?.filter((a) => a.at.startsWith(today)).length ?? 0;

  if (tasks.error) return <ErrorState error={tasks.error} onRetry={refresh} />;

  return (
    <>
      <PageHeader
        title="ศูนย์ติดตามงาน"
        description="ทุกเรื่องที่ต้องทำและทุกการเปลี่ยนแปลงในระบบ — อยู่ในหน้าเดียว"
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-2 text-xs text-muted">
              <span className={cn('size-2 rounded-full', auto ? 'animate-pulse bg-success' : 'bg-border')} aria-hidden />
              {updatedAt ? `อัปเดต ${clock(updatedAt)}` : 'กำลังโหลด…'}
            </span>
            <label className="flex items-center gap-2 text-[13px]">
              <Switch label="รีเฟรชอัตโนมัติ" checked={auto} onChange={toggleAuto} />
              <span className="max-sm:hidden">อัตโนมัติ (60 วิ)</span>
            </label>
            <Button size="sm" icon={<RefreshCw className={cn(tasks.loading && 'animate-spin')} />} onClick={refresh} disabled={tasks.loading}>
              รีเฟรช
            </Button>
          </div>
        }
      />

      {/* ----- สรุปตามความเร่งด่วน (คลิกเพื่อกรอง) ----- */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {!tasks.data ? (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[124px] rounded-xl" />)
        ) : (
          <>
            {(
              [
                ['critical', <AlertOctagon key="c" />, 'เลยกำหนด / ต้องทำทันที'],
                ['warning', <ListTodo key="w" />, 'ครบกำหนดภายใน 7 วัน'],
                ['info', <Eye key="i" />, 'รอรอบถัดไป / รอยืนยัน'],
              ] as const
            ).map(([s, icon, hint]) => (
              <button key={s} type="button" onClick={() => setFilter('severity', s)} className={cn('rounded-xl text-left transition-shadow', severity === s && 'ring-2 ring-primary')}>
                <StatCard label={SEVERITY_LABEL[s]} value={count(s)} hint={hint} icon={icon} tone={count(s) ? SEVERITY_TONE[s] : 'success'} />
              </button>
            ))}
            <StatCard label="กิจกรรมวันนี้" value={todayCount} hint="เพิ่ม / แก้ไข / ลบ / ส่งแจ้ง" icon={<Activity />} tone="primary" />
          </>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* ----- คิวงาน ----- */}
        <Card
          className="xl:col-span-2"
          padded={false}
          icon={<ClipboardList />}
          title={
            <span className="flex items-center gap-2">
              คิวงาน
              {tasks.data && <Badge tone={shown.length ? 'warning' : 'success'}>{shown.length} รายการ</Badge>}
            </span>
          }
          description="เรียงตามความเร่งด่วน แล้วตามจำนวนวันที่เลยกำหนด"
        >
          <div className="space-y-3 border-b border-border p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาพนักงาน หรือ ชื่องาน" aria-label="ค้นหางาน" className="pl-9" />
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="กรองตามประเภทงาน">
              <button
                type="button"
                onClick={() => setFilter('kind', '')}
                className={cn('rounded-full border px-3 py-1 text-xs transition-colors', !kind ? 'border-primary bg-primary-soft font-medium text-primary' : 'border-border text-muted hover:text-fg')}
              >
                ทั้งหมด
              </button>
              {(Object.keys(TASK_KIND_LABEL) as TaskKind[]).map((k) => {
                const n = kindCounts.get(k) ?? 0;
                if (!n && kind !== k) return null;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setFilter('kind', k)}
                    className={cn('rounded-full border px-3 py-1 text-xs transition-colors', kind === k ? 'border-primary bg-primary-soft font-medium text-primary' : 'border-border text-muted hover:text-fg')}
                  >
                    {TASK_KIND_LABEL[k]} <span className="num ml-0.5 opacity-70">{n}</span>
                  </button>
                );
              })}
              {(severity || kind) && (
                <button type="button" onClick={() => setParams({}, { replace: true })} className="px-2 text-xs text-primary hover:underline">
                  ล้างตัวกรอง
                </button>
              )}
            </div>
          </div>

          <Table<MonitorTask>
            loading={tasks.loading}
            rows={tasks.data ? shown : undefined}
            rowKey={(t) => t.id}
            pageSize={15}
            columns={[
              { key: 'sev', header: 'ระดับ', mobile: 'aside', className: 'w-24', cell: (t) => <Badge tone={SEVERITY_TONE[t.severity]}>{SEVERITY_LABEL[t.severity]}</Badge> },
              {
                key: 'task',
                header: 'งาน',
                mobile: 'title',
                cell: (t) => (
                  <div className="leading-tight">
                    <p className="font-medium">{t.title}</p>
                    <p className="max-w-72 truncate text-xs text-muted">{t.detail}</p>
                  </div>
                ),
              },
              { key: 'emp', header: 'พนักงาน', cell: (t) => <EmployeeCell e={t.employee} link /> },
              {
                key: 'due',
                header: 'กำหนด',
                cell: (t) =>
                  t.dueDate ? (
                    <div className="leading-tight">
                      <p className="num">{thaiDate(t.dueDate)}</p>
                      {t.overdueDays > 0 ? <p className="text-xs font-medium text-danger">เลยมา {t.overdueDays} วัน</p> : <p className="text-xs text-muted">ยังไม่ถึง</p>}
                    </div>
                  ) : (
                    <span className="text-muted">–</span>
                  ),
              },
              {
                key: 'go',
                header: '',
                align: 'right',
                cell: (t) => {
                  const l = taskLink(t);
                  return (
                    <ButtonLink to={l.to} size="sm" variant={t.severity === 'critical' ? 'primary' : 'secondary'} icon={<ArrowRight className="size-3.5" />}>
                      {l.label}
                    </ButtonLink>
                  );
                },
              },
            ]}
            empty={<EmptyState icon={<CircleCheck />} title={all.length ? 'ไม่มีงานตามตัวกรองนี้' : 'ไม่มีงานค้าง 🎉'} description={all.length ? 'ลองล้างตัวกรอง' : 'ทุกอย่างเรียบร้อยดี'} />}
          />
        </Card>

        {/* ----- บันทึกกิจกรรม ----- */}
        <Card
          padded={false}
          className="self-start"
          icon={<Activity />}
          title="บันทึกกิจกรรม"
          description="ใคร ทำอะไร เมื่อไร"
          actions={
            <Combobox
              size="sm"
              aria-label="กรองกิจกรรม"
              clearable
              placeholder="ทุกประเภท"
              value={entity}
              onChange={(v) => {
                setEntity(v as ActivityEntity | '');
                setLimit(20);
              }}
              options={Object.entries(ACTIVITY_ENTITY_LABEL).map(([value, label]) => ({ value, label }))}
              className="w-36"
            />
          }
        >
          <div className="max-h-[640px] overflow-y-auto">
            <ActivityFeed items={activity.data} loading={activity.loading} />
          </div>
          {activity.data && activity.data.length >= limit && (
            <div className="border-t border-border p-3 text-center">
              <Button size="sm" variant="ghost" onClick={() => setLimit((l) => l + 20)} loading={activity.loading}>
                โหลดเพิ่ม
              </Button>
            </div>
          )}
          {activity.error ? <p className="p-4 text-xs text-danger">โหลดบันทึกกิจกรรมไม่สำเร็จ</p> : null}
        </Card>
      </div>

      <p className="mt-6 text-center text-xs text-muted">
        คิวงานคำนวณจากกฎสวัสดิการแบบสด ·{' '}
        <Link to="/rules" className="text-primary hover:underline">
          ดูเงื่อนไข
        </Link>
      </p>
    </>
  );
}
