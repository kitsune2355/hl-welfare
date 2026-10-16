import { Check, Shirt, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useApi } from '../../../app/ApiContext';
import { errorMessage } from '../../../application/errors';
import type { Employee, ISODate, UniformEntitlement, UniformStatus } from '../../../domain/types';
import { thaiDate } from '../../../shared/format';
import { SIZES, UNIFORM_EVENT_LABEL, UNIFORM_ITEM_LABEL } from '../../../shared/labels';
import { Badge, Button, Card, Combobox, ConfirmButton, EmptyState, Table, useToast } from '../../../ui';

/** ไซซ์ + ปุ่มบันทึกแจก ใช้ทั้งในหน้ารายละเอียดและหน้าชุดฟอร์ม */
export function IssueAction({
  employeeId,
  entitlementKey,
  event,
  qty,
  today,
  onDone,
}: {
  employeeId: number;
  entitlementKey: string;
  event: UniformEntitlement['event'];
  qty: number;
  today: ISODate;
  onDone: () => void;
}) {
  const { api } = useApi();
  const toast = useToast();
  const [size, setSize] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.createUniformIssue({ employeeId, entitlementKey, event, qty, size, issuedAt: today });
      toast.success(`บันทึกแจกชุดฟอร์ม (${UNIFORM_EVENT_LABEL[event]}) ไซซ์ ${size} แล้ว`);
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
      <Combobox aria-label="ไซซ์" size="sm" placeholder="ไซซ์" value={size} onChange={setSize} options={SIZES.map((s) => ({ value: s, label: s }))} className="w-24" />
      <Button size="sm" variant="primary" disabled={!size} loading={busy} onClick={save}>
        บันทึกแจก
      </Button>
    </div>
  );
}

function CancelIssue({ issueId, label, onDone }: { issueId: number; label: string; onDone: () => void }) {
  const { api } = useApi();
  return (
    <ConfirmButton
      icon={<Undo2 />}
      title={`ยกเลิกการแจก (${label})?`}
      confirmLabel="ยกเลิกการแจก"
      successMessage="ยกเลิกแล้ว — กลับไปเป็น “ค้างแจก”"
      onConfirm={async () => {
        await api.cancelUniformIssue(issueId);
        onDone();
      }}
    >
      <p className="text-[13px] text-muted">ใช้กรณีบันทึกผิด เช่น เลือกไซซ์ผิด แล้วบันทึกใหม่ได้ทันที</p>
    </ConfirmButton>
  );
}

export function UniformCard({ emp, st, today, onChange }: { emp: Employee; st: UniformStatus; today: ISODate; onChange: () => void }) {
  const pending = st.entitlements.filter((e) => !e.issued).length;
  return (
    <Card
      title="ชุดฟอร์ม"
      description={st.style ?? undefined}
      icon={<Shirt />}
      padded={false}
      actions={st.ruleId === null ? <Badge tone="danger" size="lg">ไม่พบสิทธิ</Badge> : pending > 0 ? <Badge tone="warning" size="lg">ค้างแจก {pending}</Badge> : <Badge tone="success" size="lg">ครบแล้ว</Badge>}
    >
      {st.ruleId === null ? (
        <p className="p-5 text-[13px] text-muted">{st.reasons.join(' · ')}</p>
      ) : (
        <Table
          rows={[...st.entitlements].reverse()}
          rowKey={(e) => e.key}
          columns={[
            { key: 'event', header: 'รอบ', cell: (e) => <span className="font-medium">{UNIFORM_EVENT_LABEL[e.event]}{e.event === 'ANNUAL' && ` ${Number(e.key.slice(7)) + 543}`}</span> },
            { key: 'due', header: 'ครบกำหนด', cell: (e) => <span className="num">{thaiDate(e.dueDate)}</span> },
            { key: 'qty', header: 'จำนวน', align: 'right', cell: (e) => <span className="num">{e.qtyLabel} ตัว</span> },
            { key: 'items', header: 'รายการ', hideOnMobile: true, cell: (e) => <span className="text-muted">{e.items.map((i) => UNIFORM_ITEM_LABEL[i]).join(', ')}</span> },
            {
              key: 'act',
              header: '',
              align: 'right',
              cell: (e) =>
                e.issued ? (
                  <span className="inline-flex items-center gap-1">
                    <Badge tone="success">
                      <Check className="size-3" /> แจกแล้ว
                    </Badge>
                    {e.issueId !== null && <CancelIssue issueId={e.issueId} label={UNIFORM_EVENT_LABEL[e.event]} onDone={onChange} />}
                  </span>
                ) : emp.status === 'ACTIVE' ? (
                  <IssueAction employeeId={emp.id} entitlementKey={e.key} event={e.event} qty={e.qty} today={today} onDone={onChange} />
                ) : (
                  <Badge tone="neutral">ไม่ได้แจก</Badge>
                ),
            },
          ]}
          empty={<EmptyState icon={<Shirt />} title="ยังไม่ถึงรอบแจกชุดฟอร์ม" description="จะได้รับเมื่อเริ่มงาน / ผ่านทดลองงาน / รอบประจำปี ตามกฎ" />}
        />
      )}
    </Card>
  );
}
