import { CheckCircle2, Download, History, LogIn, LogOut, Send, ShieldAlert } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { useApi } from '../../app/ApiContext';
import { errorMessage } from '../../application/errors';
import { addMonths, nextCycleDate, todayISO } from '../../domain/date';
import type { BatchType, InsuranceCycleRow } from '../../domain/types';
import { downloadCsv } from '../../shared/csv';
import { relativeDays, thaiDate, thaiDateLong, thaiDateTime } from '../../shared/format';
import { useAsync } from '../../shared/hooks/useAsync';
import { BATCH_TONE, BATCH_TYPE_LABEL, EMPLOYEE_TYPE_LABEL } from '../../shared/labels';
import { Badge, Button, Card, EmptyState, ErrorState, Modal, PageHeader, Select, Skeleton, Table, useToast } from '../../ui';
import { EmployeeCell } from '../common';

const SECTIONS: { type: BatchType; title: string; description: string; icon: ReactNode }[] = [
  { type: 'URGENT', title: 'แจ้งออกทันที', description: 'เลิกจ้าง / กระทำผิด — ไม่รอรอบ แสดงทุกรอบจนกว่าจะส่ง', icon: <ShieldAlert /> },
  { type: 'IN', title: 'แจ้งเข้า', description: 'พนักงานที่ครบอายุงานแล้ว (รวมที่ตกค้างจากรอบก่อน)', icon: <LogIn /> },
  { type: 'OUT', title: 'แจ้งออก', description: 'ลาออก / ขาดงาน 3 วัน (วันทำงานสุดท้าย + 7 วัน)', icon: <LogOut /> },
];

function Checkbox(props: { checked: boolean; disabled?: boolean; onChange: () => void; label: string; indeterminate?: boolean }) {
  return (
    <input
      type="checkbox"
      aria-label={props.label}
      checked={props.checked}
      disabled={props.disabled}
      ref={(el) => {
        if (el) el.indeterminate = !!props.indeterminate;
      }}
      onChange={props.onChange}
      className="size-4 cursor-pointer rounded accent-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-40"
    />
  );
}

export function InsurancePage() {
  const { api } = useApi();
  const toast = useToast();
  const today = todayISO();
  const current = nextCycleDate(today);
  const [params, setParams] = useSearchParams();
  const cycle = params.get('cycle') ?? current;

  const cycleOptions = Array.from({ length: 10 }, (_, i) => addMonths(current, i - 6)).reverse();

  const data = useAsync(() => api.getInsuranceCycle(cycle), [api, cycle]);
  const batches = useAsync(() => api.listInsuranceBatches(), [api]);

  const [selected, setSelected] = useState<Record<BatchType, Set<number>>>({ IN: new Set(), OUT: new Set(), URGENT: new Set() });
  const [confirm, setConfirm] = useState<BatchType | null>(null);
  const [sending, setSending] = useState(false);

  const rowsOf = (t: BatchType) => data.data?.rows.filter((r) => r.type === t) ?? [];

  const toggle = (t: BatchType, id: number) =>
    setSelected((s) => {
      const n = new Set(s[t]);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return { ...s, [t]: n };
    });

  const toggleAll = (t: BatchType) =>
    setSelected((s) => {
      const open = rowsOf(t).filter((r) => !r.submitted).map((r) => r.employee.id);
      const all = open.length > 0 && open.every((id) => s[t].has(id));
      return { ...s, [t]: new Set(all ? [] : open) };
    });

  const submit = async () => {
    if (!confirm) return;
    setSending(true);
    try {
      const ids = [...selected[confirm]];
      await api.submitInsuranceBatch({ cycleDate: cycle, type: confirm, employeeIds: ids });
      toast.success(`ส่ง${BATCH_TYPE_LABEL[confirm]} ${ids.length} รายเรียบร้อย`);
      setSelected((s) => ({ ...s, [confirm]: new Set() }));
      setConfirm(null);
      data.reload();
      batches.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const exportCsv = () => {
    const rows = data.data?.rows ?? [];
    downloadCsv(
      `insurance-${cycle}.csv`,
      ['ประเภทแจ้ง', 'รหัสพนักงาน', 'ชื่อ', 'นามสกุล', 'บริษัท', 'ประเภทพนักงาน', 'วันเกิด', 'วันมีผล', 'เหตุผล', 'สถานะ'],
      rows.map((r) => [
        BATCH_TYPE_LABEL[r.type],
        r.employee.empCode,
        r.employee.firstName,
        r.employee.lastName,
        r.employee.companyCode,
        EMPLOYEE_TYPE_LABEL[r.employee.employeeType],
        r.employee.birthDate,
        r.effectiveDate,
        r.reason,
        r.submitted ? 'ส่งแล้ว' : 'รอส่ง',
      ]),
    );
  };

  const total = data.data?.rows.length ?? 0;

  return (
    <>
      <PageHeader
        title="ประกันกลุ่ม"
        description="สร้างรายการแจ้งเข้า/ออกทุกวันที่ 5 ของเดือน และแจ้งออกทันทีกรณีเลิกจ้าง"
        actions={
          <>
            <Select aria-label="เลือกรอบ" value={cycle} onChange={(e) => setParams({ cycle: e.target.value }, { replace: true })} className="w-full sm:w-52">
              {cycleOptions.map((c) => (
                <option key={c} value={c}>
                  รอบ {thaiDate(c)}
                  {c === current ? ' (ถัดไป)' : ''}
                </option>
              ))}
            </Select>
            <Button icon={<Download />} onClick={exportCsv} disabled={!total}>
              ส่งออก CSV
            </Button>
          </>
        }
      />

      <p className="-mt-3 mb-6 text-[13px] text-muted">
        รอบ <span className="font-medium text-fg">{thaiDateLong(cycle)}</span> · {relativeDays(cycle, today)}
      </p>

      {data.error ? (
        <ErrorState error={data.error} onRetry={data.reload} />
      ) : (
        <div className="space-y-6">
          {SECTIONS.map((s) => {
            const rows = rowsOf(s.type);
            const open = rows.filter((r) => !r.submitted);
            const sel = selected[s.type];
            const allSel = open.length > 0 && open.every((r) => sel.has(r.employee.id));
            if (s.type === 'URGENT' && !data.loading && rows.length === 0) return null;
            return (
              <Card
                key={s.type}
                icon={s.icon}
                title={
                  <span className="flex items-center gap-2">
                    {s.title}
                    {!data.loading && <Badge tone={open.length ? BATCH_TONE[s.type] : 'success'}>{open.length ? `รอส่ง ${open.length}` : 'ครบแล้ว'}</Badge>}
                  </span>
                }
                description={s.description}
                className={s.type === 'URGENT' && open.length ? 'border-danger/40' : undefined}
                padded={false}
                actions={
                  <Button variant={s.type === 'URGENT' ? 'danger' : 'primary'} size="sm" icon={<Send />} disabled={sel.size === 0} onClick={() => setConfirm(s.type)}>
                    ส่ง{s.title} {sel.size > 0 && `(${sel.size})`}
                  </Button>
                }
              >
                {data.loading && !data.data ? (
                  <div className="space-y-3 p-5">
                    <Skeleton className="h-8" />
                    <Skeleton className="h-8" />
                  </div>
                ) : (
                  <Table<InsuranceCycleRow>
                    rows={rows}
                    rowKey={(r) => r.employee.id}
                    onRowClick={(r) => !r.submitted && toggle(s.type, r.employee.id)}
                    rowClassName={(r) => (sel.has(r.employee.id) ? 'bg-primary-soft/50' : undefined)}
                    pageSize={25}
                    columns={[
                      {
                        key: 'chk',
                        header: <Checkbox label="เลือกทั้งหมด" checked={allSel} indeterminate={!allSel && sel.size > 0} disabled={!open.length} onChange={() => toggleAll(s.type)} />,
                        className: 'w-10',
                        mobile: 'lead',
                        cell: (r) => <Checkbox label={`เลือก ${r.employee.empCode}`} checked={r.submitted || sel.has(r.employee.id)} disabled={r.submitted} onChange={() => toggle(s.type, r.employee.id)} />,
                      },
                      { key: 'emp', header: 'พนักงาน', mobile: 'title', cell: (r) => <EmployeeCell e={r.employee} link /> },
                      { key: 'co', header: 'บริษัท', hideOnMobile: true, cell: (r) => `${r.employee.companyCode} · ${EMPLOYEE_TYPE_LABEL[r.employee.employeeType]}` },
                      { key: 'reason', header: 'เหตุผล', cell: (r) => <span className="text-muted">{r.reason}</span> },
                      { key: 'date', header: 'วันมีผล', cell: (r) => <span className="num">{thaiDate(r.effectiveDate)}</span> },
                      {
                        key: 'st',
                        header: 'สถานะ',
                        align: 'right',
                        mobile: 'aside',
                        cell: (r) =>
                          r.submitted ? (
                            <Badge tone="success">
                              <CheckCircle2 className="size-3" />
                              ส่งแล้ว
                            </Badge>
                          ) : (
                            <Badge tone={BATCH_TONE[r.type]}>รอส่ง</Badge>
                          ),
                      },
                    ]}
                    empty={<EmptyState title={`ไม่มีรายการ${s.title}ในรอบนี้`} />}
                  />
                )}
              </Card>
            );
          })}

          <Card title="ประวัติการส่งแจ้ง" icon={<History />} padded={false}>
            <Table
              loading={batches.loading}
              rows={batches.data}
              pageSize={10}
              rowKey={(b) => b.id}
              columns={[
                { key: 'id', header: '#', cell: (b) => <span className="num text-muted">{b.id}</span> },
                { key: 'cycle', header: 'รอบ', cell: (b) => <span className="num">{thaiDate(b.cycleDate)}</span> },
                { key: 'type', header: 'ประเภท', cell: (b) => <Badge tone={BATCH_TONE[b.type]}>{BATCH_TYPE_LABEL[b.type]}</Badge> },
                { key: 'n', header: 'จำนวน', align: 'right', cell: (b) => <span className="num">{b.employeeIds.length} ราย</span> },
                { key: 'at', header: 'ส่งเมื่อ', hideOnMobile: true, cell: (b) => <span className="num text-muted">{thaiDateTime(b.submittedAt)}</span> },
                { key: 'by', header: 'โดย', hideOnMobile: true, cell: (b) => <span className="text-muted">{b.submittedBy}</span> },
              ]}
              empty={<EmptyState icon={<History />} title="ยังไม่มีประวัติการส่ง" />}
            />
          </Card>
        </div>
      )}

      <Modal
        open={confirm !== null}
        onClose={() => !sending && setConfirm(null)}
        title={confirm ? `ยืนยันส่ง${BATCH_TYPE_LABEL[confirm]}` : ''}
        description={confirm ? `${selected[confirm].size} ราย · รอบ ${thaiDate(cycle)}` : ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)} disabled={sending}>
              ยกเลิก
            </Button>
            <Button variant={confirm === 'URGENT' ? 'danger' : 'primary'} loading={sending} icon={<Send />} onClick={submit}>
              ยืนยันส่ง
            </Button>
          </>
        }
      >
        <ul className="max-h-60 space-y-1 overflow-y-auto rounded-lg border border-border bg-surface-2/50 p-3 text-[13px]">
          {confirm &&
            rowsOf(confirm)
              .filter((r) => selected[confirm].has(r.employee.id))
              .map((r) => (
                <li key={r.employee.id} className="flex justify-between gap-3">
                  <span>
                    {r.employee.firstName} {r.employee.lastName}
                  </span>
                  <span className="num text-muted">{r.employee.empCode}</span>
                </li>
              ))}
        </ul>
        <p className="mt-3 text-xs text-muted">ส่งแล้วจะแก้ไขไม่ได้ — พนักงานแต่ละคนถูกแจ้งเข้า/ออกได้ครั้งเดียว</p>
      </Modal>
    </>
  );
}
