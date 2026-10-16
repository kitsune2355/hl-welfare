import { FileText, FilterX, Search, Trash2, UserX } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useApi } from '../../app/ApiContext';
import { errorMessage } from '../../application/errors';
import { todayISO } from '../../domain/date';
import type { CompanyCode, ContractType, Employee, EmployeeFilter, EmployeeStatus, EmployeeType } from '../../domain/types';
import { money, thaiDate } from '../../shared/format';
import { useAsync } from '../../shared/hooks/useAsync';
import {
  COMPANY_CODES,
  CONTRACT_LABEL,
  DEPT_GROUPS,
  EMPLOYEE_TYPE_LABEL,
  EMPLOYEE_TYPE_TONE,
  PRO_POSITIONS,
  STATUS_LABEL,
  STATUS_TONE,
} from '../../shared/labels';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  Combobox,
  DataGrid,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  PageHeader,
  useToast,
  type CellValue,
  type GridColumn,
} from '../../ui';
import { normalizeEmployee, validateEmployee } from './employeeRules';

const opts = (rec: Record<string, string>) => Object.entries(rec).map(([value, label]) => ({ value, label }));
const str = (v: CellValue) => (v === null ? '' : String(v));

export function EmployeesPage() {
  const { api } = useApi();
  const nav = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const filter: EmployeeFilter = {
    q: params.get('q') ?? '',
    companyCode: (params.get('company') ?? '') as CompanyCode | '',
    employeeType: (params.get('type') ?? '') as EmployeeType | '',
    status: (params.get('status') ?? '') as EmployeeStatus | '',
  };
  const [q, setQ] = useState(filter.q ?? '');
  const [confirmDelete, setConfirmDelete] = useState<Employee | null>(null);
  const [deleting, setDeleting] = useState(false);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page'); // เปลี่ยนตัวกรอง → กลับหน้าแรก
    setParams(next, { replace: true });
  };

  // ค้นหาแบบ debounce 250ms แล้วเก็บลง URL
  useEffect(() => setQ(filter.q ?? ''), [filter.q]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (q !== (params.get('q') ?? '')) update('q', q);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const page = Math.max(1, Number(params.get('page')) || 1);
  const key = [filter.q, filter.companyCode, filter.employeeType, filter.status].join('|');
  const employees = useAsync(() => api.listEmployees(filter), [api, key]);
  const sites = useAsync(() => api.listSites(), [api]);
  const siteList = useMemo(() => sites.data ?? [], [sites.data]);
  const siteName = useMemo(() => new Map(siteList.map((s) => [s.id, s.name])), [siteList]);
  const hasFilter = !!(filter.q || filter.companyCode || filter.employeeType || filter.status);

  /** แก้ค่า 1 field แล้วจัด field ที่เกี่ยวข้องให้สอดคล้อง */
  const setField =
    <K extends keyof Employee>(k: K, conv: (v: CellValue) => Employee[K]) =>
    (row: Employee, v: CellValue): Employee =>
      normalizeEmployee({ ...row, [k]: conv(v) }, siteList);

  const columns: GridColumn<Employee>[] = [
    { key: 'empCode', header: 'รหัส', width: 110, required: true, editor: 'text', value: (e) => e.empCode, set: setField('empCode', (v) => str(v).trim()) },
    { key: 'firstName', header: 'ชื่อ', width: 130, required: true, editor: 'text', value: (e) => e.firstName, set: setField('firstName', (v) => str(v).trim()) },
    { key: 'lastName', header: 'นามสกุล', width: 140, required: true, editor: 'text', value: (e) => e.lastName, set: setField('lastName', (v) => str(v).trim()) },
    {
      key: 'companyCode',
      header: 'บริษัท',
      width: 90,
      required: true,
      editor: 'select',
      value: (e) => e.companyCode,
      options: () => COMPANY_CODES.map((c) => ({ value: c, label: c })),
      set: setField('companyCode', (v) => str(v) as CompanyCode),
    },
    {
      key: 'siteId',
      header: 'หน่วยงาน',
      width: 220,
      required: true,
      editor: 'select',
      value: (e) => String(e.siteId),
      display: (e) => <span className="truncate">{siteName.get(e.siteId) ?? '–'}</span>,
      options: (e) => siteList.filter((s) => s.companyCode === e.companyCode).map((s) => ({ value: String(s.id), label: s.name })),
      set: setField('siteId', (v) => Number(v)),
    },
    {
      key: 'employeeType',
      header: 'ประเภท',
      width: 120,
      required: true,
      editor: 'select',
      value: (e) => e.employeeType,
      display: (e) => (
        <Badge tone={EMPLOYEE_TYPE_TONE[e.employeeType]} dot={false}>
          {EMPLOYEE_TYPE_LABEL[e.employeeType]}
        </Badge>
      ),
      options: (e) => opts(EMPLOYEE_TYPE_LABEL).filter((o) => o.value !== 'PRO_SITE' || e.companyCode === 'PRO'),
      set: setField('employeeType', (v) => str(v) as EmployeeType),
    },
    {
      key: 'deptGroup',
      header: 'กลุ่ม / ฝ่าย',
      width: 180,
      editor: 'select',
      editable: (e) => e.employeeType === 'CENTRAL',
      value: (e) => e.deptGroup,
      options: () => DEPT_GROUPS.map((d) => ({ value: d, label: d })),
      set: setField('deptGroup', (v) => str(v) || null),
    },
    { key: 'level', header: 'ระดับ', width: 70, align: 'right', editor: 'number', editable: (e) => e.employeeType === 'CENTRAL', value: (e) => e.level, set: setField('level', (v) => (v === null ? null : Number(v))) },
    {
      key: 'position',
      header: 'ตำแหน่ง',
      width: 150,
      editor: 'select',
      creatable: true,
      editable: (e) => e.employeeType === 'PRO_SITE',
      value: (e) => e.position,
      options: () => PRO_POSITIONS.map((p) => ({ value: p, label: p })),
      set: setField('position', (v) => str(v) || null),
    },
    {
      key: 'contractType',
      header: 'สัญญา',
      width: 150,
      editor: 'select',
      editable: (e) => e.employeeType === 'PRO_SITE',
      value: (e) => e.contractType,
      display: (e) => (e.employeeType === 'PRO_SITE' ? CONTRACT_LABEL[e.contractType] : ''),
      options: () => opts(CONTRACT_LABEL),
      set: setField('contractType', (v) => str(v) as ContractType),
    },
    { key: 'salary', header: 'เงินเดือน', width: 110, align: 'right', required: true, editor: 'number', value: (e) => e.salary, display: (e) => <span className="num">{e.salary ? money(e.salary) : ''}</span>, set: setField('salary', (v) => Number(v) || 0) },
    { key: 'birthDate', header: 'วันเกิด', width: 110, required: true, editor: 'date', value: (e) => e.birthDate, display: (e) => (e.birthDate ? thaiDate(e.birthDate) : ''), set: setField('birthDate', str) },
    { key: 'startDate', header: 'วันเริ่มงาน', width: 110, required: true, editor: 'date', value: (e) => e.startDate, display: (e) => thaiDate(e.startDate), set: setField('startDate', str) },
    {
      key: 'probationPassDate',
      header: 'ผ่านทดลองงาน',
      width: 120,
      editor: 'date',
      value: (e) => e.probationPassDate,
      display: (e) => (e.probationPassDate ? thaiDate(e.probationPassDate) : ''),
      set: setField('probationPassDate', (v) => str(v) || null),
    },
    { key: 'status', header: 'สถานะ', width: 100, value: (e) => e.status, display: (e) => <Badge tone={STATUS_TONE[e.status]}>{STATUS_LABEL[e.status]}</Badge> },
  ];

  const blank = (): Employee =>
    normalizeEmployee(
      {
        id: 0,
        empCode: '',
        firstName: '',
        lastName: '',
        companyCode: filter.companyCode || 'HL',
        siteId: 0,
        employeeType: filter.employeeType && (filter.employeeType !== 'PRO_SITE' || filter.companyCode === 'PRO') ? filter.employeeType : 'CENTRAL',
        contractType: 'REGULAR',
        deptGroup: null,
        position: null,
        level: null,
        salary: 0,
        birthDate: '',
        startDate: todayISO(),
        probationPassDate: null,
        status: 'ACTIVE',
        lastWorkingDate: null,
        endDate: null,
        endReason: null,
      },
      siteList,
    );

  const save = async (row: Employee, isNew: boolean) => {
    const saved = await api.saveEmployee(isNew ? { ...row, id: undefined } : row);
    employees.setData((xs) => (isNew ? [saved, ...(xs ?? [])] : xs?.map((x) => (x.id === saved.id ? saved : x))));
    if (isNew) toast.success(`เพิ่มพนักงาน ${saved.firstName} ${saved.lastName} แล้ว`);
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.deleteEmployee(confirmDelete.id);
      employees.setData((xs) => xs?.filter((x) => x.id !== confirmDelete.id));
      toast.success(`ลบ ${confirmDelete.firstName} ${confirmDelete.lastName} แล้ว`);
      setConfirmDelete(null);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="พนักงาน"
        description="แก้ไขได้ในตารางเหมือน Excel — บันทึกอัตโนมัติเมื่อกรอกครบ · บันทึกพ้นสภาพที่หน้ารายละเอียด"
        actions={
          <ButtonLink to="/employees/new" icon={<FileText className="size-4" />}>
            เพิ่มด้วยฟอร์มเต็ม
          </ButtonLink>
        }
      />

      <Card padded={false}>
        <div className="grid grid-cols-2 gap-3 border-b border-border p-4 sm:flex sm:flex-wrap sm:items-center">
          <div className="relative col-span-2 sm:min-w-56 sm:flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหารหัส หรือ ชื่อ-สกุล" aria-label="ค้นหา" className="pl-9" />
          </div>
          <Combobox aria-label="บริษัท" clearable placeholder="ทุกบริษัท" value={filter.companyCode ?? ''} onChange={(v) => update('company', v)} options={COMPANY_CODES.map((c) => ({ value: c, label: c }))} className="sm:w-40" />
          <Combobox aria-label="ประเภท" clearable placeholder="ทุกประเภท" value={filter.employeeType ?? ''} onChange={(v) => update('type', v)} options={opts(EMPLOYEE_TYPE_LABEL)} className="sm:w-44" />
          <Combobox aria-label="สถานะ" clearable placeholder="ทุกสถานะ" value={filter.status ?? ''} onChange={(v) => update('status', v)} options={opts(STATUS_LABEL)} className="sm:w-40" />
          {hasFilter && (
            <Button variant="ghost" className="max-sm:col-span-2 max-sm:border max-sm:border-border" icon={<FilterX />} onClick={() => (setQ(''), setParams({}, { replace: true }))}>
              ล้างตัวกรอง
            </Button>
          )}
        </div>

        {employees.error || sites.error ? (
          <div className="p-4">
            <ErrorState error={employees.error ?? sites.error} onRetry={() => (employees.reload(), sites.reload())} />
          </div>
        ) : (
          <DataGrid
            columns={columns}
            rows={sites.data ? employees.data : undefined}
            rowKey={(e) => e.id}
            loading={employees.loading || sites.loading}
            validate={(e) => validateEmployee(e)}
            onSave={save}
            newRow={blank}
            addLabel="เพิ่มแถว"
            onOpen={(e) => nav(`/employees/${e.id}`)}
            onDelete={setConfirmDelete}
            pageSize={25}
            page={page}
            onPageChange={(p) => update('page', p > 1 ? String(p) : '')}
            empty={<EmptyState icon={<UserX />} title="ไม่พบพนักงาน" description={hasFilter ? 'ลองเปลี่ยนคำค้นหรือล้างตัวกรอง' : 'กด “เพิ่มแถว” เพื่อเริ่มกรอกข้อมูล'} />}
          />
        )}
      </Card>

      <Modal
        open={!!confirmDelete}
        onClose={() => !deleting && setConfirmDelete(null)}
        title="ลบพนักงาน?"
        description={confirmDelete ? `${confirmDelete.firstName} ${confirmDelete.lastName} (${confirmDelete.empCode})` : ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)} disabled={deleting}>
              ยกเลิก
            </Button>
            <Button variant="danger" icon={<Trash2 />} loading={deleting} onClick={doDelete}>
              ลบถาวร
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-muted">
          ใช้สำหรับลบข้อมูลที่บันทึกผิดเท่านั้น — ถ้าพนักงานมีประวัติแจ้งประกันหรือแจกชุดแล้ว ระบบจะไม่ให้ลบ ให้ใช้ “บันทึกพ้นสภาพ” แทน
        </p>
      </Modal>
    </>
  );
}
