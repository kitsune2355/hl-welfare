import { Save } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useApi } from '../../app/ApiContext';
import { errorMessage } from '../../application/errors';
import type { EmployeeInput } from '../../application/ports';
import { addDays, todayISO } from '../../domain/date';
import type { CompanyCode, ContractType, EmployeeType, EndReason } from '../../domain/types';
import { useAsync } from '../../shared/hooks/useAsync';
import { validateEmployee } from './employeeRules';
import {
  COMPANY_CODES,
  CONTRACT_LABEL,
  DEPT_GROUPS,
  EMPLOYEE_TYPE_LABEL,
  END_REASON_LABEL,
  PRO_POSITIONS,
} from '../../shared/labels';
import { Alert, Button, ButtonLink, Card, ErrorState, PageHeader, SelectField, Skeleton, Switch, TextField, useToast } from '../../ui';

type Form = Omit<EmployeeInput, 'level' | 'salary'> & { level: string; salary: string };
type Errors = Partial<Record<keyof Form, string>>;

const opts = (rec: Record<string, string>) => Object.entries(rec).map(([value, label]) => ({ value, label }));

function blank(): Form {
  const today = todayISO();
  return {
    empCode: '',
    firstName: '',
    lastName: '',
    companyCode: 'HL',
    siteId: 1,
    employeeType: 'CENTRAL',
    contractType: 'REGULAR',
    deptGroup: 'Support Line',
    position: null,
    level: '1',
    salary: '',
    birthDate: '',
    startDate: today,
    probationPassDate: null,
    status: 'ACTIVE',
    lastWorkingDate: null,
    endDate: null,
    endReason: null,
  };
}

function toPayload(form: Form): EmployeeInput {
  const central = form.employeeType === 'CENTRAL';
  const inactive = form.status === 'INACTIVE';
  return {
    ...form,
    empCode: form.empCode.trim(),
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    salary: Number(form.salary),
    level: central ? Number(form.level) : null,
    deptGroup: central ? form.deptGroup : null,
    position: form.employeeType === 'PRO_SITE' ? (form.position?.trim() ?? null) : null,
    contractType: form.employeeType === 'PRO_SITE' ? form.contractType : 'REGULAR',
    probationPassDate: form.probationPassDate || null,
    endReason: inactive ? form.endReason : null,
    endDate: inactive ? form.endDate || null : null,
    lastWorkingDate: inactive ? form.lastWorkingDate || form.endDate || null : null,
  };
}

/** กฎเดียวกับตาราง Excel (employeeRules) */
const validate = (f: Form): Errors => validateEmployee(toPayload(f)) as Errors;

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="grid gap-6 border-b border-border py-6 first:pt-0 last:border-0 last:pb-0 lg:grid-cols-3">
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1 text-[13px] text-muted">{description}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">{children}</div>
    </div>
  );
}

export function EmployeeFormPage() {
  const { id } = useParams();
  const editing = id !== undefined;
  const { api } = useApi();
  const nav = useNavigate();
  const toast = useToast();

  const sites = useAsync(() => api.listSites(), [api]);
  const existing = useAsync(() => (editing ? api.getEmployeeBenefits(Number(id)).then((b) => b.employee) : Promise.resolve(null)), [api, id]);

  const [form, setForm] = useState<Form | null>(editing ? null : blank());
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existing.data) setForm({ ...existing.data, level: String(existing.data.level ?? ''), salary: String(existing.data.salary) });
  }, [existing.data]);

  const companySites = useMemo(() => sites.data?.filter((s) => s.companyCode === form?.companyCode) ?? [], [sites.data, form?.companyCode]);

  if (existing.error || sites.error) return <ErrorState error={existing.error ?? sites.error} onRetry={() => (existing.reload(), sites.reload())} />;
  if (!form || !sites.data) return <Skeleton className="h-[600px] rounded-xl" />;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    const next = { ...form, [k]: v };
    if (k === 'companyCode') {
      next.siteId = sites.data!.find((s) => s.companyCode === v)?.id ?? next.siteId;
      if (v !== 'PRO' && next.employeeType === 'PRO_SITE') next.employeeType = 'CENTRAL';
    }
    if (k === 'startDate' && !editing && typeof v === 'string' && v) next.probationPassDate = null;
    setForm(next);
    if (touched) setErrors(validate(next));
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setTouched(true);
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error('กรุณาตรวจสอบข้อมูลที่ไฮไลต์สีแดง');
      return;
    }
    const payload = toPayload(form);
    setSaving(true);
    try {
      const saved = await api.saveEmployee(payload);
      toast.success(editing ? 'บันทึกการแก้ไขแล้ว' : `เพิ่มพนักงาน ${saved.firstName} แล้ว`);
      nav(`/employees/${saved.id}`);
    } catch (e) {
      toast.error(errorMessage(e));
      if (errorMessage(e).includes('รหัส')) setErrors((x) => ({ ...x, empCode: errorMessage(e) }));
    } finally {
      setSaving(false);
    }
  };

  const err = (k: keyof Form) => errors[k];
  const name = editing ? `${form.firstName} ${form.lastName}` : 'เพิ่มพนักงาน';
  const back = editing ? `/employees/${id}` : '/employees';

  return (
    <form onSubmit={submit} noValidate>
      <PageHeader
        breadcrumbs={[{ label: 'พนักงาน', to: '/employees' }, ...(editing ? [{ label: name, to: back }] : []), { label: editing ? 'แก้ไข' : 'เพิ่มใหม่' }]}
        title={editing ? `แก้ไข: ${name}` : 'เพิ่มพนักงาน'}
        description="ระบบจะคำนวณสิทธิประกันกลุ่ม / PVD / ชุดฟอร์ม ให้อัตโนมัติจากข้อมูลนี้"
      />

      <Card className="mb-24">
        <Section title="ข้อมูลส่วนตัว" description="รหัสพนักงานต้องไม่ซ้ำกันทั้งเครือ">
          <TextField label="รหัสพนักงาน" required value={form.empCode} onChange={(v) => set('empCode', v)} error={err('empCode')} placeholder="เช่น HL06007" />
          <TextField label="วันเกิด" type="date" required value={form.birthDate} onChange={(v) => set('birthDate', v)} error={err('birthDate')} hint="ใช้ตรวจอายุไม่เกิน 65 ปี สำหรับประกันกลุ่ม" />
          <TextField label="ชื่อ" required value={form.firstName} onChange={(v) => set('firstName', v)} error={err('firstName')} />
          <TextField label="นามสกุล" required value={form.lastName} onChange={(v) => set('lastName', v)} error={err('lastName')} />
        </Section>

        <Section title="การจ้างงาน" description="บริษัท หน่วยงาน และประเภทพนักงาน กำหนดกฎสวัสดิการที่ได้รับ">
          <SelectField label="บริษัท" required value={form.companyCode} onChange={(v) => set('companyCode', v as CompanyCode)} options={COMPANY_CODES.map((c) => ({ value: c, label: c }))} />
          <SelectField label="หน่วยงาน" required value={String(form.siteId)} onChange={(v) => set('siteId', Number(v))} options={companySites.map((s) => ({ value: String(s.id), label: s.name }))} />
          <SelectField
            label="ประเภทพนักงาน"
            required
            value={form.employeeType}
            onChange={(v) => set('employeeType', v as EmployeeType)}
            options={opts(EMPLOYEE_TYPE_LABEL).filter((o) => o.value !== 'PRO_SITE' || form.companyCode === 'PRO')}
            hint={form.companyCode !== 'PRO' ? 'Pro Site เลือกได้เฉพาะบริษัท PRO' : undefined}
          />
          {form.employeeType === 'PRO_SITE' ? (
            <SelectField label="สัญญา" value={form.contractType} onChange={(v) => set('contractType', v as ContractType)} options={opts(CONTRACT_LABEL)} hint={form.contractType === 'SHORT_3PCT' ? 'สัญญา 3% ไม่ได้รับประกันกลุ่ม' : undefined} />
          ) : (
            <div className="max-sm:hidden" />
          )}
          {form.employeeType === 'CENTRAL' && (
            <>
              <SelectField label="กลุ่ม / ฝ่าย" required value={form.deptGroup ?? ''} onChange={(v) => set('deptGroup', v)} options={DEPT_GROUPS.map((d) => ({ value: d, label: d }))} error={err('deptGroup')} />
              <TextField label="ระดับ" type="number" min={1} max={12} required value={form.level} onChange={(v) => set('level', v)} error={err('level')} />
            </>
          )}
          {form.employeeType === 'PRO_SITE' && (
            <>
              <SelectField
                label="ตำแหน่ง"
                required
                creatable
                value={form.position ?? ''}
                onChange={(v) => set('position', v)}
                options={PRO_POSITIONS.map((p) => ({ value: p, label: p }))}
                error={err('position')}
                hint="พิมพ์ตำแหน่งใหม่ได้ — ไม่อยู่ในรายการ = “ตำแหน่งอื่นๆ”"
              />
            </>
          )}
          <TextField label="เงินเดือน (บาท)" type="number" min={0} step="0.01" required value={form.salary} onChange={(v) => set('salary', v)} error={err('salary')} hint="ใช้คำนวณยอดหัก/สมทบ PVD" />
          <TextField label="วันเริ่มงาน" type="date" required value={form.startDate} onChange={(v) => set('startDate', v)} error={err('startDate')} />
          <TextField
            label="วันผ่านทดลองงาน"
            type="date"
            value={form.probationPassDate ?? ''}
            onChange={(v) => set('probationPassDate', v || null)}
            error={err('probationPassDate')}
            hint={form.startDate ? `ปกติ 119 วัน → ${addDays(form.startDate, 119)}` : undefined}
          />
        </Section>

        <Section title="การพ้นสภาพ" description="เลิกจ้าง / กระทำผิด จะต้องแจ้งออกจากประกันกลุ่มทันที">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface-2/50 px-4 py-3 sm:col-span-2">
            <div>
              <p className="font-medium">พ้นสภาพพนักงาน</p>
              <p className="text-xs text-muted">เปิดเพื่อบันทึกการลาออก / ขาดงาน / เลิกจ้าง</p>
            </div>
            <Switch label="พ้นสภาพพนักงาน" checked={form.status === 'INACTIVE'} onChange={(v) => set('status', v ? 'INACTIVE' : 'ACTIVE')} />
          </div>
          {form.status === 'INACTIVE' && (
            <>
              <SelectField label="เหตุผล" required placeholder="เลือกเหตุผล" value={form.endReason ?? ''} onChange={(v) => set('endReason', (v || null) as EndReason | null)} options={opts(END_REASON_LABEL)} error={err('endReason')} />
              <TextField label="วันทำงานสุดท้าย" type="date" value={form.lastWorkingDate ?? ''} onChange={(v) => set('lastWorkingDate', v || null)} error={err('lastWorkingDate')} hint={form.endReason === 'ABSENT_3D' ? 'วันออกจากประกัน = วันนี้ + 7 วัน' : undefined} />
              <TextField label="วันพ้นสภาพ" type="date" required value={form.endDate ?? ''} onChange={(v) => set('endDate', v || null)} error={err('endDate')} />
              {(form.endReason === 'TERMINATED' || form.endReason === 'MISCONDUCT') && (
                <Alert tone="danger" className="sm:col-span-2" title="ต้องแจ้งออกจากประกันกลุ่มทันที">
                  หลังบันทึก รายการจะไปอยู่ที่หน้า “ประกันกลุ่ม” ส่วนแจ้งออกทันที · PVD vesting = 0%
                </Alert>
              )}
            </>
          )}
        </Section>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/90 backdrop-blur-md lg:left-64">
        <div className="mx-auto flex max-w-7xl items-center justify-end gap-2 px-4 py-3 sm:px-6 lg:px-8">
          <ButtonLink to={back} variant="ghost">
            ยกเลิก
          </ButtonLink>
          <Button type="submit" variant="primary" loading={saving} icon={<Save />}>
            บันทึก
          </Button>
        </div>
      </div>
    </form>
  );
}
