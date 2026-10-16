import { Check, Download, History, PackageCheck, Shirt, Undo2 } from 'lucide-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useApi } from '../../app/ApiContext';
import { diffDays, todayISO } from '../../domain/date';
import { downloadCsv } from '../../shared/csv';
import { relativeDays, thaiDate } from '../../shared/format';
import { useAsync } from '../../shared/hooks/useAsync';
import { UNIFORM_EVENT_LABEL } from '../../shared/labels';
import { Badge, Button, Card, ConfirmButton, EmptyState, ErrorState, PageHeader, Table, Tabs } from '../../ui';
import { EmployeeCell } from '../common';
import { IssueAction } from '../employees/components/UniformCard';

type Tab = 'pending' | 'history';
const OVERDUE_DAYS = 30;

export function UniformPage() {
  const { api } = useApi();
  const today = todayISO();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'history' ? 'history' : 'pending';

  const pending = useAsync(() => api.listUniformPending(), [api]);
  const issues = useAsync(() => api.listUniformIssues(), [api]);
  const employees = useAsync(() => api.listEmployees(), [api]);
  const empById = useMemo(() => new Map(employees.data?.map((e) => [e.id, e])), [employees.data]);

  // สรุปจำนวนตามแบบเสื้อ (ใช้วางแผนสั่งผลิต) — นับ qty ตัวแรกของ "2+1" รวมกัน
  const summary = useMemo(() => {
    const m = new Map<string, { people: number; pieces: number }>();
    for (const r of pending.data ?? []) {
      const pieces = r.qtyLabel.split('+').reduce((s, x) => s + Number(x), 0);
      const cur = m.get(r.style) ?? { people: 0, pieces: 0 };
      m.set(r.style, { people: cur.people + 1, pieces: cur.pieces + pieces });
    }
    return [...m.entries()].sort((a, b) => b[1].pieces - a[1].pieces);
  }, [pending.data]);

  const refresh = () => {
    pending.reload();
    issues.reload();
  };

  const exportCsv = () =>
    downloadCsv(
      'uniform-pending.csv',
      ['รหัสพนักงาน', 'ชื่อ', 'นามสกุล', 'บริษัท', 'รอบ', 'ครบกำหนด', 'จำนวน', 'แบบ'],
      (pending.data ?? []).map((r) => [r.employee.empCode, r.employee.firstName, r.employee.lastName, r.employee.companyCode, UNIFORM_EVENT_LABEL[r.event], r.dueDate, r.qtyLabel, r.style]),
    );

  const err = pending.error ?? issues.error;
  if (err) return <ErrorState error={err} onRetry={refresh} />;

  return (
    <>
      <PageHeader
        title="ชุดฟอร์ม"
        description="สิทธิตามกลุ่ม/ระดับ/ตำแหน่ง — บันทึกการแจกพร้อมไซซ์"
        actions={
          <Button icon={<Download />} onClick={exportCsv} disabled={!pending.data?.length}>
            ส่งออกรายการค้าง
          </Button>
        }
      />

      <Tabs<Tab>
        value={tab}
        onChange={(t) => setParams(t === 'pending' ? {} : { tab: t }, { replace: true })}
        items={[
          { value: 'pending', label: 'ค้างแจก', count: pending.data?.length },
          { value: 'history', label: 'ประวัติการแจก', count: issues.data?.length },
        ]}
      />

      {tab === 'pending' ? (
        <div className="grid gap-6 xl:grid-cols-3">
          <Card padded={false} className="xl:col-span-2" title="รายการค้างแจก" description="เลือกไซซ์แล้วกดบันทึกแจกได้ทันที" icon={<Shirt />}>
            <Table
              loading={pending.loading}
              rows={pending.data}
              pageSize={25}
              rowKey={(r) => `${r.employee.id}-${r.entitlementKey}`}
              columns={[
                { key: 'emp', header: 'พนักงาน', cell: (r) => <EmployeeCell e={r.employee} link /> },
                {
                  key: 'ev',
                  header: 'รอบ / แบบ',
                  cell: (r) => (
                    <div className="leading-tight">
                      <p className="font-medium">
                        {UNIFORM_EVENT_LABEL[r.event]} · {r.qtyLabel} ตัว
                      </p>
                      <p className="max-w-60 truncate text-xs text-muted">{r.style}</p>
                    </div>
                  ),
                },
                {
                  key: 'due',
                  header: 'ครบกำหนด',
                  hideOnMobile: true,
                  cell: (r) => {
                    const overdue = diffDays(r.dueDate, today) > OVERDUE_DAYS;
                    return (
                      <div className="leading-tight">
                        <p className="num">{thaiDate(r.dueDate)}</p>
                        {overdue ? <Badge tone="danger" className="mt-0.5">เกินกำหนด</Badge> : <p className="text-xs text-muted">{relativeDays(r.dueDate, today)}</p>}
                      </div>
                    );
                  },
                },
                {
                  key: 'act',
                  header: '',
                  align: 'right',
                  cell: (r) => <IssueAction employeeId={r.employee.id} entitlementKey={r.entitlementKey} event={r.event} qty={r.qtyLabel.split('+').reduce((s, x) => s + Number(x), 0)} today={today} onDone={refresh} />,
                },
              ]}
              empty={<EmptyState icon={<PackageCheck />} title="แจกครบทุกรายการแล้ว 🎉" description="ไม่มีชุดฟอร์มค้างแจก" />}
            />
          </Card>

          <Card title="สรุปตามแบบเสื้อ" description="ใช้วางแผนสั่งผลิต" padded={false} className="self-start">
            {summary.length === 0 ? (
              <p className="p-5 text-[13px] text-muted">ไม่มีรายการค้าง</p>
            ) : (
              <ul className="divide-y divide-border">
                {summary.map(([style, s]) => (
                  <li key={style} className="flex items-center justify-between gap-4 px-5 py-3 text-[13px]">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{style}</span>
                      <span className="text-xs text-muted">{s.people} คน</span>
                    </span>
                    <span className="num shrink-0 text-base font-semibold">
                      {s.pieces}
                      <span className="ml-1 text-xs font-normal text-muted">ตัว</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : (
        <Card padded={false} title="ประวัติการแจก" icon={<History />}>
          <Table
            loading={issues.loading || employees.loading}
            rows={issues.data && employees.data ? issues.data : undefined}
            pageSize={25}
            rowKey={(i) => i.id}
            columns={[
              { key: 'date', header: 'วันที่แจก', mobile: 'field', cell: (i) => <span className="num">{thaiDate(i.issuedAt)}</span> },
              { key: 'emp', header: 'พนักงาน', mobile: 'title', cell: (i) => (empById.get(i.employeeId) ? <EmployeeCell e={empById.get(i.employeeId)!} link /> : `#${i.employeeId}`) },
              { key: 'ev', header: 'รอบ', cell: (i) => UNIFORM_EVENT_LABEL[i.event] + (i.event === 'ANNUAL' ? ` ${Number(i.entitlementKey.slice(7)) + 543}` : '') },
              { key: 'qty', header: 'จำนวน', align: 'right', cell: (i) => <span className="num">{i.qty} ตัว</span> },
              { key: 'size', header: 'ไซซ์', align: 'center', mobile: 'aside', cell: (i) => <Badge tone="primary" dot={false}>{i.size}</Badge> },
              {
                key: 'cancel',
                header: '',
                align: 'right',
                cell: (i) => (
                  <ConfirmButton
                    icon={<Undo2 />}
                    title="ยกเลิกการแจกนี้?"
                    description={`${UNIFORM_EVENT_LABEL[i.event]} · ${i.qty} ตัว · ไซซ์ ${i.size}`}
                    confirmLabel="ยกเลิกการแจก"
                    successMessage="ยกเลิกแล้ว — รายการกลับไปเป็น “ค้างแจก”"
                    onConfirm={async () => {
                      await api.cancelUniformIssue(i.id);
                      refresh();
                    }}
                  />
                ),
              },
              { key: 'by', header: 'บันทึกโดย', hideOnMobile: true, cell: (i) => <span className="flex items-center gap-1.5 text-muted"><Check className="size-3.5 text-success" />{i.issuedBy}</span> },
            ]}
            empty={<EmptyState icon={<History />} title="ยังไม่มีประวัติการแจก" />}
          />
        </Card>
      )}
    </>
  );
}
